import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { CreateRapportDto } from './dto/create-rapport.dto';
import { UpdateRapportDto } from './dto/update-rapport.dto';

const WRITER_ROLES: Role[] = [Role.ADMIN, Role.DIRECTEUR_PROJET, Role.DIRECTEUR_TRAVAUX, Role.CONDUCTEUR_TRAVAUX];

type Actor = { userId: string; role: Role };

@Injectable()
export class RapportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
  ) {}

  async list(siteId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    return this.prisma.rapportChantier.findMany({
      where: { siteId },
      orderBy: { date: 'desc' },
    });
  }

  async create(siteId: string, dto: CreateRapportDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!WRITER_ROLES.includes(actor.role))
      throw new ForbiddenException('Droits insuffisants');
    return this.prisma.rapportChantier.upsert({
      where: { siteId_date: { siteId, date: new Date(dto.date) } },
      create: {
        siteId,
        date: new Date(dto.date),
        meteo: dto.meteo,
        effectif: dto.effectif ?? 0,
        travauxRealises: dto.travauxRealises,
        materiaux: dto.materiaux,
        observations: dto.observations,
        incidents: dto.incidents,
        redacteurId: actor.userId,
      },
      update: {
        meteo: dto.meteo,
        effectif: dto.effectif ?? 0,
        travauxRealises: dto.travauxRealises,
        materiaux: dto.materiaux,
        observations: dto.observations,
        incidents: dto.incidents,
        redacteurId: actor.userId,
      },
    });
  }

  async update(siteId: string, id: string, dto: UpdateRapportDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!WRITER_ROLES.includes(actor.role))
      throw new ForbiddenException('Droits insuffisants');
    return this.prisma.rapportChantier.update({
      where: { id },
      data: {
        ...(dto.meteo !== undefined && { meteo: dto.meteo }),
        ...(dto.effectif !== undefined && { effectif: dto.effectif }),
        ...(dto.travauxRealises !== undefined && { travauxRealises: dto.travauxRealises }),
        ...(dto.materiaux !== undefined && { materiaux: dto.materiaux }),
        ...(dto.observations !== undefined && { observations: dto.observations }),
        ...(dto.incidents !== undefined && { incidents: dto.incidents }),
      },
    });
  }

  async remove(siteId: string, id: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!WRITER_ROLES.includes(actor.role))
      throw new ForbiddenException('Droits insuffisants');
    await this.prisma.rapportChantier.delete({ where: { id } });
  }
}
