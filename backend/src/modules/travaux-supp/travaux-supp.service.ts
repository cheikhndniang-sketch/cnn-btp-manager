import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, TSStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { CreateTsDto, UpdateTsDto } from './dto/create-ts.dto';

const WRITER_ROLES: Role[] = [Role.ADMIN, Role.DIRECTEUR_PROJET, Role.DIRECTEUR_TRAVAUX];

type Actor = { userId: string; role: Role };

function mapTs(ts: {
  id: string;
  siteId: string;
  lotId: string | null;
  reference: string;
  description: string;
  montantHt: bigint;
  tvaRate: { toNumber(): number };
  status: TSStatus;
  dateNotif: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  lot: { code: string; name: string } | null;
}) {
  const montantHt = Number(ts.montantHt);
  const tvaRate = ts.tvaRate.toNumber();
  const montantTva = Math.round(montantHt * tvaRate);
  return {
    id: ts.id,
    siteId: ts.siteId,
    lotId: ts.lotId,
    lotCode: ts.lot?.code ?? null,
    lotName: ts.lot?.name ?? null,
    reference: ts.reference,
    description: ts.description,
    montantHt,
    tvaRate,
    montantTva,
    montantTtc: montantHt + montantTva,
    status: ts.status,
    dateNotif: ts.dateNotif?.toISOString().split('T')[0] ?? null,
    notes: ts.notes,
    createdAt: ts.createdAt.toISOString(),
    updatedAt: ts.updatedAt.toISOString(),
  };
}

const TS_SELECT = {
  id: true,
  siteId: true,
  lotId: true,
  reference: true,
  description: true,
  montantHt: true,
  tvaRate: true,
  status: true,
  dateNotif: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  lot: { select: { code: true, name: true } },
} as const;

@Injectable()
export class TravauxSuppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
  ) {}

  async list(siteId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    const rows = await this.prisma.travauxSupp.findMany({
      where: { siteId },
      orderBy: { createdAt: 'asc' },
      select: TS_SELECT,
    });
    return rows.map(mapTs);
  }

  async create(siteId: string, dto: CreateTsDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!WRITER_ROLES.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    const ts = await this.prisma.travauxSupp.create({
      data: {
        siteId,
        lotId: dto.lotId || null,
        reference: dto.reference,
        description: dto.description,
        montantHt: BigInt(Math.round(dto.montantHt)),
        tvaRate: dto.tvaRate ?? 0.18,
        dateNotif: dto.dateNotif ? new Date(dto.dateNotif) : null,
        notes: dto.notes,
      },
      select: TS_SELECT,
    });
    return mapTs(ts);
  }

  async update(siteId: string, id: string, dto: UpdateTsDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!WRITER_ROLES.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    const existing = await this.prisma.travauxSupp.findFirst({ where: { id, siteId } });
    if (!existing) throw new NotFoundException('TS introuvable');

    const data: Record<string, unknown> = {};
    if (dto.reference !== undefined) data['reference'] = dto.reference;
    if (dto.description !== undefined) data['description'] = dto.description;
    if (dto.montantHt !== undefined) data['montantHt'] = BigInt(Math.round(dto.montantHt));
    if (dto.tvaRate !== undefined) data['tvaRate'] = dto.tvaRate;
    if ('lotId' in dto) data['lotId'] = dto.lotId ?? null;
    if (dto.status !== undefined) data['status'] = dto.status;
    if (dto.dateNotif !== undefined) data['dateNotif'] = dto.dateNotif ? new Date(dto.dateNotif) : null;
    if (dto.notes !== undefined) data['notes'] = dto.notes;

    const ts = await this.prisma.travauxSupp.update({
      where: { id },
      data,
      select: TS_SELECT,
    });
    return mapTs(ts);
  }

  async remove(siteId: string, id: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!WRITER_ROLES.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    const existing = await this.prisma.travauxSupp.findFirst({ where: { id, siteId } });
    if (!existing) throw new NotFoundException('TS introuvable');
    if (existing.status !== TSStatus.BROUILLON) {
      throw new BadRequestException('Seul un TS en brouillon peut être supprimé');
    }
    await this.prisma.travauxSupp.delete({ where: { id } });
  }
}
