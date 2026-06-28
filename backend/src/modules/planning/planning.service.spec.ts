import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { PlanningService } from './planning.service';

describe('PlanningService', () => {
  let service: PlanningService;
  let prisma: {
    site: { findUnique: jest.Mock };
    lot: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
    };
    task: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let sites: { assertCanAccess: jest.Mock };

  const admin = { userId: 'admin', role: Role.ADMIN };

  beforeEach(() => {
    prisma = {
      site: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }) },
      lot: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      task: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    sites = { assertCanAccess: jest.fn().mockResolvedValue(undefined) };
    service = new PlanningService(
      prisma as unknown as PrismaService,
      sites as unknown as SitesService,
    );
  });

  it("vérifie l'accès au chantier avant de lister les lots", async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    await service.listLots('s1', admin);
    expect(sites.assertCanAccess).toHaveBeenCalledWith('s1', admin);
  });

  it("propage le refus d'accès (ForbiddenException)", async () => {
    sites.assertCanAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.listLots('s1', admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('crée un lot avec un code unique', async () => {
    prisma.lot.findUnique.mockResolvedValue(null);
    prisma.lot.create.mockResolvedValue({
      id: 'l1',
      siteId: 's1',
      code: 'LOT-1',
      name: 'Gros œuvre',
      description: null,
      weight: 1,
      position: 0,
      tasks: [],
    });

    const lot = await service.createLot(
      's1',
      { code: 'LOT-1', name: 'Gros œuvre' },
      admin,
    );
    expect(lot.code).toBe('LOT-1');
    expect(lot.progressPct).toBe(0);
  });

  it('refuse un code de lot dupliqué (ConflictException)', async () => {
    prisma.lot.findUnique.mockResolvedValue({ id: 'l1' });
    await expect(
      service.createLot('s1', { code: 'LOT-1', name: 'Doublon' }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('création de tâche avec status DONE force progress=100', async () => {
    prisma.lot.findFirst.mockResolvedValue({ id: 'l1', siteId: 's1' });
    prisma.task.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 't1',
        lotId: 'l1',
        description: null,
        position: 0,
        startDate: null,
        endDate: null,
        ...data,
      }),
    );

    const task = await service.createTask(
      's1',
      'l1',
      { name: 'Fondations', status: TaskStatus.DONE },
      admin,
    );
    expect(task.progressPct).toBe(100);
    expect(task.status).toBe(TaskStatus.DONE);
  });

  it('mise à jour progress=100 bascule le statut en DONE', async () => {
    prisma.lot.findFirst.mockResolvedValue({ id: 'l1', siteId: 's1' });
    prisma.task.findFirst.mockResolvedValue({
      id: 't1',
      lotId: 'l1',
      progressPct: 50,
      status: TaskStatus.IN_PROGRESS,
    });
    prisma.task.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 't1',
        lotId: 'l1',
        name: 'Fondations',
        description: null,
        weight: 1,
        position: 0,
        startDate: null,
        endDate: null,
        ...data,
      }),
    );

    const task = await service.updateTask(
      's1',
      'l1',
      't1',
      { progressPct: 100 },
      admin,
    );
    expect(task.progressPct).toBe(100);
    expect(task.status).toBe(TaskStatus.DONE);
  });
});
