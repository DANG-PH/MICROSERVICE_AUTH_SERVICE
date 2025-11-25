import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthEntity } from './auth.entity';
import * as bcrypt from 'bcrypt';
import type {GetEmailUserRequest, GetEmailUserResponse, ChangeRolePartnerRequest, ChangeRolePartnerResponse, RequestResetPasswordRequest, RequestResetPasswordResponse, LoginRequest,LoginResponse, RegisterResponse, RegisterRequest, VerifyOtpRequest, VerifyOtpResponse, ChangeEmailRequest, ChangeEmailResponse, ChangePasswordRequest, ChangePasswordResponse, ChangeRoleRequest, ChangeRoleResponse, ResetPasswordRequest, ResetPasswordResponse, BanUserRequest, BanUserResponse, UnbanUserRequest, UnbanUserResponse, GetProfileRequest, GetProfileReponse, SendEmailToUserRequest, SendemailToUserResponse } from 'proto/auth.pb';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';
import { otpEmailTemplate } from 'src/template/otp.template';
import { ManagerEmailTemplate, securityAlertEmailTemplate, resetPasswordEmailTemplate, changeEmailConfirmationTemplate, otpResetPassTemplate } from 'src/template/otp.template';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { ClientProxy } from '@nestjs/microservices';
import { PayService } from 'src/pay/pay.service';
import * as crypto from 'crypto';
import { ref } from 'process';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AuthEntity)
    private readonly userRepository: Repository<AuthEntity>,
    private jwtService: JwtService,
    private mailerService: MailerService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(String(process.env.RABBIT_SERVICE)) private readonly emailClient: ClientProxy,
    private readonly payService: PayService,
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
    if (exists)  throw new RpcException({code: status.UNAUTHENTICATED ,message: 'Đã tồn tại User'});

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

    return { success: true, auth_id: userMoi.id };
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({code: status.UNAUTHENTICATED ,message: 'User not found'});

    const isOnline = await this.cacheManager.get(`online:${data.username}`);
    if (isOnline) { 
      const lastMailTime = await this.cacheManager.get<number>(`MAIL_SENT_ONLINE:${user.username}`);
      const now = Date.now();

      if (!lastMailTime || now - lastMailTime > 5 * 60 * 1000) { // 5 phút
        const html = ManagerEmailTemplate(
          "CẢNH BÁO BẢO MẬT",
          "Hệ thống vừa phát hiện một nỗ lực đăng nhập đáng ngờ từ thiết bị hoặc địa điểm lạ vào tài khoản của bạn. Để bảo vệ tài khoản, vui lòng reset mật khẩu ngay lập tức. Nếu không phải bạn thực hiện, hãy liên hệ với bộ phận hỗ trợ để được trợ giúp và tránh rủi ro mất quyền truy cập. An toàn của bạn là ưu tiên hàng đầu!",
          user.realname
        );
        this.mailerService.sendMail({
          to: user.email,
          subject: "CẢNH BÁO BẢO MẬT",
          html
        });

        await this.cacheManager.set(`MAIL_SENT_ONLINE:${user.username}`, now, 5 * 60 * 1000); // lưu trong 5 phút
      }
      throw new RpcException({code: status.PERMISSION_DENIED , message: 'Tài khoản đang online, nếu không phải bạn vui lòng yêu cầu reset mật khẩu.'});
    };

    const isLocked = await this.cacheManager.get(`LOCK:${data.username}`);
    if (isLocked) throw new RpcException({code: status.PERMISSION_DENIED , message: 'Tài khoản bị vô hiệu 10 phút do sai thông tin đăng nhập quá nhiều.'});

    const passwordMatch = await bcrypt.compare(data.password, user.password);
    if (!passwordMatch) {
      const attempts = await this.incrementLoginAttempt(data.username);

      if (attempts > 5) {
        await this.cacheManager.set(`LOCK:${user.username}`, true, 10 * 60 * 1000);
        // this.emailClient.emit('send_email', {
        //   to: user.email,
        //   subject: 'Cảnh báo bảo mật – Tài khoản bị khóa tạm thời',
        //   html: securityAlertEmailTemplate(user.realname),
        // }); // cách dùng rabbitMQ
        this.mailerService.sendMail({ // bỏ await để tránh user đợi lâu, cách thường
          to: user.email,
          subject: 'Cảnh báo bảo mật – Tài khoản bị khóa tạm thời',
          html: securityAlertEmailTemplate(user.realname,user.username),
        });
        throw new RpcException({code: status.UNAUTHENTICATED , message: 'Sai mật khẩu quá nhiều. Tài khoản bị vô hiệu 10 phút'});
      }

      throw new RpcException({code: status.UNAUTHENTICATED ,message: 'Sai mật khẩu, vui lòng thử lại'});
    }

    if (user.biBan) throw new RpcException({code: status.PERMISSION_DENIED , message: 'Tài khoản đã bị khóa, vui lòng liên hệ Admin'});

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await this.cacheManager.set(`OTP:${user.username}`, otp, 5 * 60 * 1000);

    // thay vì gửi mail luôn thì mình dùng rabbitMQ để xử lí bất đồng bộ
    // this.emailClient.emit('send_email', {
    //   to: user.email,
    //   subject: 'Xác thực đăng nhập – Ngọc Rồng Online',
    //   html: otpEmailTemplate(user, otp),
    // });

    this.mailerService.sendMail({
      to: user.email,
      subject: 'Xác thực đăng nhập – Ngọc Rồng Online',
      html: otpEmailTemplate(user, otp),
    });


    const sessionId = Buffer.from(user.username).toString('base64');
    return { sessionId };
  }

  async checkAccount(data: LoginRequest): Promise<LoginResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({code: status.NOT_FOUND ,message: 'Tài khoản không tồn tại trong hệ thống'});

    if (user.biBan) throw new RpcException({code: status.PERMISSION_DENIED , message: 'Tài khoản đã bị khóa, không thể đăng bán'});

    const passwordMatch = await bcrypt.compare(data.password, user.password);
    if (!passwordMatch) {
      throw new RpcException({code: status.UNAUTHENTICATED ,message: 'Sai mật khẩu, vui lòng thử lại'});
    }
    
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

    const payload = { userId: user.id, username: user.username, role: user.role };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1d' }); // tamj thoi de 1d thay 15m
    const refreshToken = this.jwtService.sign(
      { username: user.username },
      { expiresIn: '7d' }
    );

    const hashed = crypto.createHash('sha256')
                      .update(refreshToken)
                      .digest('hex'); // nếu bỏ digest thì hashed là giá trị binary khó đọc, có thể dùng hex hoặc base64


    await this.cacheManager.set(
      `ACCESS:${user.username}`,
      accessToken,
      1 * 24 * 60 * 60 * 1000 // 1 ngày
    );

    await this.cacheManager.set(
      `REFRESH:${user.username}`,
      hashed,
      7 * 24 * 60 * 60 * 1000 // 7 ngày
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      auth_id: user.id,
      role: user.role
    };
  }

  async refresh(refreshToken: string): Promise<{ access_token: string, refresh_token: string }> {
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
        { userId: user.id, username: username, role: user.role },
        { expiresIn: '1d' }
      );

      const newRefreshToken = this.jwtService.sign(
        { username: username },
        { expiresIn: '7d' }
      );

      const hashed = crypto.createHash('sha256')
                           .update(newRefreshToken)
                           .digest('hex'); // nếu bỏ digest thì hashed là giá trị binary khó đọc, có thể dùng hex hoặc base64

      const ttl = await this.cacheManager.ttl(`REFRESH:${username}`);

      const timeConLaiTokenCu = (ttl || Date.now() + 7 * 24 * 60 * 60 * 1000) - Date.now();

      await this.cacheManager.set(
        `ACCESS:${user.username}`,
        newAccessToken,
        1 * 24 * 60 * 60 * 1000 // 1 ngày
      );

      await this.cacheManager.set(
        `REFRESH:${username}`,
        hashed,
        timeConLaiTokenCu // 7 * 24 * 60 * 60 * 1000 (Nếu muốn login vô hạn)
      );

      return { 
        access_token: newAccessToken,
        refresh_token: newRefreshToken
      };
    } catch (error) {
      throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Invalid refresh token'
      });
    }
  }

  // ===== USER METHODS =====
  async changePassword(data: ChangePasswordRequest): Promise<ChangePasswordResponse> {
    const username = Buffer.from(data.sessionId, 'base64').toString('ascii');
    const user = await this.findByUsername(username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    const isMatch = await bcrypt.compare(data.oldPassword, user.password);
    if (!isMatch) throw new RpcException({ code: status.UNAUTHENTICATED, message: 'Mật khẩu cũ không đúng, không thể đổi mật khẩu' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(data.newPassword, salt);

    // xóa access để kick user 
    await this.cacheManager.del(`ACCESS:${user.username}`);

    await this.saveUser(user);
    return { success: true };
  }

  async requestResetPassword(data: RequestResetPasswordRequest): Promise<RequestResetPasswordResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 số

    await this.cacheManager.set(`RESET_OTP:${user.username}`, otp, 5 * 60 * 1000);

    // Gửi mail OTP

    // this.emailClient.emit('send_email', {
    //   to: user.email,
    //   subject: 'OTP reset mật khẩu',
    //   html: otpResetPassTemplate(user.realname, otp)
    // });
    
    this.mailerService.sendMail({
      to: user.email,
      subject: 'OTP reset mật khẩu',
      html: otpResetPassTemplate(user.realname,user.username, otp)
    });

    return { success: true };
  }

  async resetPassword(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    const otpInCache = await this.cacheManager.get<string>(`RESET_OTP:${user.username}`);
    if (!otpInCache || otpInCache !== data.otp) {
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'OTP sai hoặc hết hạn' });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(data.newPassword, salt);
    user.password = newPasswordHash;

    await this.saveUser(user);
    await this.cacheManager.del(`RESET_OTP:${user.username}`);
    // xóa access để kick user 
    await this.cacheManager.del(`ACCESS:${user.username}`);

    // this.emailClient.emit('send_email', {
    //   to: user.email,
    //   subject: 'Mật khẩu đã được đặt lại',
    //   html: resetPasswordEmailTemplate(user),
    // });

    this.mailerService.sendMail({
      to: user.email,
      subject: 'Mật khẩu đã được đặt lại',
      html: resetPasswordEmailTemplate(user),
    });

    return { success: true };
  }

  async changeEmail(data: ChangeEmailRequest): Promise<ChangeEmailResponse> {
    const username = Buffer.from(data.sessionId, 'base64').toString('ascii');
    const user = await this.findByUsername(username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    user.email = data.newEmail;
    await this.saveUser(user);

    // Optional: send email xác nhận

    // this.emailClient.emit('send_email', {
    //   to: user.email,
    //   subject: 'Email đã được cập nhật',
    //   html: changeEmailConfirmationTemplate(user, data.newEmail),
    // });

    this.mailerService.sendMail({
      to: user.email,
      subject: 'Email đã được cập nhật',
      html: changeEmailConfirmationTemplate(user, data.newEmail),
    });
    return { success: true };
  }

  // ===== ADMIN METHODS =====
  async changeRole(data: ChangeRoleRequest): Promise<ChangeRoleResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    user.role = data.newRole;
    await this.saveUser(user);
    return { success: true };
  }

  async banUser(data: BanUserRequest): Promise<BanUserResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });
    if (user.role == "ADMIN") throw new RpcException({ code: status.PERMISSION_DENIED, message: 'ADMIN không thể bị ban' })

    user.biBan = true;
    await this.saveUser(user);
    return { success: true };
  }

  async unbanUser(data: UnbanUserRequest): Promise<UnbanUserResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });
    if (user.role == "ADMIN") throw new RpcException({ code: status.PERMISSION_DENIED, message: 'User trên là ADMIN' })

    user.biBan = false;
    await this.saveUser(user);
    return { success: true };
  }

  async changeRolePartner(data: ChangeRolePartnerRequest): Promise<ChangeRolePartnerResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    const payResp = await this.payService.getPay({userId: user.id});
    const userBalance = Number(payResp.pay?.tien) || 0;

    if (50000 > userBalance) {
      throw new RpcException({ status: status.FAILED_PRECONDITION, message: 'Số dư không đủ để nâng role Partner' });
    }
    
    if (user.role !== "USER") throw new RpcException({ status: status.ALREADY_EXISTS, message: 'Bạn đã có role đặc biệt' });
    user.role = "PARTNER"
    await this.userRepository.save(user);
  
    await this.payService.updateMoney({userId: user.id, amount: -50000})
    return { success: true };
  }

  async getEmailUser(data: GetEmailUserRequest): Promise<GetEmailUserResponse> {
    const user = await this.userRepository.findOne({ where: { id: data.id } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    return { email: user.email };
  }

  async getProfile(data: GetProfileRequest): Promise<GetProfileReponse> {
    const user = await this.userRepository.findOne({ where: { id: data.id } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    return { 
      biBan: user.biBan,
      role: user.role
    };
  }

  async sendEmailToUser(data: SendEmailToUserRequest): Promise<SendemailToUserResponse> {

    if (data.who.toUpperCase() === "ALL") {
      const html = ManagerEmailTemplate(data.title, data.content);
      const emails = Array.from(new Set((await this.userRepository.find({ select: ['email'] })).map(e => e.email)));

      this.emailClient.emit('send_emails', { emails, subject: data.title, html });
    } else {
      const user = await this.findByUsername(data.who);
      if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

      const html = ManagerEmailTemplate(data.title, data.content, user.realname, user.username);
      this.emailClient.emit('send_email', { to: user.email, subject: data.title, html });
    }

    return { success: true };
  }


  private async incrementLoginAttempt(username: string): Promise<number> {
    const key = `LOGIN_FAIL:${username}`;
    let attempts = (await this.cacheManager.get<number>(key)) || 0;
    attempts++;
    await this.cacheManager.set(key, attempts, 15 * 60 * 1000); 
    return attempts;
  }
}