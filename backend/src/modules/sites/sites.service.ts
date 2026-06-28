import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, Site, SiteMember, SiteStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { siteProgress, LotLike } from '../planning/progress.util';
import {
  countLate,
  ScheduledLot,
  sitePlannedProgress,
} from '../planning/schedule.util';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

export interface SiteDto {
  id: string;
  reference: string;
  name: string;
  location: string | null;
  marcheHt: number;
  tvaRate: number;
  startDate: Date;
  endDatePlanned: Date | null;
  status: SiteStatus;
  description: string | null;
  avancementPct: number;
  avancementPlanifie: number;
  tasksLate: number;
  tasksTotal: number;
  createdAt: Date;
  updatedAt: Date;
}

type ScheduledTaskRow = {
  progressPct: number;
  weight: number;
  startDate: Date | null;
  endDate: Date | null;
};

/** Un chantier avec ses lots et tâches inclus (pour les calculs de planning). */
type SiteWithLots = Site & {
  lots?: Array<{ weight: number; tasks: ScheduledTaskRow[] }>;
};

export interface SiteKpi {
  avancementPct: number;
  avancementPlanifie: number;
  ecartPct: number;
  tasksLate: number;
  tasksTotal: number;
  retardMaxJours: number;
  budgetTotal: number;
  joursRestants: number;
  membresCount: number;
  alertesCount: number;
}

