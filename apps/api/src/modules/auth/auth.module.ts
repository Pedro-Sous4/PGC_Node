import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaService } from '../../infra/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

import { UsersController } from './users.controller';
import { UsersService } from './application/users.service';
import { GoogleStrategy } from './google.strategy';
import { MicrosoftStrategy } from './microsoft.strategy';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [
    PassportModule,
    SystemSettingsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'pgc-dev-secret',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [AuthService, JwtStrategy, UsersService, PrismaService, GoogleStrategy, MicrosoftStrategy],
})
export class AuthModule {}
