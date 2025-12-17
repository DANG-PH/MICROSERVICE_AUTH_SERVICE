import { Controller, InternalServerErrorException, ForbiddenException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { SocialNetworkService } from './social_network.service';
import type {   
  AddFriendRequest,
  AddFriendResponse,
  GetSentFriendRequest,
  GetSentFriendResponse,
  GetIncomingFriendRequest,
  GetIncomingFriendResponse,
  AcceptFriendRequest,
  AcceptFriendResponse,
  RejectFriendRequest,
  RejectFriendResponse,
  GetAllFriendRequest,
  GetAllFriendResponse,
  UnfriendRequest,
  UnfriendResponse,
  BlockUserRequest,
  BlockUserResponse, } from 'proto/auth.pb';
import { AUTH_SERVICE_NAME } from 'proto/auth.pb';
import { Metadata } from '@grpc/grpc-js';

@Controller()
export class SocialNetworkController {
  constructor(
    private readonly socialNetworkService: SocialNetworkService,
  ) {}

  @GrpcMethod(AUTH_SERVICE_NAME, 'AddFriend')
  async addFriend(data: AddFriendRequest): Promise<AddFriendResponse> {
    return await this.socialNetworkService.addFriend(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'GetSentFriend')
  async getSendFriend(data: GetSentFriendRequest): Promise<GetSentFriendResponse> {
    return await this.socialNetworkService.getSendFriend(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'GetIncomingFriend')
  async getIncomingFriend(data: GetIncomingFriendRequest): Promise<GetIncomingFriendResponse> {
    return await this.socialNetworkService.getIncomingFriend(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'AcceptFriend')
  async acceptFriend( data: AcceptFriendRequest): Promise<AcceptFriendResponse> {
    return await this.socialNetworkService.acceptFriend(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'RejectFriend')
  async rejectFriend(data: RejectFriendRequest): Promise<RejectFriendResponse> {
    return await this.socialNetworkService.rejectFriend(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'GetAllFriend')
  async getAllFriend(data: GetAllFriendRequest): Promise<GetAllFriendResponse> {
    return await this.socialNetworkService.getAllFriend(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Unfriend')
  async unfriend(data: UnfriendRequest): Promise<UnfriendResponse> {
    return await this.socialNetworkService.unfriend(data);
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'BlockUser')
  async blockUser(data: BlockUserRequest): Promise<BlockUserResponse> {
    return await this.socialNetworkService.blockUser(data);
  }
}