import { Controller, InternalServerErrorException, ForbiddenException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import type { GetEmailUserRequest, GetEmailUserResponse, ChangeRolePartnerRequest, ChangeRolePartnerResponse, LoginRequest,LoginResponse, RegisterResponse, RegisterRequest, VerifyOtpRequest, VerifyOtpResponse, ChangeEmailRequest, ChangeEmailResponse, ChangePasswordRequest, ChangePasswordResponse, ChangeRoleRequest, ChangeRoleResponse, ResetPasswordRequest, ResetPasswordResponse, BanUserRequest, BanUserResponse, UnbanUserRequest, UnbanUserResponse,RequestResetPasswordRequest, RequestResetPasswordResponse } from 'proto/auth.pb';
import { AUTH_SERVICE_NAME } from 'proto/auth.pb';

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
  async login(data: LoginRequest): Promise<LoginResponse> {
    return await this.authService.login(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Refresh')
  async refresh(data: { refreshToken: string }) {
    return await this.authService.refresh(data.refreshToken);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'VerifyOTP')
  async verifyotp( data: VerifyOtpRequest) {
    return await this.authService.verifyOtp(data);
  }
  // ===== USER METHODS =====
  @GrpcMethod(AUTH_SERVICE_NAME, 'ChangePassword')
  async changePassword(data: ChangePasswordRequest): Promise<ChangePasswordResponse> {
    return await this.authService.changePassword(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'ResetPassword')
  async resetPassword(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    return await this.authService.resetPassword(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'ChangeEmail')
  async changeEmail(data: ChangeEmailRequest): Promise<ChangeEmailResponse> {
    return await this.authService.changeEmail(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'RequestResetPassword')
  async requestResetPassword(
    data: RequestResetPasswordRequest
  ): Promise<RequestResetPasswordResponse> {
    return this.authService.requestResetPassword(data);
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
}