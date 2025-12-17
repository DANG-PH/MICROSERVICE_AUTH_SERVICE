import { Controller, InternalServerErrorException, ForbiddenException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import type { GetProfileReponse, GetProfileRequest, GetEmailUserRequest, GetEmailUserResponse, ChangeRolePartnerRequest, ChangeRolePartnerResponse, LoginRequest,LoginResponse, RegisterResponse, RegisterRequest, VerifyOtpRequest, VerifyOtpResponse, ChangeEmailRequest, ChangeEmailResponse, ChangePasswordRequest, ChangePasswordResponse, ChangeRoleRequest, ChangeRoleResponse, ResetPasswordRequest, ResetPasswordResponse, BanUserRequest, BanUserResponse, UnbanUserRequest, UnbanUserResponse,RequestResetPasswordRequest, RequestResetPasswordResponse, SendEmailToUserRequest, SendemailToUserResponse, ChangeAvatarRequest, ChangeAvatarResponse } from 'proto/auth.pb';
import { AUTH_SERVICE_NAME } from 'proto/auth.pb';
import { Metadata } from '@grpc/grpc-js';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @GrpcMethod(AUTH_SERVICE_NAME, 'Register')
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    return await this.authService.register(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Login')
  async login(data: LoginRequest, metadata: Metadata): Promise<LoginResponse> {
    const platform = metadata.get('platform')[0] as string; // 'web' | 'app' | 'game'
    console.log('Platform từ client:', platform);

    return await this.authService.login(data, platform);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Refresh')
  async refresh(data: { refreshToken: string }, metadata: Metadata) {
    const platform = metadata.get('platform')[0] as string;
    return await this.authService.refresh(data.refreshToken, platform);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'VerifyOTP')
  async verifyotp( data: VerifyOtpRequest, metadata: Metadata) {
    const platform = metadata.get('platform')[0] as string;
    return await this.authService.verifyOtp(data, platform);
  }
  // ===== USER METHODS =====
  @GrpcMethod(AUTH_SERVICE_NAME, 'ChangePassword')
  async changePassword(data: ChangePasswordRequest, metadata: Metadata): Promise<ChangePasswordResponse> {
    const platform = metadata.get('platform')[0] as string;
    return await this.authService.changePassword(data, platform);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'ResetPassword')
  async resetPassword(data: ResetPasswordRequest, metadata: Metadata): Promise<ResetPasswordResponse> {
    const platform = metadata.get('platform')[0] as string;
    return await this.authService.resetPassword(data, platform);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'ChangeEmail')
  async changeEmail(data: ChangeEmailRequest): Promise<ChangeEmailResponse> {
    return await this.authService.changeEmail(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'ChangeAvatar')
  async changeAvatar(data: ChangeAvatarRequest): Promise<ChangeAvatarResponse> {
    return await this.authService.changeAvatar(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'RequestResetPassword')
  async requestResetPassword(
    data: RequestResetPasswordRequest
  ): Promise<RequestResetPasswordResponse> {
    return this.authService.requestResetPassword(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'GetProfile')
  async getProfile(
    data: GetProfileRequest
  ): Promise<GetProfileReponse> {
    return this.authService.getProfile(data);
  }

  // ===== ADMIN METHODS =====
  @GrpcMethod(AUTH_SERVICE_NAME, 'ChangeRole')
  async changeRole(data: ChangeRoleRequest): Promise<ChangeRoleResponse> {
    return await this.authService.changeRole(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'BanUser')
  async banUser(data: BanUserRequest): Promise<BanUserResponse> {
    return await this.authService.banUser(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'UnbanUser')
  async unbanUser(data: UnbanUserRequest): Promise<UnbanUserResponse> {
    return await this.authService.unbanUser(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'ChangeRolePartner')
  async changeRolePartner(data: ChangeRolePartnerRequest): Promise<ChangeRolePartnerResponse> {
    return await this.authService.changeRolePartner(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'GetEmailUser')
  async getEmailUser(data: GetEmailUserRequest): Promise<GetEmailUserResponse> {
    return await this.authService.getEmailUser(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'CheckAccount')
  async checkAccount(data: LoginRequest): Promise<LoginResponse> {
    return await this.authService.checkAccount(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'SendEmailToUser')
  async sendEmailToUser(data: SendEmailToUserRequest): Promise<SendemailToUserResponse> {
    return await this.authService.sendEmailToUser(data);
  }
}