import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from './strategies/jwt.strategy';

export interface SafeUser {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLogin: Date | null;
  createdAt: Date;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Retire passwordHash et champs internes avant exposition à l'API. */
  static sanitize(user: User): SafeUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    };
  }

  async validateUser(username: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    // Message générique : on ne révèle pas si le username existe.
    const invalid = new UnauthorizedException('Identifiants invalides');

    if (!user || !user.isActive) {
      throw invalid;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw invalid;
    }

    return user;
  }

  async login(
    username: string,
    password: string,
    ipAddress?: string,
  ): Promise<LoginResult> {
    const user = await this.validateUser(username, password);

    const accessToken = await this.signAccessToken(user);
    const { token: refreshToken, expiresAt: refreshExpiresAt } =
      await this.issueRefreshToken(user.id);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await this.audit(user.id, 'LOGIN', 'User', user.id, ipAddress);

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
      user: AuthService.sanitize(user),
    };
  }

  async refresh(refreshToken?: string): Promise<{ accessToken: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token manquant');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Compte désactivé');
    }

    const accessToken = await this.signAccessToken(stored.user);
    return { accessToken };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  async me(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return AuthService.sanitize(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(newPassword, Number(rounds));

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    // Invalider toutes les sessions existantes après changement de mot de passe.
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    await this.audit(userId, 'CHANGE_PASSWORD', 'User', userId);
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
    });
  }

  private async issueRefreshToken(
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('hex');
    const expiresAt = this.computeRefreshExpiry();

    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });

    return { token, expiresAt };
  }

  private computeRefreshExpiry(): Date {
    const raw = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const days = Number(raw.replace(/d$/, '')) || 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async audit(
    userId: string | null,
    action: string,
    entity: string,
    entityId?: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, ipAddress },
    });
  }
}
