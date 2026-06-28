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
import { lotProgress } from './progress.util';

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
    return lots.map(mapLot);
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
    return tasks.map(mapTask);
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

function mapTask(task: Task): TaskView {
  return {
    id: task.id,
    lotId: task.lotId,
    name: task.name,
    description: task.description,
    progressPct: task.progressPct,
    status: task.status,
    weight: task.weight,
    position: task.position,
    startDate: task.startDate,
    endDate: task.endDate,
  };
}

function mapLot(lot: Lot & { tasks: Task[] }): LotView {
  const tasks = lot.tasks.map(mapTask);
  return {
    id: lot.id,
    siteId: lot.siteId,
    code: lot.code,
    name: lot.name,
    description: lot.description,
    weight: lot.weight,
    position: lot.position,
    progressPct: lotProgress(tasks),
    tasks,
  };
}
