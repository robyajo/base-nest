import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { RegisterDto, LoginDto, UpdateProfileDto } from './schemas/auth.schema';
type RegisterPayload = Omit<RegisterDto, 'confirmPassword'>;
import { AuthTokens, AuthResponse } from './interfaces/auth.interface';
import { JwtPayload } from 'src/common/interfaces/app.interface';
import type { GoogleProfile } from './strategies/google.strategy';
import type { DiscordProfile } from './strategies/discord.strategy';
import { UserRole } from 'generated/prisma/enums';


@Injectable()
export class AuthService {
  // Logger instance
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;
  private readonly verificationCooldown: number;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
    configService: ConfigService,
  ) {
    this.refreshTokenSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTokenExpiry = configService.getOrThrow<string>('JWT_ACCESS_EXPIRY');
    this.refreshTokenExpiry = configService.getOrThrow<string>('JWT_REFRESH_EXPIRY');
    this.verificationCooldown = configService.get<number>('VERIFICATION_COOLDOWN') ?? 60;
  }

  async register(dto: RegisterPayload): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException('Username already taken');

    const emailExists = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (emailExists) throw new ConflictException('Email already registered');

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName ?? dto.username,
        provider: 'email',
      },
    });

    const tokens = await this.generateTokens(user.id, user.email!, user.role);

    const { passwordHash: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, tokens };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user) throw new UnauthorizedException('Invalid username or password');
    if (!user.passwordHash) throw new UnauthorizedException('This account uses social login. Please sign in with Google or Discord.');

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid username or password');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    const tokens = await this.generateTokens(user.id, user.email ?? '', user.role);

    await this.logLogin(user.id, 'email', ip, userAgent);

    const { passwordHash: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, tokens };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.refreshTokenSecret,
      });

      const tokenHash = this.hashToken(refreshToken);

      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
      });
      if (!storedToken) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isActive: true },
      });
      if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

      return this.generateTokens(payload.sub, payload.email, payload.role);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async sendVerification(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.email) throw new BadRequestException('No email associated with this account');
    if (user.emailVerified) throw new BadRequestException('Email already verified');

    await this.checkCooldown(userId, 'EMAIL_VERIFICATION');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.verificationToken.create({
      data: { token, userId: user.id, type: 'EMAIL_VERIFICATION', expiresAt },
    });

    this.mailService.sendVerificationEmail(user.email, token).catch((err) => {
      console.error('Failed to send verification email:', err);
    });

    return { message: 'Verification email sent' };
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { token },
    });
    if (!record) throw new BadRequestException('Invalid or expired verification token');
    if (record.type !== 'EMAIL_VERIFICATION') throw new BadRequestException('Invalid token type');
    if (record.expiresAt < new Date()) throw new BadRequestException('Verification token has expired');

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });

    await this.prisma.verificationToken.delete({ where: { id: record.id } });
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return { message: 'If the email is registered, you will receive a password reset link' };
    }

    await this.checkCooldown(user.id, 'PASSWORD_RESET');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.verificationToken.create({
      data: { token, userId: user.id, type: 'PASSWORD_RESET', expiresAt },
    });

    this.mailService.sendPasswordResetEmail(user.email!, token).catch((err) => {
      console.error('Failed to send password reset email:', err);
    });

    return { message: 'If the email is registered, you will receive a password reset link' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { token },
    });
    if (!record || record.type !== 'PASSWORD_RESET') {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    await this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } });

    await this.prisma.verificationToken.delete({ where: { id: record.id } });

    return { message: 'Password has been reset successfully' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) throw new BadRequestException('Social login accounts cannot change passwords via this method');

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) throw new BadRequestException('Current password is incorrect');

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password changed successfully' };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const { passwordHash: _, ...result } = user;
    return result;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        data[key] = value === '' ? null : value;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    const { passwordHash: _, ...result } = updated;
    return result;
  }

  async googleLogin(profile: GoogleProfile, ip?: string, userAgent?: string): Promise<AuthResponse> {
    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (user) {
      if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

      if (profile.avatarUrl && profile.avatarUrl !== user.avatarUrl) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: profile.avatarUrl },
        });
      }
    } else if (profile.email) {
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.googleId, avatarUrl: profile.avatarUrl || user.avatarUrl },
        });
      }
    }

    if (!user) {
      const baseUsername = profile.email
        ? profile.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_')
        : `user_${profile.googleId.slice(0, 8)}`;
      let username = baseUsername;

      const existing = await this.prisma.user.findUnique({ where: { username } });
      if (existing) {
        username = `${baseUsername}_${profile.googleId.slice(0, 6)}`;
      }

      user = await this.prisma.user.create({
        data: {
          googleId: profile.googleId,
          email: profile.email || `${profile.googleId}@google.local`,
          username,
          displayName: profile.displayName || username,
          avatarUrl: profile.avatarUrl || null,
          emailVerified: !!profile.email,
          emailVerifiedAt: profile.email ? new Date() : null,
          provider: 'google',
        },
      });

      this.logger.log(`New user registered via Google: ${user.id} (${username})`);
    }

    const tokens = await this.generateTokens(user.id, user.email ?? '', user.role);

    await this.logLogin(user.id, 'google', ip, userAgent);

    const { passwordHash: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, tokens };
  }

  async discordLogin(profile: DiscordProfile, ip?: string, userAgent?: string): Promise<AuthResponse> {
    let user = await this.prisma.user.findUnique({
      where: { discordId: profile.discordId },
    });

    if (user) {
      if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

      if (profile.avatarUrl && profile.avatarUrl !== user.avatarUrl) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: profile.avatarUrl },
        });
      }
    } else if (profile.email) {
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { discordId: profile.discordId, avatarUrl: profile.avatarUrl || user.avatarUrl },
        });
      }
    }

    if (!user) {
      const baseUsername = profile.username.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
      let username = baseUsername;

      const existing = await this.prisma.user.findUnique({ where: { username } });
      if (existing) {
        username = `${baseUsername}_${profile.discordId.slice(0, 6)}`;
      }

      user = await this.prisma.user.create({
        data: {
          discordId: profile.discordId,
          email: profile.email || `${profile.discordId}@discord.local`,
          username,
          displayName: profile.globalName || profile.username,
          avatarUrl: profile.avatarUrl || null,
          emailVerified: !!profile.email,
          emailVerifiedAt: profile.email ? new Date() : null,
          provider: 'discord',
        },
      });

      this.logger.log(`New user registered via Discord: ${user.id} (${username})`);
    }

    const tokens = await this.generateTokens(user.id, user.email ?? '', user.role);

    await this.logLogin(user.id, 'discord', ip, userAgent);

    const { passwordHash: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, tokens };
  }

  private async logLogin(userId: string, method: string, ip?: string, userAgent?: string): Promise<void> {
    await this.prisma.loginLog.create({
      data: { userId, method, ip: ip ?? null, userAgent: userAgent ?? null },
    });
  }

  private async generateTokens(userId: string, email: string, role: UserRole): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload as never, {
        secret: process.env.JWT_SECRET,
        expiresIn: this.accessTokenExpiry as never,
      }),
      this.jwtService.signAsync(payload as never, {
        secret: this.refreshTokenSecret,
        expiresIn: this.refreshTokenExpiry as never,
      }),
    ]);

    const tokenHash = this.hashToken(refreshToken);
    const decoded = this.jwtService.decode(refreshToken) as { exp: number } | null;
    const expiresAt = decoded ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async checkCooldown(userId: string, type: string): Promise<void> {
    const existingToken = await this.prisma.verificationToken.findFirst({
      where: { userId, type },
      orderBy: { createdAt: 'desc' },
    });

    if (existingToken) {
      const elapsed = (Date.now() - existingToken.createdAt.getTime()) / 1000;
      if (elapsed < this.verificationCooldown) {
        const remaining = Math.ceil(this.verificationCooldown - elapsed);
        throw new BadRequestException(`Please wait ${remaining} seconds before requesting a new ${type.toLowerCase().replace('_', ' ')}`);
      }
    }

    await this.prisma.verificationToken.deleteMany({ where: { userId, type } });
  }
}
