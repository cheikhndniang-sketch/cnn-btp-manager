import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, Lot, Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ImportPlanningDto } from './dto/import-planning.dto';
import { lotProgress } from './progress.util';
import {
  lotPlannedProgress,
  plannedProgress,
  taskLateness,
} from './schedule.util';
import { buildMspdi } from './mspdi.util';

interface Actor {
  userId: string;
  role: Role;
}

export interface TaskView {
  id: string;
  lotId: string;
  name: string;
  description: string | null;
  progressPct: number;
  plannedPct: number;
  enRetard: boolean;
  retardJours: number;
  aDemarrer: boolean;
  status: TaskStatus;
  weight: number;
  position: number;
  startDate: Date | null;
  endDate: Date | null;
}

export interface LotView {
  id: string;
  siteId: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  position: number;
  progressPct: number;
  plannedPct: number;
  tasksLate: number;
  tasksToStart: number;
  retardJoursMax: number;
  startDate: Date | null;
  endDate: Date | null;
  tasks: TaskView[];
}

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
  ) {}

  // ---- Lots ----

  async listLots(siteId: string, actor: Actor): Promise<LotView[]> {
    await this.sites.assertCanAccess(siteId, actor);
    const lots = await this.prisma.lot.findMany({
      where: { siteId },
      orderBy: [{ position: 'asc' }, { code: 'asc' }],
      include: { tasks: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    const asOf = new Date();
    return lots.map((l) => mapLot(l, asOf));
  }

  async createLot(
    siteId: string,
    dto: CreateLotDto,
    actor: Actor,
  ): Promise<LotView> {
    await this.sites.assertCanAccess(siteId, actor);
    await this.ensureSiteExists(siteId);

    const duplicate = await this.prisma.lot.findUnique({
      where: { siteId_code: { siteId, code: dto.code } },
    });
    if (duplicate) {
      throw new ConflictException('Un lot avec ce code existe déjà sur ce chantier');
    }

    const lot = await this.prisma.lot.create({
      data: {
        siteId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        weight: dto.weight ?? 1,
        position: dto.position ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      include: { tasks: true },
    });
    return mapLot(lot);
  }

  async updateLot(
    siteId: string,
    lotId: string,
    dto: UpdateLotDto,
    actor: Actor,
  ): Promise<LotView> {
    await this.sites.assertCanAccess(siteId, actor);
    await this.getLotOrThrow(siteId, lotId);

    const data: Prisma.LotUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.weight !== undefined) data.weight = dto.weight;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.montantMarcheHt !== undefined)
      data.montantMarcheHt = BigInt(Math.round(dto.montantMarcheHt));
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined)
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;

    const lot = await this.prisma.lot.update({
      where: { id: lotId },
      data,
      include: { tasks: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    return mapLot(lot);
  }

  async deleteLot(siteId: string, lotId: string, actor: Actor): Promise<void> {
    await this.sites.assertCanAccess(siteId, actor);
    await this.getLotOrThrow(siteId, lotId);
    await this.prisma.lot.delete({ where: { id: lotId } });
  }

  /**
   * Import en masse d'un planning (lots + tâches), typiquement depuis un .mpp/Excel.
   * `replace` remplace l'intégralité du planning existant du chantier.
   */
  async importPlanning(
    siteId: string,
    dto: ImportPlanningDto,
    actor: Actor,
  ): Promise<{ lots: number; tasks: number; dependencies: number }> {
    await this.sites.assertCanAccess(siteId, actor);
    await this.ensureSiteExists(siteId);

    const taskCount = dto.lots.reduce((acc, l) => acc + l.tasks.length, 0);
    let depCount = 0;

    await this.prisma.$transaction(async (tx) => {
      if (dto.replace) {
        await tx.lot.deleteMany({ where: { siteId } });
      }
      for (let i = 0; i < dto.lots.length; i++) {
        const lot = dto.lots[i];
        await tx.lot.create({
          data: {
            siteId,
            code: lot.code,
            name: lot.name,
            description: lot.description ?? null,
            weight: lot.weight ?? 1,
            position: i,
            tasks: {
              create: lot.tasks.map((t, j) => {
                const { progressPct, status } = reconcile(
                  t.progressPct ?? 0,
                  t.status ?? TaskStatus.NOT_STARTED,
                  t.progressPct !== undefined,
                  t.status !== undefined,
                );
                return {
                  name: t.name,
                  description: t.description ?? null,
                  progressPct,
                  status,
                  weight: t.weight ?? 1,
                  position: j,
                  startDate: t.startDate ? new Date(t.startDate) : null,
                  endDate: t.endDate ? new Date(t.endDate) : null,
                  mppUid: t.mppUid ?? null,
                };
              }),
            },
          },
        });
      }

      // 2ᵉ passe : relier les dépendances via les UID MS Project (mppUid).
      const rows = await tx.task.findMany({
        where: { lot: { siteId }, mppUid: { not: null } },
        select: { id: true, mppUid: true },
      });
      const byUid = new Map<number, string>();
      for (const r of rows) {
        if (r.mppUid !== null) byUid.set(r.mppUid, r.id);
      }

      const deps: Prisma.TaskDependencyCreateManyInput[] = [];
      for (const lot of dto.lots) {
        for (const t of lot.tasks) {
          if (t.mppUid === undefined || !t.predecessors?.length) continue;
          const successorId = byUid.get(t.mppUid);
          if (!successorId) continue;
          for (const p of t.predecessors) {
            const predecessorId = byUid.get(p.fromUid);
            if (!predecessorId || predecessorId === successorId) continue;
            deps.push({
              successorId,
              predecessorId,
              type: p.type,
              lagDays: p.lagDays,
            });
          }
        }
      }
      if (deps.length > 0) {
        const created = await tx.taskDependency.createMany({
          data: deps,
          skipDuplicates: true,
        });
        depCount = created.count;
      }
    });

    return { lots: dto.lots.length, tasks: taskCount, dependencies: depCount };
  }

  /** Génère le planning au format XML MS Project (MSPDI). */
  async exportMspdi(
    siteId: string,
    actor: Actor,
  ): Promise<{ xml: string; filename: string }> {
    await this.sites.assertCanAccess(siteId, actor);
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Chantier introuvable');
    }
    const lots = await this.prisma.lot.findMany({
      where: { siteId },
      orderBy: [{ position: 'asc' }, { code: 'asc' }],
      include: {
        tasks: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: { predecessors: true },
        },
      },
    });

    const xml = buildMspdi(
      { name: site.name, reference: site.reference },
      lots.map((l) => ({
        code: l.code,
        name: l.name,
        progressPct: lotProgress(l.tasks),
        tasks: l.tasks.map((t) => ({
          id: t.id,
          name: t.name,
          progressPct: t.progressPct,
          startDate: t.startDate,
          endDate: t.endDate,
          predecessors: t.predecessors.map((d) => ({
            predecessorId: d.predecessorId,
            type: d.type,
            lagDays: d.lagDays,
          })),
        })),
      })),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    return { xml, filename: `Planning-${site.reference}-${stamp}.xml` };
  }

  // ---- Tâches ----

  async listTasks(
    siteId: string,
    lotId: string,
    actor: Actor,
  ): Promise<TaskView[]> {
    await this.sites.assertCanAccess(siteId, actor);
    await this.getLotOrThrow(siteId, lotId);
    const tasks = await this.prisma.task.findMany({
      where: { lotId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const asOf = new Date();
    return tasks.map((t) => mapTask(t, asOf));
  }

  async createTask(
    siteId: string,
    lotId: string,
    dto: CreateTaskDto,
    actor: Actor,
  ): Promise<TaskView> {
    await this.sites.assertCanAccess(siteId, actor);
    await this.getLotOrThrow(siteId, lotId);

    const { progressPct, status } = reconcile(
      dto.progressPct ?? 0,
      dto.status ?? TaskStatus.NOT_STARTED,
      dto.progressPct !== undefined,
      dto.status !== undefined,
    );

    const task = await this.prisma.task.create({
      data: {
        lotId,
        name: dto.name,
        description: dto.description ?? null,
        progressPct,
        status,
        weight: dto.weight ?? 1,
        position: dto.position ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
    return mapTask(task);
  }

  async updateTask(
    siteId: string,
    lotId: string,
    taskId: string,
    dto: UpdateTaskDto,
    actor: Actor,
  ): Promise<TaskView> {
    await this.sites.assertCanAccess(siteId, actor);
    await this.getLotOrThrow(siteId, lotId);

    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, lotId },
    });
    if (!existing) {
      throw new NotFoundException('Tâche introuvable');
    }

    const { progressPct, status } = reconcile(
      dto.progressPct ?? existing.progressPct,
      dto.status ?? existing.status,
      dto.progressPct !== undefined,
      dto.status !== undefined,
    );

    const data: Prisma.TaskUpdateInput = { progressPct, status };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.weight !== undefined) data.weight = dto.weight;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined)
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data,
    });
    return mapTask(task);
  }

  async deleteTask(
    siteId: string,
    lotId: string,
    taskId: string,
    actor: Actor,
  ): Promise<void> {
    await this.sites.assertCanAccess(siteId, actor);
    await this.getLotOrThrow(siteId, lotId);
    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, lotId },
    });
    if (!existing) {
      throw new NotFoundException('Tâche introuvable');
    }
    await this.prisma.task.delete({ where: { id: taskId } });
  }

  // ---- Helpers ----

  private async ensureSiteExists(siteId: string): Promise<void> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Chantier introuvable');
    }
  }

  private async getLotOrThrow(siteId: string, lotId: string): Promise<Lot> {
    const lot = await this.prisma.lot.findFirst({ where: { id: lotId, siteId } });
    if (!lot) {
      throw new NotFoundException('Lot introuvable sur ce chantier');
    }
    return lot;
  }
}