interface Actor {
  userId: string;
  role: Role;
}

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  static serialize(site: SiteWithLots): SiteDto {
    const rows = site.lots ?? [];
    const lots: LotLike[] = rows.map((l) => ({ weight: l.weight, tasks: l.tasks }));
    const scheduledLots: ScheduledLot[] = rows.map((l) => ({
      weight: l.weight,
      tasks: l.tasks,
    }));
    const asOf = new Date();
    const late = countLate(scheduledLots, asOf);
    return {
      id: site.id,
      reference: site.reference,
      name: site.name,
      location: site.location,
      marcheHt: Number(site.marcheHt),
      tvaRate: site.tvaRate.toNumber(),
      startDate: site.startDate,
      endDatePlanned: site.endDatePlanned,
      status: site.status,
      description: site.description,
      avancementPct: siteProgress(lots),
      avancementPlanifie: sitePlannedProgress(scheduledLots, asOf),
      tasksLate: late.tasksLate,
      tasksTotal: late.tasksTotal,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    };
  }

  /** Inclusion Prisma standard pour les calculs de planning (avancement + retards). */
  private static readonly PROGRESS_INCLUDE = {
    lots: {
      include: {
        tasks: {
          select: {
            progressPct: true,
            weight: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    },
  } satisfies Prisma.SiteInclude;

  /** ADMIN/DP voient tout ; DT/CT uniquement leurs chantiers assignés. */
  private hasGlobalScope(role: Role): boolean {
    return role === Role.ADMIN || role === Role.DIRECTEUR_PROJET;
  }

  /** Vérifie l'accès d'un acteur à un chantier (réutilisé par le module Planning). */
  async assertCanAccess(siteId: string, actor: Actor): Promise<void> {
    if (this.hasGlobalScope(actor.role)) return;

    const membership = await this.prisma.siteMember.findUnique({
      where: { siteId_userId: { siteId, userId: actor.userId } },
    });
    if (!membership) {
      throw new ForbiddenException("Vous n'avez pas accès à ce chantier");
    }
  }

  async findAll(actor: Actor): Promise<SiteDto[]> {
    let where: Prisma.SiteWhereInput = {};

    if (!this.hasGlobalScope(actor.role)) {
      where = { members: { some: { userId: actor.userId } } };
    }

    const sites = await this.prisma.site.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: SitesService.PROGRESS_INCLUDE,
    });
    return sites.map(SitesService.serialize);
  }

  async findOne(
    id: string,
    actor: Actor,
  ): Promise<SiteDto & { members: MemberView[] }> {
    await this.assertCanAccess(id, actor);

    const site = await this.prisma.site.findUnique({
      where: { id },
      include: {
        members: { include: { user: true } },
        ...SitesService.PROGRESS_INCLUDE,
      },
    });
    if (!site) {
      throw new NotFoundException('Chantier introuvable');
    }

    return {
      ...SitesService.serialize(site),
      members: site.members.map(mapMember),
    };
  }

  async create(dto: CreateSiteDto): Promise<SiteDto> {
    const existing = await this.prisma.site.findUnique({
      where: { reference: dto.reference },
    });
    if (existing) {
      throw new ConflictException('Cette référence de chantier existe déjà');
    }

    const site = await this.prisma.site.create({
      data: {
        reference: dto.reference,
        name: dto.name,
        location: dto.location ?? null,
        marcheHt: BigInt(dto.marcheHt),
        tvaRate: new Prisma.Decimal(dto.tvaRate ?? 0.18),
        startDate: new Date(dto.startDate),
        endDatePlanned: dto.endDatePlanned
          ? new Date(dto.endDatePlanned)
          : null,
        status: dto.status ?? SiteStatus.ACTIVE,
        description: dto.description ?? null,
      },
    });
    return SitesService.serialize(site);
  }

  async update(
    id: string,
    dto: UpdateSiteDto,
    actor: Actor,
  ): Promise<SiteDto> {
    await this.assertCanAccess(id, actor);

    const existing = await this.prisma.site.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Chantier introuvable');
    }

    const data: Prisma.SiteUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.marcheHt !== undefined) data.marcheHt = BigInt(dto.marcheHt);
    if (dto.tvaRate !== undefined)
      data.tvaRate = new Prisma.Decimal(dto.tvaRate);
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDatePlanned !== undefined)
      data.endDatePlanned = new Date(dto.endDatePlanned);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.description !== undefined) data.description = dto.description;

    const updated = await this.prisma.site.update({ where: { id }, data });
    return SitesService.serialize(updated);
  }

  /** Suppression = archivage logique (status=ARCHIVED). */
  async archive(id: string): Promise<SiteDto> {
    const existing = await this.prisma.site.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Chantier introuvable');
    }
    const updated = await this.prisma.site.update({
      where: { id },
      data: { status: SiteStatus.ARCHIVED },
    });
    return SitesService.serialize(updated);
  }

  async getMembers(id: string, actor: Actor): Promise<MemberView[]> {
    await this.assertCanAccess(id, actor);
    const members = await this.prisma.siteMember.findMany({
      where: { siteId: id },
      include: { user: true },
    });
    return members.map(mapMember);
  }

  async addMember(id: string, dto: AddMemberDto): Promise<MemberView> {
    const site = await this.prisma.site.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException('Chantier introuvable');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const existing = await this.prisma.siteMember.findUnique({
      where: { siteId_userId: { siteId: id, userId: dto.userId } },
    });
    if (existing) {
      throw new ConflictException('Cet utilisateur est déjà membre du chantier');
    }

    const member = await this.prisma.siteMember.create({
      data: { siteId: id, userId: dto.userId, role: dto.role },
      include: { user: true },
    });
    return mapMember(member);
  }

  async removeMember(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.siteMember.findUnique({
      where: { siteId_userId: { siteId: id, userId } },
    });
    if (!existing) {
      throw new NotFoundException('Membre introuvable sur ce chantier');
    }
    await this.prisma.siteMember.delete({
      where: { siteId_userId: { siteId: id, userId } },
    });
  }

  /** KPI synthétiques. avancementPct est calculé depuis les lots/tâches (Phase 2). */
  async getKpi(id: string, actor: Actor): Promise<SiteKpi> {
    await this.assertCanAccess(id, actor);

    const site = await this.prisma.site.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true } },
        ...SitesService.PROGRESS_INCLUDE,
      },
    });
    if (!site) {
      throw new NotFoundException('Chantier introuvable');
    }

    const joursRestants = site.endDatePlanned
      ? Math.max(
          0,
          Math.ceil(
            (site.endDatePlanned.getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 180;

    const scheduledLots: ScheduledLot[] = (site.lots ?? []).map((l) => ({
      weight: l.weight,
      tasks: l.tasks,
    }));
    const asOf = new Date();
    const avancementPct = siteProgress(
      scheduledLots.map((l) => ({ weight: l.weight, tasks: l.tasks })),
    );
    const avancementPlanifie = sitePlannedProgress(scheduledLots, asOf);
    const late = countLate(scheduledLots, asOf);

    return {
      avancementPct,
      avancementPlanifie,
      ecartPct: avancementPct - avancementPlanifie,
      tasksLate: late.tasksLate,
      tasksTotal: late.tasksTotal,
      retardMaxJours: late.retardMaxJours,
      budgetTotal: Number(site.marcheHt),
      joursRestants,
      membresCount: site._count.members,
      alertesCount: late.tasksLate,
    };
  }
}

export interface MemberView {
  userId: string;
  username: string;
  name: string;
  role: Role;
  joinedAt: Date;
}

function mapMember(
  member: SiteMember & { user: { username: string; name: string } },
): MemberView {
  return {
    userId: member.userId,
    username: member.user.username,
    name: member.user.name,
    role: member.role,
    joinedAt: member.joinedAt,
  };
}
