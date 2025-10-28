import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthEntity } from './auth.entity';
import * as bcrypt from 'bcrypt';
import type { LoginRequest,LoginResponse, RegisterResponse, RegisterRequest, RefreshRequest, RefreshResponse, VerifyOtpRequest, VerifyOtpResponse } from 'proto/auth.pb';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';
import { otpEmailTemplate } from 'src/template/otp.template';
import { securityAlertEmailTemplate } from 'src/template/otp.template';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AuthEntity)
    private readonly userRepository: Repository<AuthEntity>,
    private jwtService: JwtService,
    private mailerService: MailerService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async saveUser(user: AuthEntity): Promise<AuthEntity> {
    return await this.userRepository.save(user);
  }

  async getAllUsers(): Promise<AuthEntity[]> {
    return await this.userRepository.find();
  }

  async existsByUsername(username: string): Promise<boolean> {
    const count = await this.userRepository.count({ where: { username } });
    return count > 0;
  }

  async findByUsername(username: string): Promise<AuthEntity | null> {
    return await this.userRepository.findOne({ where: { username } });
  }

  async register(data: RegisterRequest): Promise<RegisterResponse> {
    const exists = await this.existsByUsername(data.username);
    if (exists) return { success: false };

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    const userMoi = new AuthEntity();
    userMoi.username = data.username;
    userMoi.password = passwordHash;
    userMoi.email = data.email;
    userMoi.realname = data.realname;
    userMoi.role = 'USER';
    userMoi.biBan = false;

    await this.saveUser(userMoi);

    // gọi user-service tạo profile
    // await this.userService.createProfile({ userId: userMoi.id, name: data.name, avatar: data.avatar });

    return { success: true };
  }

    async login(data: LoginRequest): Promise<LoginResponse> {
      const user = await this.findByUsername(data.username);
      if (!user) throw new RpcException({code: status.UNAUTHENTICATED ,message: 'User not found'});

      const isLocked = await this.cacheManager.get(`LOCK:${data.username}`);
      if (isLocked) throw new RpcException({code: status.PERMISSION_DENIED , message: 'Account temporarily locked. Try again later.'});

      const passwordMatch = await bcrypt.compare(data.password, user.password);
      if (!passwordMatch) {
        const attempts = await this.incrementLoginAttempt(data.username);

        if (attempts > 5) {
          await this.cacheManager.set(`LOCK:${user.username}`, true, 10 * 60 * 1000);
          await this.sendSecurityAlertMail(user.email);
          throw new RpcException({code: status.UNAUTHENTICATED , message: 'Sai mật khẩu quá nhiều. Tài khoản bị vô hiệu 10 phút'});
        }

        throw new RpcException({code: status.UNAUTHENTICATED ,message: 'Sai mật khẩu, vui lòng thử lại'});
      }
      
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      await this.cacheManager.set(`OTP:${user.username}`, otp, 5 * 60 * 1000);

      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Xác thực đăng nhập – Ngọc Rồng Online',
        html: otpEmailTemplate(user, otp),
      });


      const sessionId = Buffer.from(user.username).toString('base64');
      return { sessionId };
    }

  async verifyOtp(data : VerifyOtpRequest): Promise<VerifyOtpResponse> {
    const username = Buffer.from(data.sessionId, 'base64').toString('ascii');
    const user = await this.findByUsername(username);

    if (!user) throw new RpcException({ code: status.UNAUTHENTICATED, message: 'User not found'});
    
    const otpInCache = await this.cacheManager.get<string>(`OTP:${username}`);

    if (!otpInCache || otpInCache !== data.otp) {
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'OTP sai hoặc hết hạn'});
    }

    // Xóa OTP sau khi sử dụng
    await this.cacheManager.del(`OTP:${username}`);

    const payload = { username: user.username, role: user.role };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(
      { username: user.username },
      { expiresIn: '7d' }
    );

    await this.cacheManager.set(
      `REFRESH:${user.username}`,
      refreshToken,
      7 * 24 * 60 * 60 * 1000 // 7 ngày
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken
    };
  }

  async refresh(refreshToken: string): Promise<{ access_token: string }> {
    try {
      const decoded = this.jwtService.verify(refreshToken);

      const username = decoded.username;

      const savedToken = await this.cacheManager.get<string>(`REFRESH:${username}`);

      if (!savedToken || savedToken !== refreshToken) {
        throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Invalid refresh token'
        });
      }

      const user = await this.findByUsername(username);
      if (!user || user.biBan) {
        throw new RpcException({ code: status.UNAUTHENTICATED, message: 'User not allowed' });
      }

      const newAccessToken = this.jwtService.sign(
        { username: username },
        { expiresIn: '15m' }
      );

      const newRefreshToken = this.jwtService.sign(
        { username: username },
        { expiresIn: '7d' }
      );

      await this.cacheManager.set(
        `REFRESH:${username}`,
        newRefreshToken,
        7 * 24 * 60 * 60 * 1000
      );

      return { access_token: newAccessToken };
    } catch (error) {
      throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Invalid refresh token'
      });
    }
  }

  private async incrementLoginAttempt(username: string): Promise<number> {
    const key = `LOGIN_FAIL:${username}`;
    let attempts = (await this.cacheManager.get<number>(key)) || 0;
    attempts++;
    await this.cacheManager.set(key, attempts, 15 * 60 * 1000); 
    return attempts;
  }

  private async sendSecurityAlertMail(email: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Cảnh báo bảo mật – Tài khoản bị khóa tạm thời',
      html: securityAlertEmailTemplate({ realname: email }),
    });
  }
}