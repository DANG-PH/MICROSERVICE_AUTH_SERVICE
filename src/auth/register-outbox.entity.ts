import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Index(['status', 'nextRetryAt'])
@Entity('register_outbox')
export class RegisterOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('json')
  payload: any; // RegisterRequest + sagaId + authId

  @Column({ default: 'PENDING' })
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

  @Column({ default: 0 })
  retries: number;

  @Column({ default: 3 })
  maxRetries: number;

  @Column({ nullable: true, type: 'timestamptz' })
  nextRetryAt: Date;

  @Column({ nullable: true, type: 'text' })
  lastError: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}