import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('MICROSOFT_CLIENT_ID') || 'MICROSOFT_ID_PLACEHOLDER',
      clientSecret: configService.get<string>('MICROSOFT_CLIENT_SECRET') || 'MICROSOFT_SECRET_PLACEHOLDER',
      callbackURL: configService.get<string>('MICROSOFT_CALLBACK_URL') || 'http://localhost:3000/api/auth/microsoft/callback',
      scope: ['user.read'],
      tenant: 'common', // ou seu tenant id específico
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user: any) => void,
  ): Promise<any> {
    const { displayName, mail, userPrincipalName, id } = profile;
    const user = {
      email: mail || userPrincipalName,
      name: displayName,
      provider: 'microsoft',
      providerId: id,
      accessToken,
    };
    done(null, user);
  }
}
