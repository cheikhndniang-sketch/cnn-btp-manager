import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, Site, SiteStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from './sites.service';

describe('SitesService', () => {
  let service: SitesService;
  let prisma: {
    site: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    siteMember: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const sandaga: Site = {
    id: 's1',
    reference: 'SAN-2024-001',
    name: 'Marché Sandaga',
    location: 'Dakar',
    marcheHt: BigInt('6000000000'),
    tvaRate: new Prisma.Decimal(0.18),
    startDate: new Date('2024-01-15'),
    endDatePlanned: new Date('2026-12-31'),
    status: SiteStatus.ACTIVE,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      site: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      siteMember: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    service = new SitesService(prisma as unknown as PrismaService);
  });

  it('un admin voit tous les chantiers (aucun filtre de membre)', async () => {
    prisma.site.findMany.mockResolvedValue([sandaga]);

    const result = await service.findAll({
      userId: 'admin',
      role: Role.ADMIN,
    });

    expect(prisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].marcheHt).toBe(6000000000);
    expect(result[0].tvaRate).toBeCloseTo(0.18);
  });

  it('un conducteur ne voit que ses chantiers assignés', async () => {
    prisma.site.findMany.mockResolvedValue([sandaga]);

    await service.findAll({ userId: 'ct1', role: Role.CONDUCTEUR_TRAVAUX });

    expect(prisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { members: { some: { userId: 'ct1' } } },
      }),
    );
  });

  it('création avec une référence unique réussit', async () => {
    prisma.site.findUnique.mockResolvedValue(null);
    prisma.site.create.mockResolvedValue(sandaga);

    const result = await service.create({
      reference: 'SAN-2024-001',
      name: 'Marché Sandaga',
      marcheHt: 6000000000,
      startDate: '2024-01-15',
    });

    expect(result.reference).toBe('SAN-2024-001');
    expect(prisma.site.create).toHaveBeenCalled();
  });

  it('création avec une référence existante lève ConflictException', async () => {
    prisma.site.findUnique.mockResolvedValue(sandaga);

    await expect(
      service.create({
        reference: 'SAN-2024-001',
        name: 'Doublon',
        marcheHt: 1000,
        startDate: '2024-01-15',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('un conducteur non membre ne peut pas consulter un chantier', async () => {
    prisma.siteMember.findUnique.mockResolvedValue(null);
    await expect(
      service.findOne('s1', { userId: 'ct1', role: Role.CONDUCTEUR_TRAVAUX }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un conducteur membre peut consulter son chantier (avec membres)', async () => {
    prisma.siteMember.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.site.findUnique.mockResolvedValue({
      ...sandaga,
      members: [
        {
          userId: 'ct1',
          role: Role.CONDUCTEUR_TRAVAUX,
          joinedAt: new Date(),
          user: { username: 'ct', name: 'Conducteur' },
        },
      ],
    });

    const result = await service.findOne('s1', {
      userId: 'ct1',
      role: Role.CONDUCTEUR_TRAVAUX,
    });
    expect(result.members).toHaveLength(1);
    expect(result.members[0].username).toBe('ct');
  });

  it("findOne lève NotFoundException si le chantier n'existe pas", async () => {
    prisma.site.findUnique.mockResolvedValue(null);
    await expect(
      service.findOne('missing', { userId: 'a', role: Role.ADMIN }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archive passe le statut à ARCHIVED sans suppression', async () => {
    prisma.site.findUnique.mockResolvedValue(sandaga);
    prisma.site.update.mockResolvedValue({
      ...sandaga,
      status: SiteStatus.ARCHIVED,
    });

    const result = await service.archive('s1');
    expect(prisma.site.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: SiteStatus.ARCHIVED },
    });
    expect(result.status).toBe(SiteStatus.ARCHIVED);
  });

  it('getKpi retourne le budget et le nombre de membres', async () => {
    prisma.site.findUnique.mockResolvedValue({
      ...sandaga,
      _count: { members: 3 },
    });

    const kpi = await service.getKpi('s1', { userId: 'a', role: Role.ADMIN });
    expect(kpi.budgetTotal).toBe(6000000000);
    expect(kpi.membresCount).toBe(3);
    expect(kpi.avancementPct).toBe(0);
  });

  it('update modifie un chantier accessible', async () => {
    prisma.site.findUnique.mockResolvedValue(sandaga);
    prisma.site.update.mockResolvedValue({ ...sandaga, name: 'Nouveau nom' });

    const result = await service.update(
      's1',
      { name: 'Nouveau nom', marcheHt: 7000000000, tvaRate: 0.2 },
      { userId: 'a', role: Role.ADMIN },
    );
    expect(result.name).toBe('Nouveau nom');
    expect(prisma.site.update).toHaveBeenCalled();
  });

  it('getMembers retourne la liste des membres', async () => {
    prisma.siteMember.findMany.mockResolvedValue([
      {
        userId: 'u1',
        role: Role.DIRECTEUR_TRAVAUX,
        joinedAt: new Date(),
        user: { username: 'dt', name: 'DT' },
      },
    ]);
    const members = await service.getMembers('s1', {
      userId: 'a',
      role: Role.ADMIN,
    });
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe(Role.DIRECTEUR_TRAVAUX);
  });

  it('addMember refuse un doublon', async () => {
    prisma.site.findUnique.mockResolvedValue(sandaga);
    (prisma as unknown as { user: { findUnique: jest.Mock } }).user = {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1' }),
    };
    prisma.siteMember.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.addMember('s1', { userId: 'u1', role: Role.CONDUCTEUR_TRAVAUX }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removeMember lève NotFoundException si le membre est absent', async () => {
    prisma.siteMember.findUnique.mockResolvedValue(null);
    await expect(service.removeMember('s1', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
