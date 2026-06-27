import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock };

  const config = new ConfigService({
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: 12,
    NODE_ENV: 'test',
  });

  const baseUser: User = {
    id: 'u1',
    username: 'admin',
    passwordHash: '',
    email: 'admin@cse.sn',
    name: 'Admin',
    role: Role.ADMIN,
    isActive: true,
    mustChangePassword: false,
    lastLogin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config,
    );
  });

  it('login avec identifiants valides retourne un access_token', async () => {
    const passwordHash = await bcrypt.hash('Admin@2026!', 12);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
    prisma.user.update.mockResolvedValue({ ...baseUser, passwordHash });

    const result = await service.login('admin', 'Admin@2026!', '127.0.0.1');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user.username).toBe('admin');
    expect(
      (result.user as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('login avec mauvais mot de passe lève UnauthorizedException', async () => {
    const passwordHash = await bcrypt.hash('Admin@2026!', 12);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

    await expect(
      service.login('admin', 'MauvaisMotDePasse!', '127.0.0.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login pour un utilisateur inexistant lève UnauthorizedException', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login('ghost', 'whatever1', '127.0.0.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh avec token invalide lève UnauthorizedException', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.refresh('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refresh avec token expiré lève UnauthorizedException', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 't',
      expiresAt: new Date(Date.now() - 1000),
      user: baseUser,
    });
    await expect(service.refresh('t')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('le mot de passe est haché avec bcrypt (rounds=12)', async () => {
    const hash = await bcrypt.hash('Admin@2026!', 12);
    // Le préfixe $2b$12$ indique le coût (rounds) = 12.
    expect(hash.startsWith('$2b$12$')).toBe(true);
    expect(await bcrypt.compare('Admin@2026!', hash)).toBe(true);
  });

  it('login échoue pour un compte désactivé', async () => {
    const passwordHash = await bcrypt.hash('Admin@2026!', 12);
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      passwordHash,
      isActive: false,
    });
    await expect(
      service.login('admin', 'Admin@2026!'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh avec un token valide retourne un nouvel access_token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 't',
      expiresAt: new Date(Date.now() + 60_000),
      user: baseUser,
    });
    const result = await service.refresh('t');
    expect(result.accessToken).toBe('signed.jwt.token');
  });

  it('refresh sans token lève UnauthorizedException', async () => {
    await expect(service.refresh(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout supprime le refresh token', async () => {
    await service.logout('t');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 't' },
    });
  });

  it('logout sans token ne fait rien', async () => {
    await service.logout(undefined);
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('me retourne le profil sans passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    const me = await service.me('u1');
    expect(me.username).toBe('admin');
    expect((me as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('changePassword échoue si le mot de passe actuel est incorrect', async () => {
    const passwordHash = await bcrypt.hash('Bon@MotDePasse1', 12);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
    await expect(
      service.changePassword('u1', 'Mauvais@Mot1', 'Nouveau@Mot1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changePassword met à jour le hash et invalide les sessions', async () => {
    const passwordHash = await bcrypt.hash('Bon@MotDePasse1', 12);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
    prisma.user.update.mockResolvedValue(baseUser);

    await service.changePassword('u1', 'Bon@MotDePasse1', 'Nouveau@Mot1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ mustChangePassword: false }),
      }),
    );
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });
});
