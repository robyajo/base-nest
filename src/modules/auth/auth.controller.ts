import { Controller, Get, Post, Patch, Body, Query, HttpCode, HttpStatus, BadRequestException, UseInterceptors, UploadedFile, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { AuthService } from './auth.service';

import {
  RegisterSchema, LoginSchema, RefreshTokenSchema,
  ForgotPasswordSchema, ResetPasswordSchema, ChangePasswordSchema,
  UpdateProfileSchema,
} from './schemas/auth.schema';
import type {
  RegisterDto, LoginDto, RefreshTokenDto,
  ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto,
  UpdateProfileDto,
} from './schemas/auth.schema';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtPayload } from 'src/common/interfaces/app.interface';
import type { GoogleProfile } from './strategies/google.strategy';
import type { DiscordProfile } from './strategies/discord.strategy';
import { OAuthCallbackGuard } from './guards/oauth-callback.guard';
import type { Response, Request } from 'express';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleLogin() {
    // Redirects to Google consent screen
  }

  @Public()
  @Get('google/callback')
  @UseGuards(OAuthCallbackGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

    if (!req.user) {
      return res.redirect(`${clientUrl}/oauth/callback?error=${(req.query.error as string) || 'authentication_failed'}`);
    }

    try {
      const ip = req.ip ?? req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const result = await this.authService.googleLogin(req.user as GoogleProfile, ip, userAgent);
      const redirectUrl = `${clientUrl}/oauth/callback?accessToken=${result.tokens.accessToken}&refreshToken=${result.tokens.refreshToken}`;
      res.redirect(redirectUrl);
    } catch {
      res.redirect(`${clientUrl}/oauth/callback?error=authentication_failed`);
    }
  }

  @Public()
  @Get('discord')
  @UseGuards(AuthGuard('discord'))
  async discordLogin() {
    // Redirects to Discord consent screen
  }

  @Public()
  @Get('discord/callback')
  @UseGuards(OAuthCallbackGuard('discord'))
  async discordCallback(@Req() req: Request, @Res() res: Response) {
    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

    if (!req.user) {
      return res.redirect(`${clientUrl}/oauth/callback?error=${(req.query.error as string) || 'authentication_failed'}`);
    }

    try {
      const ip = req.ip ?? req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const result = await this.authService.discordLogin(req.user as DiscordProfile, ip, userAgent);
      const redirectUrl = `${clientUrl}/oauth/callback?accessToken=${result.tokens.accessToken}&refreshToken=${result.tokens.refreshToken}`;
      res.redirect(redirectUrl);
    } catch {
      res.redirect(`${clientUrl}/oauth/callback?error=authentication_failed`);
    }
  }

  @Public()
  @Post('register')
  async register(@Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto) {
    const { confirmPassword: _, ...payload } = dto;
    return this.authService.register(payload);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: Request,
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
  ) {
    const ip = req.ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(dto, ip, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('me')
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @Post('send-verification')
  @HttpCode(HttpStatus.OK)
  async sendVerification(@CurrentUser() user: JwtPayload) {
    return this.authService.sendVerification(user.sub);
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string | undefined) {
    if (!token) throw new BadRequestException('Verification token is required');
    await this.authService.verifyEmail(token);
    return { message: 'Email verified successfully' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    const { confirmPassword: _, ...payload } = dto;
    return this.authService.resetPassword(payload.token, payload.password);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Patch('profile')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const userId = (req as any).user?.sub;
          if (!userId) return cb(new Error('User not authenticated'), '');
          const dir = join(process.cwd(), 'uploads', userId, 'avatars');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, unique + extname(file.originalname));
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    if (avatar) {
      const baseUrl = process.env.APP_URL ?? 'http://localhost:8000';
      dto.avatarUrl = `${baseUrl}/uploads/${user.sub}/avatars/${avatar.filename}`;
    }
    return this.authService.updateProfile(user.sub, dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: JwtPayload) {
    await this.authService.logoutAll(user.sub);
    return { message: 'Logged out from all devices' };
  }
}
