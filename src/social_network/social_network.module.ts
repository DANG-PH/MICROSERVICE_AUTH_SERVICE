import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialNetworkController } from './social_network.controller';
import { SocialNetworkEntity } from './social_network.entity';
import { SocialNetworkService } from './social_network.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([SocialNetworkEntity]), AuthModule],
  providers: [SocialNetworkService],
  exports: [SocialNetworkService],
  controllers: [SocialNetworkController],
})
export class SocialNetworkModule {}