/**
 * Cohérence statut <-> avancement :
 * - status DONE   => 100 %
 * - progress 100  => DONE
 * - progress 0    => NOT_STARTED (sauf statut explicite, ex. BLOCKED)
 * - 1..99         => IN_PROGRESS (sauf statut explicite)
 */
function reconcile(
  progressPct: number,
  status: TaskStatus,
  progressProvided = true,
  statusProvided = true,
): { progressPct: number; status: TaskStatus } {
  let p = Math.min(100, Math.max(0, progressPct));
  let s = status;

  if (statusProvided && s === TaskStatus.DONE) {
    p = 100;
  } else if (progressProvided && p === 100) {
    s = TaskStatus.DONE;
  } else if (progressProvided && !statusProvided) {
    if (p === 0) s = TaskStatus.NOT_STARTED;
    else if (p < 100) s = TaskStatus.IN_PROGRESS;
  }
  return { progressPct: p, status: s };
}

function mapTask(task: Task, asOf: Date = new Date()): TaskView {
  const { enRetard, retardJours } = taskLateness(
    task.endDate,
    task.progressPct,
    asOf,
  );
  // À démarrer : avancement 0 %, date de début passée, et pas (encore) en retard de fin.
  const aDemarrer =
    !enRetard &&
    task.progressPct === 0 &&
    task.startDate !== null &&
    task.startDate.getTime() <= asOf.getTime();
  return {
    id: task.id,
    lotId: task.lotId,
    name: task.name,
    description: task.description,
    progressPct: task.progressPct,
    plannedPct: plannedProgress(task.startDate, task.endDate, asOf),
    enRetard,
    retardJours,
    aDemarrer,
    status: task.status,
    weight: task.weight,
    position: task.position,
    startDate: task.startDate,
    endDate: task.endDate,
  };
}

