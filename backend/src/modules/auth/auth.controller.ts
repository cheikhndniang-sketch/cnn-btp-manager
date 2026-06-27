import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Bloque après 10 tentatives échouées → 429 pendant 15 min. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress ?? undefined;
    const result = await this.auth.login(dto.username, dto.password, ip);

    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

    return { access_token: result.accessToken, user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const { accessToken } = await this.auth.refresh(token);
    return { access_token: accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return {};
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return {};
  }

  private cookieOptions() {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    // En production, le SPA et l'API sont sur des domaines distincts (Railway) :
    // le cookie est cross-site → SameSite=None + Secure obligatoires pour qu'il soit envoyé.
    // En dev (localhost), SameSite=Strict suffit et reste plus sûr.
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'strict') as 'none' | 'strict',
      path: '/v1/auth',
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      expires: expiresAt,
    });
  }
}
