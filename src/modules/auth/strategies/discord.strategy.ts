import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import Strategy from 'passport-discord';
import type { VerifyCallback } from 'passport-oauth2';

export interface DiscordProfile {
  discordId: string;
  email: string;
  username: string;
  globalName: string;
  avatarUrl: string;
}

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor(configService: ConfigService) {
    super({
      clientID:
        configService.get<string>('DISCORD_CLIENT_ID') ||
        'mock-discord-client-id',
      clientSecret:
        configService.get<string>('DISCORD_CLIENT_SECRET') ||
        'mock-discord-client-secret',
      callbackURL:
        configService.get<string>('DISCORD_CALLBACK_URL') ||
        'http://localhost:8000/api/auth/discord/callback',
      scope: ['identify', 'email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      username: string;
      global_name: string | null;
      email?: string;
      avatar: string | null;
      verified: boolean;
    },
    done: VerifyCallback,
  ): Promise<void> {
    const avatarUrl = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith('a_') ? 'gif' : 'png'}`
      : '';

    const user: DiscordProfile = {
      discordId: profile.id,
      email: profile.email ?? '',
      username: profile.username,
      globalName: profile.global_name ?? profile.username,
      avatarUrl,
    };

    done(null, user);
  }
}
