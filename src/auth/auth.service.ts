import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager, LessThanOrEqual } from 'typeorm';
import { AuthEntity } from './auth.entity';
import * as bcrypt from 'bcrypt';
import type {GetEmailUserRequest, GetEmailUserResponse, ChangeRolePartnerRequest, ChangeRolePartnerResponse, RequestResetPasswordRequest, RequestResetPasswordResponse, LoginRequest,LoginResponse, RegisterResponse, RegisterRequest, VerifyOtpRequest, VerifyOtpResponse, ChangeEmailRequest, ChangeEmailResponse, ChangePasswordRequest, ChangePasswordResponse, ChangeRoleRequest, ChangeRoleResponse, ResetPasswordRequest, ResetPasswordResponse, BanUserRequest, BanUserResponse, UnbanUserRequest, UnbanUserResponse, GetProfileRequest, GetProfileReponse, SendEmailToUserRequest, SendemailToUserResponse, ChangeAvatarRequest, ChangeAvatarResponse, GetRealnameAvatarRequest, GetRealnameAvatarResponse, GetAllUserRequest, GetAllUserResponse, LoginWithGoogleRequest, LoginWithGoogleResponse, GetTokenVersionRequest, GetTokenVersionResponse, GetBanRequest, GetBanResponse, SystemChangePasswordRequest, SystemChangePasswordResponse, SetTokenVersionResponse, SetTokenVersionRequest, GetEmailUserByUsernameRequest, GetEmailUserByUsernameResponse, LogoutRequest } from 'proto/auth.pb';
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
import { OAuth2Client } from 'google-auth-library';
import { TokenPayload } from 'google-auth-library';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { IdempotencyKey } from './idempotency.entity';
import { RegisterOutbox } from './register-outbox.entity';
import { RegisterPayload } from 'src/types/register.type';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
  private client: OAuth2Client;
  constructor(
    @InjectRepository(AuthEntity)
    private readonly userRepository: Repository<AuthEntity>,
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepository: Repository<IdempotencyKey>,
    @InjectRepository(RegisterOutbox)
    private readonly outboxRepo: Repository<RegisterOutbox>,
    private jwtService: JwtService,
    private mailerService: MailerService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(String(process.env.RABBIT_SERVICE)) private readonly emailClient: ClientProxy,
    @Inject(String(process.env.RABBIT_USER_SERVICE)) private readonly userClient: ClientProxy,
    private readonly payService: PayService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly userService: UserService,
  ) {
      this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

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
    if (data.username.includes("@gmail.com")) throw new RpcException({code: status.UNAUTHENTICATED ,message: 'Username không thể là email'});
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
    userMoi.type = 0;
    userMoi.biBan = false;

    await this.saveUser(userMoi);

    return { success: true, auth_id: userMoi.id };
  }

  async registerSaga(data: RegisterRequest): Promise<RegisterResponse> {
    if (data.username.includes('@gmail.com'))
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'Username không thể là email' });

    const exists = await this.userRepository.findOne({ where: { username: data.username } });
    if (exists)
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'Đã tồn tại User' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);
    let authId: number;

    // ── 1 transaction: tạo auth + outbox ──────────────────────────────────────
    // Không cần SagaState vì chỉ có đúng 1 compensating action duy nhất: xóa auth
    // Dù crash ở bất kỳ đâu sau commit, cron chỉ cần biết authId là đủ để compensate
    // SagaState chỉ cần thiết khi có nhiều bước, cần biết bước nào đã chạy để compensate đúng chỗ
    await this.userRepository.manager.transaction(async (manager) => {
      const auth = manager.create(AuthEntity, {
        username: data.username,
        password: passwordHash,
        email: data.email,
        realname: data.realname,
        role: 'USER',
        type: 0,
        biBan: false,
      });
      await manager.save(auth);
      authId = auth.id;

      // Outbox ghi cùng transaction — đảm bảo không bao giờ mất event dù server crash
      // Nếu commit thành công → chắc chắn có outbox để cron pick up
      // Nếu crash trước commit → cả auth lẫn outbox đều rollback, không orphan record
      const outbox = manager.create(RegisterOutbox, {
        payload: { ...data, authId } as RegisterPayload,
        status: 'PENDING',
        nextRetryAt: new Date(),
      });
      await manager.save(outbox);
    });

    // ── Fast path: gọi user service ngay, đồng bộ ─────────────────────────────
    // Client chờ đến khi user service tạo xong mới nhận response
    // Cron chỉ là fallback khi server crash sau transaction commit nhưng trước khi fast path xong
    try {
      await this.callUserService(authId, data.gameName);
      // Đánh DONE ngay để cron không pick up lại
      await this.outboxRepo.update({ payload: { authId } as any }, { status: 'DONE' });
    } catch (error) {
      // Fast path fail → compensate xóa auth luôn
      // Không cần đọc SagaState vì chỉ có đúng 1 việc cần undo: xóa auth vừa tạo
      console.error(`[register] fast path fail → compensate authId: ${authId}`, error);
      await this.userRepository.delete({ id: authId }).catch((e) =>
        console.error(`[register] compensate deleteAuth failed authId: ${authId}`, e),
      );
      throw new RpcException({ code: status.INTERNAL, message: 'Đăng ký thất bại, vui lòng thử lại' });
    }

    return { success: true, auth_id: authId };
  }

  private async callUserService(authId: number, gameName: string): Promise<void> {
    const result = await this.userService.handleRegister({ id: authId, gameName });
    if (!result.success) throw new Error('User service trả về success: false');
  }

  // ─── CRON: Fallback khi server crash sau transaction commit ───────────────────
  // Trường hợp này xác suất rất thấp nhưng vẫn phải handle
  // Cron pick up outbox PENDING → thử gọi lại user service → compensate nếu hết retry

  @Cron(CronExpression.EVERY_5_SECONDS)
  async pollOutbox(): Promise<void> {
    const events = await this.outboxRepo.find({
      where: { status: 'PENDING', nextRetryAt: LessThanOrEqual(new Date()) },
      order: { createdAt: 'ASC' },
      take: 20,
    });

    for (const event of events) {
      // Optimistic lock: tránh 2 instance cron pick up cùng 1 event khi scale ngang
      const result = await this.outboxRepo.update(
        { id: event.id, status: 'PENDING' },
        { status: 'PROCESSING' },
      );
      if (result.affected === 0) continue;

      await this.processOutboxEvent(event).catch((e) =>
        console.error(`[cron] Unexpected error outbox ${event.id}`, e),
      );
    }
  }

  // ─── CRON: Recover stuck PROCESSING ──────────────────────────────────────────
  // Khi server crash đúng lúc đang PROCESSING → status bị treo mãi ở PROCESSING
  // Reset về PENDING để cron pick up lại sau 5 phút

  @Cron('*/30 * * * * *')
  async recoverStuckProcessing(): Promise<void> {
    const stuckThreshold = new Date(Date.now() - 5 * 60_000);
    await this.outboxRepo.update(
      { status: 'PROCESSING', updatedAt: LessThanOrEqual(stuckThreshold) },
      { status: 'PENDING' },
    );
  }

  async processOutboxEvent(event: RegisterOutbox): Promise<void> {
    const payload = event.payload as RegisterPayload;

    // Auth còn tồn tại không? Nếu không → fast path đã compensate xóa rồi → bỏ qua
    const authExists = await this.userRepository.findOne({ where: { id: payload.authId } });
    if (!authExists) {
      await this.outboxRepo.update(event.id, {
        status: 'FAILED',
        lastError: 'auth not found — đã compensate ở fast path',
      });
      return;
    }

    try {
      await this.callUserService(payload.authId, payload.gameName);
      await this.outboxRepo.update(event.id, { status: 'DONE' });
    } catch (error) {
      await this.handleFailure(event, error);
    }
  }

  private async handleFailure(event: RegisterOutbox, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const payload = event.payload as RegisterPayload;

    if (event.retries < event.maxRetries) {
      // Exponential backoff: 10s → 20s → 40s
      const delayMs = Math.pow(2, event.retries) * 10_000;
      await this.outboxRepo.update(event.id, {
        status: 'PENDING',
        retries: event.retries + 1,
        nextRetryAt: new Date(Date.now() + delayMs),
        lastError: errorMessage,
      });
      console.warn(`[register] retry ${event.retries + 1}/${event.maxRetries} outbox: ${event.id}`);
    } else {
      // Hết retry → compensate xóa auth
      // Không cần SagaState vì compensating action duy nhất là xóa auth — không cần biết thêm gì
      await this.userRepository.delete({ id: payload.authId }).catch((e) =>
        console.error(`[register] DEAD LETTER compensate failed authId: ${payload.authId}`, e),
      );
      await this.outboxRepo.update(event.id, { status: 'FAILED', lastError: errorMessage });
      console.error(`[register] DEAD LETTER authId: ${payload.authId}`, { errorMessage });
      // TODO: alert Discord/Slack để admin biết
    }
  }

  async login(data: LoginRequest, platform: string): Promise<LoginResponse> {
    const user = await this.findByUsername(data.username);
    if (!user)
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'User not found' });

    const isLocked = await this.cacheManager.get(`LOCK:${data.username}`);
    if (isLocked)
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Tài khoản bị vô hiệu 10 phút do sai thông tin đăng nhập quá nhiều.',
      });

    const passwordMatch = await bcrypt.compare(data.password, user.password);
    if (!passwordMatch) {
      const attempts = await this.incrementLoginAttempt(data.username);
      if (attempts > 5) {
        await this.cacheManager.set(`LOCK:${user.username}`, true, 10 * 60 * 1000);
        this.emailClient.emit('send_email', {
          to: user.email,
          subject: 'Cảnh báo bảo mật – Tài khoản bị khóa tạm thời',
          html: securityAlertEmailTemplate(user.realname, user.username),
        });
        throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Sai mật khẩu quá nhiều. Tài khoản bị vô hiệu 10 phút',
        });
      }
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'Sai mật khẩu, vui lòng thử lại' });
    }

    if (user.biBan)
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Tài khoản đã bị khóa, vui lòng liên hệ Admin',
      });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.cacheManager.set(`OTP:${user.username}`, otp, 5 * 60 * 1000);

    this.emailClient.emit('send_email', {
      to: user.email,
      subject: 'Xác thực đăng nhập – Ngọc Rồng Online',
      html: otpEmailTemplate(user, otp),
    });

    // Trả về sessionId tạm để FE gọi verifyOtp
    // Dùng base64(username) như cũ — chỉ là temp identifier, không phải session thật
    const tempId = Buffer.from(user.username).toString('base64');
    return { sessionId: tempId };
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

  async verifyOtp(data: VerifyOtpRequest, platform: string): Promise<VerifyOtpResponse> {
    const username = Buffer.from(data.sessionId, 'base64').toString('ascii');
    const user = await this.findByUsername(username);
    if (!user)
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'User not found' });

    const otpInCache = await this.cacheManager.get<string>(`OTP:${username}`);
    if (!otpInCache || otpInCache !== data.otp)
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'OTP sai hoặc hết hạn' });

    await this.cacheManager.del(`OTP:${username}`);

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      platform,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '1d',
    });
    const refreshToken = this.jwtService.sign(
      { username: user.username, jti: randomUUID() },
      { expiresIn: '7d' },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      auth_id: user.id,
      role: user.role,
    };
  }

  async logout(data: LogoutRequest) {
    // Trade-off ở đây
    // Nếu dùng access jti thì mỗi lần guard lại cần check
    // Tối ưu latency > consistency thì cần dùng refreshToken
    // Mỗi khi gọi refreshToken thì check jti có trong black list không là ok
    const decoded = this.jwtService.verify(data.refreshToken);

    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;

    const jti = decoded.jti;
    await this.redis.set(
      `blacklist:refresh:${jti}`,
      '1',
      'EX',
      ttl > 0 ? ttl : 0
    );
  }

  async refresh(refreshToken: string, platform: string): Promise<{ access_token: string, refresh_token: string }> {
    try {
      const refreshLua = `
        local key = KEYS[1]
        local ttl = tonumber(ARGV[1])

        if ttl == nil or ttl <= 0 then
          return 0
        end

        if redis.call("EXISTS", KEYS[1]) == 1 then
          return 0
        end

        redis.call("SET", KEYS[1], "1", "EX", ttl)
        return 1
      `;

      const decoded = this.jwtService.verify(refreshToken);

      const key = `blacklist:refresh:${decoded.jti}`;

      const now = Math.floor(Date.now() / 1000);
      const ttl = Math.max(decoded.exp - now, 0);

      const result = await this.redis.eval(
        refreshLua,
        1,
        key,
        ttl > 0 ? ttl : 0
      );

      if (result === 0) {
        throw new UnauthorizedException('Token reused or revoked');
      }

      const username = decoded.username;

      const user = await this.findByUsername(username);
      if (!user || user.biBan) {
        throw new RpcException({ code: status.UNAUTHENTICATED, message: 'User not allowed' });
      }

      const newAccessToken = this.jwtService.sign(
        { userId: user.id, username, role: user.role, platform, tokenVersion: user.tokenVersion, },
        { expiresIn: '1d' }
      );

      const newRefreshToken = this.jwtService.sign(
        { username, jti: randomUUID() }, 
        { expiresIn: '7d' }
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
  async changePassword(data: ChangePasswordRequest, platform: string): Promise<ChangePasswordResponse> {
    const username = Buffer.from(data.sessionId, 'base64').toString('ascii');
    const user = await this.findByUsername(username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    const isMatch = await bcrypt.compare(data.oldPassword, user.password);
    if (!isMatch) throw new RpcException({ code: status.UNAUTHENTICATED, message: 'Mật khẩu cũ không đúng, không thể đổi mật khẩu' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(data.newPassword, salt);
    await this.saveUser(user);
    await this.setTokenVersion(user.id);
    return { success: true };
  }

  async systemChangePassword(
    data: SystemChangePasswordRequest,
  ): Promise<SystemChangePasswordResponse> {
    const key = data.idempotencyKey;

    if (!key) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Thiếu idempotency key',
      });
    }

    return await this.userRepository.manager.transaction(
      'READ COMMITTED',
      async (manager) => {
        /**
         * STEP 1: claim key trước
         * request duplicate sẽ đụng unique key
         */
        try {
          await manager.insert(IdempotencyKey, {
            key,
            response: null,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
        } catch (err) {
          // duplicate key -> request khác đã claim rồi
        }

        /**
         * STEP 2: lock row idempotency
         * request cùng key khác sẽ phải chờ
         */
        const idem = await manager.findOne(IdempotencyKey, {
          where: { key },
          lock: { mode: 'pessimistic_write' },
        });

        if (!idem) {
          throw new RpcException({
            code: status.INTERNAL,
            message: 'Không tìm thấy idempotency key',
          });
        }

        /**
         * STEP 3: nếu đã xử lý xong thì trả cache response
         */
        if (idem.response) {
          return idem.response as SystemChangePasswordResponse;
        }

        /**
         * STEP 4: decode session
         */
        const username = Buffer.from(data.sessionId, 'base64').toString('ascii');

        const user = await manager.findOne(AuthEntity, {
          where: { username },
        });

        if (!user) {
          throw new RpcException({
            code: status.NOT_FOUND,
            message: 'User not found',
          });
        }

        /**
         * STEP 6: đổi password
         */
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(data.newPassword, salt);

        await manager.save(AuthEntity, user);

        /**
         * STEP 7: revoke token
         */
        await this.setTokenVersion(user.id, manager);

        /**
         * STEP 8: response
         */
        const response: SystemChangePasswordResponse = {
          success: true,
        };

        /**
         * STEP 9: cache response
         */
        idem.response = response;
        await manager.save(IdempotencyKey, idem);

        return response;
      },
    );
  }

  async requestResetPassword(data: RequestResetPasswordRequest): Promise<RequestResetPasswordResponse> {
    const user = await this.findByUsername(data.username);
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 số

    await this.cacheManager.set(`RESET_OTP:${user.username}`, otp, 5 * 60 * 1000);
    
    this.mailerService.sendMail({
      to: user.email,
      subject: 'OTP reset mật khẩu',
      html: otpResetPassTemplate(user.realname,user.username, otp)
    });

    return { success: true };
  }

  async resetPassword(data: ResetPasswordRequest, platform: string): Promise<ResetPasswordResponse> {
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
    await this.setTokenVersion(user.id);

    this.mailerService.sendMail({
      to: user.email,
      subject: 'Mật khẩu đã được đặt lại',
      html: resetPasswordEmailTemplate(user),
    });

    return { success: true };
  }

  async changeEmail(
    data: ChangeEmailRequest,
  ): Promise<ChangeEmailResponse> {
    const key = data.idempotencyKey;

    if (!key) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Thiếu idempotency key',
      });
    }

    return await this.userRepository.manager.transaction(
      'READ COMMITTED',
      async (manager) => {
        /**
         * STEP 1: claim key
         */
        try {
          await manager.insert(IdempotencyKey, {
            key,
            response: null,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
        } catch (err) {
          // duplicate key -> request khác đã tạo trước
        }

        const idem = await manager.findOne(IdempotencyKey, {
          where: { key },
          lock: { mode: 'pessimistic_write' },
        });

        if (!idem) {
          throw new RpcException({
            code: status.INTERNAL,
            message: 'Không tìm thấy idempotency key',
          });
        }

        if (idem.response) {
          return idem.response as ChangeEmailResponse;
        }

        const username = Buffer.from(data.sessionId,'base64',).toString('ascii');

        const user = await manager.findOne(AuthEntity, {
          where: { username },
          lock: { mode: 'pessimistic_write' },
        });

        if (!user) {
          throw new RpcException({
            code: status.NOT_FOUND,
            message: 'User not found',
          });
        }

        user.email = data.newEmail;
        await manager.save(AuthEntity, user);

        const response: ChangeEmailResponse = {
          success: true,
        };

        idem.response = response;
        await manager.save(IdempotencyKey, idem);

        setImmediate(async () => {
          try {
            await this.mailerService.sendMail({
              to: data.newEmail,
              subject: 'Email đã được cập nhật',
              html: changeEmailConfirmationTemplate(
                user,
                data.newEmail,
              ),
            });
          } catch (err) {
            console.error('Send mail failed:', err);
          }
        });

        return response;
      },
    );
  }

  async changeAvatar(data: ChangeAvatarRequest): Promise<ChangeAvatarResponse> {
    const user = await this.userRepository.findOne({ where : { id: data.userId }});
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    user.avatarUrl = data.avatarUrl;
    await this.saveUser(user);

    // Event driven qua user để sync avatar
    // Thay vì dùng gRPC gọi thì chỗ này dùng event pub/sub để giảm latency
    // Eventual consistency cho avatar là hợp lý
    // Vì sao cần sync?
    // Vì avatarUrl xuất hiện ở 2 DB, user service cũng cần avatarUrl để trả về client với top bxh,...
    // Nếu mỗi lần đều gọi sang Auth để check thì giảm performance và có nguy cơ trở thành bottleneck
    // Nên ta chấp nhận duplicate data và eventual consistency sync sau để tăng performance và giảm latency
    this.userClient.emit('UserProfileUpdated', {
      userId: user.id,
      avatarUrl: user.avatarUrl,
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
    return { success: true, userId: user.id };
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
      throw new RpcException({ code: status.FAILED_PRECONDITION, message: 'Số dư không đủ để nâng role Partner' });
    }
    
    if (user.role !== "USER") throw new RpcException({ code: status.ALREADY_EXISTS, message: 'Bạn đã có role đặc biệt' });
    user.role = "PARTNER"
    await this.userRepository.save(user);
  
    await this.payService.updateMoney({userId: user.id, amount: -50000, idempotencyKey: "CHANGE_ROLE: "+randomUUID()})
    return { success: true };
  }

  async getEmailUser(data: GetEmailUserRequest): Promise<GetEmailUserResponse> {
    const user = await this.userRepository.findOne({ where: { id: data.id } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    return { email: user.email };
  }

  async getEmailUserByUsername(data: GetEmailUserByUsernameRequest): Promise<GetEmailUserByUsernameResponse> {
    const user = await this.userRepository.findOne({ where: { username: data.username } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    return { email: user.email };
  }

  async getProfile(data: GetProfileRequest): Promise<GetProfileReponse> {
    const user = await this.userRepository.findOne({ where: { id: data.id } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    return { 
      biBan: user.biBan,
      role: user.role,
      avatarUrl: user.avatarUrl,
      username: user.username
    };
  }

  async getTokenVersion(data: GetTokenVersionRequest): Promise<GetTokenVersionResponse> {
    const user = await this.userRepository.findOne({ where: { id: data.userId } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    return {
      tokenVersion: user.tokenVersion
    };
  }

  async getBan(data: GetBanRequest): Promise<GetBanResponse> {
    const user = await this.userRepository.findOne({ where: { id: data.userId } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

    return {
      success: !user.biBan
    };
  }

  async setTokenVersion(userId: number, manager?: EntityManager): Promise<SetTokenVersionResponse> {
    const repo = manager
                  ? manager.getRepository(AuthEntity)
                  : this.userRepository;
    const user = await repo.findOne({ where: { id: userId } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });
    user.tokenVersion++;
    await repo.save(user);
    await this.cacheManager.set(`TOKEN_VER:${userId}`, user.tokenVersion, 10 * 60 * 1000);
    // Sau này cần update gọi kick user ở bên api gateway ( dùng event driven )
    return {
      success: true
    };
  }

  async setTokenVersionByUsername(data: SetTokenVersionRequest): Promise<SetTokenVersionResponse> {
    const user = await this.userRepository.findOne({ where: { username: data.username } })
    if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });
    user.tokenVersion++;
    await this.userRepository.save(user);
    await this.cacheManager.set(`TOKEN_VER:${user.id}`, user.tokenVersion, 10 * 60 * 1000);
    // Sau này cần update gọi kick user ở bên api gateway ( dùng event driven )
    return {
      success: true
    };
  }

  async sendEmailToUser(data: SendEmailToUserRequest): Promise<SendemailToUserResponse> {

    if (data.who.toUpperCase() === "ALL") {
      const html = ManagerEmailTemplate(data.title, data.content);
      const emails = Array.from(new Set((await this.userRepository.find({ select: ['email'] })).map(e => e.email)));

      this.emailClient.emit('send_emails', { emails, subject: data.title, html });
    } else if (data.who.toUpperCase() === "ADMIN") {
      const html = ManagerEmailTemplate(data.title, data.content, "ADMIN", "HDGSTUDIO");
      const emails = Array.from(new Set((await this.userRepository.find({ 
        where: { role: 'ADMIN' }, 
        select: ['email'] 
      })).map(e => e.email)));

      this.emailClient.emit('send_emails', { emails, subject: data.title, html });
    } else {
      const user = await this.findByUsername(data.who);
      if (!user) throw new RpcException({ code: status.NOT_FOUND, message: 'User not found' });

      const html = ManagerEmailTemplate(data.title, data.content, user.realname, user.username);
      this.emailClient.emit('send_email', { to: user.email, subject: data.title, html });
    }

    return { success: true };
  }

  async getRealnameAvatar(data: GetRealnameAvatarRequest): Promise<GetRealnameAvatarResponse> {
    const { userIds } = data;

    if (!userIds || userIds.length === 0) {
      return { realnameAvatarInfo: [] };
    }

    const users = await this.userRepository.find({
      where: { id: In(userIds) },
      select: ['id', 'realname', 'avatarUrl'], // chỉ lấy trường cần thiết
    });

    const realnameAvatarInfo = users.map(u => ({
      userId: u.id,
      realname: u.realname || '',
      avatarUrl: u.avatarUrl || '',
    }));

    return { realnameAvatarInfo };
  }

  async getAllUser(data: GetAllUserRequest): Promise<GetAllUserResponse> {
    const users = await this.userRepository.find({
      select: ['id', 'realname', 'avatarUrl']
    })

    const usersProto = users.map((u) => {
      return {
        userId: u.id,
        realname: u.realname,
        avatarUrl: u.avatarUrl
      }
    })

    return { userTraVe: usersProto };
  }

  async loginWithGoogle(data: LoginWithGoogleRequest, platform: string): Promise<LoginWithGoogleResponse> {
    const dataToken = await this.verifyGoogleToken(data.tokenFromGoogle, platform);
    if (!dataToken)
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'Token không hợp lệ' });

    if (!dataToken.email_verified)
      throw new RpcException({ code: status.PERMISSION_DENIED, message: 'Email Google chưa được xác thực' });

    if (!dataToken.email || !dataToken.name || !dataToken.picture)
      throw new RpcException({ code: status.PERMISSION_DENIED, message: 'Token thiếu trường dữ liệu, vui lòng đăng nhập lại!' });

    let user = await this.findByUsername(dataToken.email);
    let register = false;

    if (!user) {
      register = true;
      user = await this.registerWithGoogle(dataToken); 
    }

    if (user.biBan)
      throw new RpcException({ code: status.PERMISSION_DENIED, message: 'Tài khoản đã bị khóa, vui lòng liên hệ Admin' });

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      platform,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1d' });
    const refreshToken = this.jwtService.sign(
      { username: user.username, jti: randomUUID() },
      { expiresIn: '7d' },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      auth_id: user.id,
      role: user.role,
      register,
    };
  }

  private async registerWithGoogle(dataToken: any): Promise<AuthEntity> {
    const passwordAccount = generateStrongPassword();
    const passwordHash = await bcrypt.hash(passwordAccount, await bcrypt.genSalt(10));
    let authId: number;
    let savedUser: AuthEntity;

    // ── 1 transaction: auth + outbox ──────────────────────────────────────────
    // Không cần SagaState vì chỉ có 1 compensating action: xóa auth
    await this.userRepository.manager.transaction(async (manager) => {
      const userMoi = manager.create(AuthEntity, {
        username: dataToken.email,
        password: passwordHash,
        email: dataToken.email,
        realname: dataToken.name,
        role: 'USER',
        type: 1,
        avatarUrl: dataToken.picture,
        biBan: false,
      });
      savedUser = await manager.save(userMoi);
      authId = savedUser.id;

      // Outbox ghi cùng transaction — đảm bảo không mất event dù crash
      const outbox = manager.create(RegisterOutbox, {
        payload: { authId, gameName: dataToken.name } as RegisterPayload,
        status: 'PENDING',
        nextRetryAt: new Date(),
      });
      await manager.save(outbox);
    });

    // Fast path: gọi user service ngay, đồng bộ
    // Client cần vào game ngay sau login google → phải có user data
    try {
      await this.callUserService(authId, dataToken.name);
      await this.outboxRepo.update(
        { payload: { authId } as any, status: 'PENDING' },
        { status: 'DONE' },
      );
    } catch (error) {
      // Fail → compensate xóa auth, không cần SagaState vì chỉ có 1 việc cần undo
      console.error(`[google-register] fast path fail → compensate authId: ${authId}`, error);
      await this.userRepository.delete({ id: authId }).catch((e) =>
        console.error(`[google-register] compensate failed authId: ${authId}`, e),
      );
      throw new RpcException({ code: status.INTERNAL, message: 'Đăng ký thất bại, vui lòng thử lại' });
    }

    // Email: fire and forget — không cần await, không block login
    // Gửi được thì tốt, không gửi được cũng không ảnh hưởng flow
    this.mailerService.sendMail({
        to: savedUser.email,
        subject: '[NRO]Chào mừng tân thủ',
        html: ManagerEmailTemplate(
          `Chào mừng người chơi <br> ${savedUser.realname}`,
          `Chào mừng bạn đã đến với thế giới Ngọc rồng online (thông qua cách đăng ký với google)
          <br>
          Đây là tài khoản đăng nhập game của bạn:
          <br>
          <b>username</b>: ${savedUser.username}
          <br>
          <b>password</b>: ${passwordAccount}
          <br>
          Vui lòng không chia sẻ thông tin trên cho bất kỳ ai
          <br>
          <i>Lưu ý: Bạn có thể đổi mật khẩu tại website của game, bạn có thể dùng tài khoản này hoặc login bằng google trên website</i>.
          <br>
          Xin cảm ơn!
          `,
          savedUser.realname,
        ),
      }).catch((e) => console.warn(`[google-register] sendMail failed: ${savedUser.email}`, e));

    return savedUser;
  }

  private async incrementLoginAttempt(username: string): Promise<number> {
    const key = `LOGIN_FAIL:${username}`;
    let attempts = (await this.cacheManager.get<number>(key)) || 0;
    attempts++;
    await this.cacheManager.set(key, attempts, 15 * 60 * 1000); 
    return attempts;
  }

  async verifyGoogleToken(idToken: string, platform: string): Promise<TokenPayload> {
    try {
      let idCheck = platform == "game" ? process.env.GOOGLE_GAME_CLIENT_ID : process.env.GOOGLE_CLIENT_ID;
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: idCheck,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Google token không hợp lệ',
        });
      }

      return payload;
    } catch (err) {
      // Bất kể token sai kiểu gì => luôn trả 401
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Google token không hợp lệ hoặc đã hết hạn',
      });
    }
  }
}

function generateStrongPassword(length = 14): string {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%^&*()_+-=[]{};:,.<>?";

  const all = lower + upper + numbers + special;

  // Bắt buộc mỗi loại 1 ký tự
  let password = [
    lower[Math.floor(Math.random() * lower.length)],
    upper[Math.floor(Math.random() * upper.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  // Sinh phần còn lại
  for (let i = 0; i < length-4; i++) {
    const randIndex = Math.floor(Math.random() * all.length);
    password.push(all[randIndex]);
  }

  // Trộn ngẫu nhiên
  return password.join('');
}