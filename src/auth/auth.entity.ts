import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('auth') 
export class AuthEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false, unique: true })
  username: string;

  @Column({ nullable: false })
  email : string;

  @Column({ nullable: false })
  realname : string;

  @Column({ default: false })
  biBan: boolean;

  @Column({ default: 'USER' })
  role: string;

  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true, default: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ_kwJh8vqmnSIbpOpY3sAGdIP4B7gEUnnYrQ&s' })
  avatarUrl: string;

  // @Column({ nullable: true })
  // otp: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // @CreateDateColumn()
  // otpCreatedAt: Date;
}
