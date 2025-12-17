import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('social_network') 
export class SocialNetworkEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  userId: number;

  @Column({ nullable: false })
  friendId: number;

  @Column({ nullable: false })
  status: number;

  @CreateDateColumn()
  createdAt: Date;
}
