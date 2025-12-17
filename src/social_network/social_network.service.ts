import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialNetworkEntity } from './social_network.entity';
import type { } from 'proto/auth.pb';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
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
import { AuthService } from 'src/auth/auth.service';

@Injectable()
export class SocialNetworkService {
  constructor(
    @InjectRepository(SocialNetworkEntity)
    private readonly repo: Repository<SocialNetworkEntity>,
  ) {}

  async existsById(userId: number, friendId: number): Promise<boolean> {
    const existed = await this.repo.findOne({
      where: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    });

    return existed ? true : false;
  }

  /* ================= ADD FRIEND ================= */
  async addFriend(req: AddFriendRequest): Promise<AddFriendResponse> {
    const { userId, friendId } = req;

    if (userId === friendId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Không thể gửi kết bạn cho bản thân',
      });
    }

    const existed = await this.existsById(userId, friendId)
    if (existed) {
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: 'Đã tồn tại quan hệ hoặc đã gửi lời mời kết bạn',
      });
    }

    const relation = await this.repo.save({
      userId,
      friendId,
      status: 0, // PENDING
    });

    return {
      relationId: relation.id,
      userId: relation.userId,
      friendId: relation.friendId,
      status: relation.status,
      create_at: relation.createdAt.toISOString(),
    };
  }

  /* ================= SENT FRIEND REQUEST ================= */
  async getSendFriend(req: GetSentFriendRequest): Promise<GetSentFriendResponse> {
    const rows = await this.repo
      .createQueryBuilder('r')
      .innerJoin('auth', 'u', 'u.id = r.friendId')
      .select([
        'r.id AS relationId',
        'r.friendId AS friendId',
        'u.realname AS friendRealname',
        'u.avatarUrl AS avatarUrl',
        'r.status AS status',
        'r.createdAt AS createdAt',
      ])
      .where('r.userId = :userId', { userId: req.userId })
      .andWhere('r.status = :status', { status: 0 }) // PENDING
      .orderBy('r.createdAt', 'DESC')
      .getRawMany();

    return {
      relationFriendInfo: rows.map((r) => ({
        relationId: r.relationId,
        friendId: r.friendId,
        friendRealname: r.friendRealname,
        avatarUrl: r.avatarUrl,
        status: r.status,
        create_at: r.createdAt.toISOString(),
      })),
    };
  }

  /* ================= INCOMING FRIEND REQUEST ================= */
  async getIncomingFriend(
    req: GetIncomingFriendRequest,
  ): Promise<GetIncomingFriendResponse> {
    const rows = await this.repo
      .createQueryBuilder('r')
      .innerJoin('auth', 'u', 'u.id = r.userId')
      .select([
        'r.id AS relationId',
        'r.userId AS friendId',
        'u.realname AS friendRealname',
        'u.avatarUrl AS avatarUrl',
        'r.status AS status',
        'r.createdAt AS createdAt',
      ])
      .where('r.friendId = :friendId', { friendId: req.userId })
      .andWhere('r.status = :status', { status: 0 }) // PENDING
      .orderBy('r.createdAt', 'DESC')
      .getRawMany();

    return {
      relationFriendInfo: rows.map((r) => ({
        relationId: r.relationId,
        friendId: r.friendId,
        friendRealname: r.friendRealname,
        avatarUrl: r.avatarUrl,
        status: r.status,
        create_at: r.createdAt.toISOString(),
      })),
    };
  }

  /* ================= ACCEPT FRIEND ================= */
  async acceptFriend(
    req: AcceptFriendRequest,
  ): Promise<AcceptFriendResponse> {
    const relation = await this.repo.findOne({
      where: { id: req.relationId, status: 0 },
    });

    if (!relation) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Không thấy thông tin của quan hệ này',
      });
    }

    relation.status = 1; // ACCEPTED
    await this.repo.save(relation);

    return {
      relationFriendInfo: {
        relationId: relation.id,
        friendId: relation.userId,
        friendRealname: 'Vui lòng xem thông tin bạn bè',
        avatarUrl: 'Vui lòng xem thông tin bạn bè',
        status: relation.status,
        create_at: relation.createdAt.toISOString(),
      },
    };
  }

  /* ================= REJECT FRIEND ================= */
  async rejectFriend(
    req: RejectFriendRequest,
  ): Promise<RejectFriendResponse> {
    const relation = await this.repo.findOne({
      where: { id: req.relationId, status: 0 },
    });

    if (!relation) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Pending request not found',
      });
    }

    await this.repo.delete(relation.id);
    return { success: true };
  }

  /* ================= GET ALL FRIEND ================= */
  async getAllFriend(req: GetAllFriendRequest,): Promise<GetAllFriendResponse> {
    // const relations = await this.repo.find({
    //   where: [
    //     { userId: req.userId, status: 1 },
    //     { friendId: req.userId, status: 1 },
    //   ],
    // });

    // return {
    //   friendInfo: relations.map((r) => ({
    //     friendId: r.userId === req.userId ? r.friendId : r.userId,
    //     friendRealname: '',
    //     status: r.status,
    //   })),
    // };

    const qb = this.repo.createQueryBuilder('r');

    qb.setParameter('userId', req.userId);

    const rows = await qb
      .innerJoin(
        'auth',
        'u',
        `u.id = CASE 
          WHEN r.userId = :userId THEN r.friendId
          ELSE r.userId
        END`,
      )
      .select([
        `CASE 
          WHEN r.userId = :userId THEN r.friendId
          ELSE r.userId
        END AS friendId`,
        'u.realname AS friendRealname',
        'u.avatarUrl AS avatarUrl',
        'r.status AS status',
      ])
      .where('(r.userId = :userId OR r.friendId = :userId)')
      .andWhere('r.status = 1')
      .getRawMany();

    return { friendInfo: rows };
  }

  /* ================= UNFRIEND ================= */
  async unfriend(req: UnfriendRequest): Promise<UnfriendResponse> {
    const relation = await this.repo.findOne({
      where: [
        { userId: req.userId, friendId: req.friendId, status: 1 },
        { userId: req.friendId, friendId: req.userId, status: 1 },
      ],
    });

    if (!relation) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Không tìm thấy quan hệ bạn bè',
      });
    }

    await this.repo.delete(relation.id);
    return { success: true };
  }

  /* ================= BLOCK USER ================= */
  async blockUser(req: BlockUserRequest): Promise<BlockUserResponse> {
    if (req.userId === req.friendId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Không thể block bản thân',
      });
    }

    let relation = await this.repo.findOne({
      where: [
        { userId: req.userId, friendId: req.friendId },
        { userId: req.friendId, friendId: req.userId },
      ],
    });

    if (!relation) {
      relation = this.repo.create({
        userId: req.userId,
        friendId: req.friendId,
        status: 2, // BLOCKED
      });
    } else {
      relation.status = 2;
      relation.userId = req.userId; // đảm bảo hướng block
      relation.friendId = req.friendId;
    }

    await this.repo.save(relation);
    return { success: true };
  }
}
