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

  // async login(data: LoginRequest): Promise<LoginResponse> {
  //   const user = await this.findByUsername(data.username);
  //   if (!user) throw new Error('User not found');

  //   const passwordMatch = await bcrypt.compare(data.password, user.password);
  //   if (!passwordMatch) throw new UnauthorizedException('Invalid password');

  //   const otp = Math.floor(100000 + Math.random() * 900000).toString();

  //   user.otp = otp; 
  //   user.otpCreatedAt = new Date();
  //   await this.saveUser(user);

  //   await this.mailerService.sendMail({
  //     to: user.email,
  //     subject: 'Xác thực đăng nhập – Ngọc Rồng Online',
  //     html: `
  //     <meta name="color-scheme" content="light dark">
  //     <meta name="supported-color-schemes" content="light dark">

  //     <div style="
  //       font-family: Arial, sans-serif;
  //       background: #0f172a !important;
  //       color: #f8fafc !important;
  //       padding: 20px;
  //       border-radius: 12px;
  //       max-width: 450px;
  //       margin: auto;
  //       border: 2px solid #38bdf8 !important;
  //     ">
  //       <div style="text-align: center; margin-bottom: 12px;">
  //         <img src="https://i.postimg.cc/vHgpK4JX/avt9.webp"
  //           alt="Ngọc Rồng Online Logo"
  //           style="
  //             width: 120px;
  //             height: 120px;
  //             object-fit: cover;
  //             border-radius: 50%;
  //             border: 2px solid #38bdf8;
  //             box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
  //           " />
  //       </div>

  //       <h2 style="text-align:center; margin-bottom: 12px; color: #38bdf8 !important;">
  //         NGỌC RỒNG ONLINE
  //       </h2>

  //       <p style="font-size:14px; line-height:1.5; color: #f8fafc !important;">
  //         Xin chào ${user.realname},<br/>
  //         Bạn đang yêu cầu đăng nhập tài khoản. Vui lòng dùng mã bên dưới để xác thực:
  //       </p>

  //       <div style="
  //         margin: 20px auto;
  //         padding: 12px 0;
  //         background: #1e293b !important;
  //         border-radius: 10px;
  //         text-align:center;
  //         border: 1px solid #38bdf8 !important;
  //       ">
  //         <span style="
  //           font-size: 28px;
  //           font-weight: bold;
  //           color: #38bdf8 !important;
  //           font-family: 'Courier New', monospace;
  //         ">
  //           ${otp}
  //         </span>
  //       </div>

  //       <p style="font-size:14px; color: #f8fafc !important;">
  //         Mã OTP có hiệu lực trong <b>5 phút</b>.<br/>
  //         Không cung cấp mã cho bất kỳ ai để tránh mất tài khoản.
  //       </p>

  //       <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />

  //       <div style="text-align:center; font-size:12px; color:#94a3b8 !important;">
  //         © Ngọc Rồng Online – 2025 <br/>
  //         Nếu có thắc mắc vui lòng liên hệ admin Hải Đăng
  //       </div>
  //     </div>
  //     `,
  //   });


  //   const sessionId = Buffer.from(user.username).toString('base64');
  //   return { sessionId };
  // }

  // async verifyOtp(data : VerifyOtpRequest): Promise<VerifyOtpResponse> {
  //   const username = Buffer.from(data.sessionId, 'base64').toString('ascii');
  //   const user = await this.findByUsername(username);

  //   if (!user || user.otp !== data.otp)
  //     throw new UnauthorizedException('OTP sai hoặc hết hạn');

  //   const MAX_AGE = 5 * 60 * 1000;
  //   if (!user.otpCreatedAt || Date.now() - user.otpCreatedAt.getTime() > MAX_AGE) {
  //     throw new UnauthorizedException('OTP đã hết hạn');
  //   }
    
  //   user.otp = "";
  //   await this.saveUser(user);

  //   const payload = { username: user.username, role: user.role };

  //   const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
  //   const refreshToken = this.jwtService.sign(
  //     { username: user.username },
  //     { expiresIn: '7d' }
  //   );

  //   return {
  //     access_token: accessToken,
  //     refresh_token: refreshToken
  //   };
  // }

    async login(data: LoginRequest): Promise<LoginResponse> {
      const user = await this.findByUsername(data.username);
      if (!user) throw new Error('User not found');

      const passwordMatch = await bcrypt.compare(data.password, user.password);
      if (!passwordMatch) throw new UnauthorizedException('Invalid password');

      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      await this.cacheManager.set(`OTP:${user.username}`, otp, 5 * 60 * 1000);

      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Xác thực đăng nhập – Ngọc Rồng Online',
        html: `
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">

        <div style="
          font-family: Arial, sans-serif;
          background: #0f172a !important;
          color: #f8fafc !important;
          padding: 20px;
          border-radius: 12px;
          max-width: 450px;
          margin: auto;
          border: 2px solid #38bdf8 !important;
        ">
          <div style="text-align: center; margin-bottom: 12px;">
            <img src="https://i.postimg.cc/vHgpK4JX/avt9.webp"
              alt="Ngọc Rồng Online Logo"
              style="
                width: 120px;
                height: 120px;
                object-fit: cover;
                border-radius: 50%;
                border: 2px solid #38bdf8;
                box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
              " />
          </div>

          <h2 style="text-align:center; margin-bottom: 12px; color: #38bdf8 !important;">
            NGỌC RỒNG ONLINE
          </h2>

          <p style="font-size:14px; line-height:1.5; color: #f8fafc !important;">
            Xin chào ${user.realname},<br/>
            Bạn đang yêu cầu đăng nhập tài khoản. Vui lòng dùng mã bên dưới để xác thực:
          </p>

          <div style="
            margin: 20px auto;
            padding: 12px 0;
            background: #1e293b !important;
            border-radius: 10px;
            text-align:center;
            border: 1px solid #38bdf8 !important;
          ">
            <span style="
              font-size: 28px;
              font-weight: bold;
              color: #38bdf8 !important;
              font-family: 'Courier New', monospace;
            ">
              ${otp}
            </span>
          </div>

          <p style="font-size:14px; color: #f8fafc !important;">
            Mã OTP có hiệu lực trong <b>5 phút</b>.<br/>
            Không cung cấp mã cho bất kỳ ai để tránh mất tài khoản.
          </p>

          <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />

          <div style="text-align:center; font-size:12px; color:#94a3b8 !important;">
            © Ngọc Rồng Online – 2025 <br/>
            Nếu có thắc mắc vui lòng liên hệ admin Hải Đăng
          </div>
        </div>
        `,
      });


      const sessionId = Buffer.from(user.username).toString('base64');
      return { sessionId };
    }

  async verifyOtp(data : VerifyOtpRequest): Promise<VerifyOtpResponse> {
    const username = Buffer.from(data.sessionId, 'base64').toString('ascii');
    const user = await this.findByUsername(username);

    if (!user)
      throw new UnauthorizedException('User không tồn tại');

    const otpInCache = await this.cacheManager.get<string>(`OTP:${username}`);

    if (!otpInCache || otpInCache !== data.otp) {
      throw new UnauthorizedException('OTP sai hoặc hết hạn');
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

  // async refresh(refreshToken: string): Promise<{ access_token: string }> {
  //   try {
  //     const decoded = this.jwtService.verify(refreshToken);

  //     const user = await this.findByUsername(decoded.username);
  //     if (!user || user.biBan) {
  //       throw new UnauthorizedException('User not allowed');
  //     }

  //     const newAccessToken = this.jwtService.sign(
  //       { username: decoded.username },
  //       { expiresIn: '15m' }
  //     );

  //     return { access_token: newAccessToken };
  //   } catch (error) {
  //     throw new UnauthorizedException('Invalid refresh token');
  //   }
  // }
  async refresh(refreshToken: string): Promise<{ access_token: string }> {
    try {
      const decoded = this.jwtService.verify(refreshToken);

      const username = decoded.username;

      // Lấy token đã lưu trong Redis
      const savedToken = await this.cacheManager.get<string>(`REFRESH:${username}`);

      if (!savedToken || savedToken !== refreshToken) {
        throw new UnauthorizedException('Refresh token invalid or expired');
      }

      const user = await this.findByUsername(username);
      if (!user || user.biBan) {
        throw new UnauthorizedException('User not allowed');
      }

      // Tạo Access token mới
      const newAccessToken = this.jwtService.sign(
        { username: username },
        { expiresIn: '15m' }
      );

      // Rotate refresh token cho bảo mật
      const newRefreshToken = this.jwtService.sign(
        { username: username },
        { expiresIn: '7d' }
      );

      // Ghi đè lại refresh token cũ trong Redis
      await this.cacheManager.set(
        `REFRESH:${username}`,
        newRefreshToken,
        7 * 24 * 60 * 60 * 1000
      );

      return { access_token: newAccessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}