function mapLot(lot: Lot & { tasks: Task[] }, asOf: Date = new Date()): LotView {
  const tasks = lot.tasks.map((t) => mapTask(t, asOf));
  const starts = lot.tasks.map((t) => t.startDate).filter((d): d is Date => !!d);
  const finishes = lot.tasks.map((t) => t.endDate).filter((d): d is Date => !!d);
  const startDate =
    lot.startDate ??
    (starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null);
  const endDate =
    lot.endDate ??
    (finishes.length ? new Date(Math.max(...finishes.map((d) => d.getTime()))) : null);
  return {
    id: lot.id,
    siteId: lot.siteId,
    code: lot.code,
    name: lot.name,
    description: lot.description,
    weight: lot.weight,
    position: lot.position,
    startDate,
    endDate,
    progressPct: lotProgress(tasks),
    plannedPct: lotPlannedProgress(
      lot.tasks.map((t) => ({
        progressPct: t.progressPct,
        weight: t.weight,
        startDate: t.startDate,
        endDate: t.endDate,
      })),
      asOf,
    ),
    tasksLate: tasks.filter((t) => t.enRetard).length,
    tasksToStart: tasks.filter((t) => t.aDemarrer).length,
    retardJoursMax: tasks.reduce((m, t) => Math.max(m, t.retardJours), 0),
    tasks,
  };
}
