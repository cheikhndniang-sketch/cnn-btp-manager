import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    siteMember: { findMany: jest.Mock };
    refreshToken: { deleteMany: jest.Mock };
  };

  const config = new ConfigService({ BCRYPT_ROUNDS: 12 });

  const baseUser: User = {
    id: 'u1',
    username: 'jdupont',
    passwordHash: 'hash',
    email: null,
    name: 'Jean Dupont',
    role: Role.CONDUCTEUR_TRAVAUX,
    isActive: true,
    mustChangePassword: true,
    lastLogin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      siteMember: { findMany: jest.fn() },
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({}) },
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      config,
    );
  });

  it('crée un utilisateur avec un username unique et un mot de passe temporaire', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(baseUser);

    const result = await service.create({
      username: 'JDupont',
      name: 'Jean Dupont',
    });

    // Username normalisé en minuscules.
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: 'jdupont' }),
      }),
    );
    expect(result.temporaryPassword).toMatch(/^Cse-/);
    expect(result.user.username).toBe('jdupont');
  });

  it('création avec username existant lève ConflictException', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    await expect(
      service.create({ username: 'jdupont', name: 'Doublon' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("la désactivation ne supprime pas l'utilisateur en base (isActive=false)", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({ ...baseUser, isActive: false });

    const result = await service.deactivate('u1', { userId: 'admin' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });

  it('un admin ne peut pas se désactiver lui-même', async () => {
    await expect(
      service.deactivate('admin', { userId: 'admin' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("un non-admin ne peut pas modifier le rôle d'un utilisateur", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    await expect(
      service.update(
        'u1',
        { role: Role.ADMIN },
        { userId: 'dp', role: Role.DIRECTEUR_PROJET },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findAll applique les filtres role et isActive', async () => {
    prisma.user.findMany.mockResolvedValue([baseUser]);
    const result = await service.findAll({ role: Role.ADMIN, isActive: true });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: Role.ADMIN, isActive: true },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('findOne lève NotFoundException pour un id inconnu', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('un admin peut mettre à jour le rôle et le nom', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      role: Role.DIRECTEUR_TRAVAUX,
      name: 'Nouveau Nom',
    });

    const result = await service.update(
      'u1',
      { role: Role.DIRECTEUR_TRAVAUX, name: 'Nouveau Nom' },
      { userId: 'admin', role: Role.ADMIN },
    );
    expect(result.role).toBe(Role.DIRECTEUR_TRAVAUX);
    expect(result.name).toBe('Nouveau Nom');
  });

  it('findSites retourne les chantiers assignés', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.siteMember.findMany.mockResolvedValue([
      {
        siteId: 's1',
        role: Role.CONDUCTEUR_TRAVAUX,
        site: { reference: 'SAN-2024-001', name: 'Sandaga' },
      },
    ]);

    const result = await service.findSites('u1');
    expect(result).toEqual([
      {
        siteId: 's1',
        role: Role.CONDUCTEUR_TRAVAUX,
        reference: 'SAN-2024-001',
        name: 'Sandaga',
      },
    ]);
  });
});
