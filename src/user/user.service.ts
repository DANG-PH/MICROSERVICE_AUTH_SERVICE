import { Injectable, Inject, Logger } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  RegisterRequest,
  UserServiceClient,
  USER_PACKAGE_NAME,
  USER_SERVICE_NAME,
} from 'proto/user.pb';
import Redis from 'ioredis';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UserService {
  private userGrpcService: UserServiceClient;

  constructor(
    @Inject(USER_PACKAGE_NAME) private readonly client: ClientGrpc,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  onModuleInit() {
    this.userGrpcService = this.client.getService<UserServiceClient>(USER_SERVICE_NAME);
  }

  async handleRegister(req: RegisterRequest) {
    return await firstValueFrom(this.userGrpcService.register(req));
  }
}
