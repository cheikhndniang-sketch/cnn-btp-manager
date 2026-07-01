import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateOuvrierDto, UpdateOuvrierDto } from './dto/create-ouvrier.dto';
import { UpsertPointageDto } from './dto/create-pointage.dto';
import { EffectifService } from './effectif.service';

@Controller('sites/:siteId/effectif')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EffectifController {
  constructor(private readonly effectif: EffectifService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role as Role };
  }

  // ── Ouvriers ──────────────────────────────────────────────────────────

  @Get('ouvriers')
  listOuvriers(
    @Param('siteId') siteId: string,
    @Query('actif') actif: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.effectif.listOuvriers(siteId, this.actor(user), actif === 'true');
  }

  @Post('ouvriers')
  createOuvrier(
    @Param('siteId') siteId: string,
    @Body() dto: CreateOuvrierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.effectif.createOuvrier(siteId, dto, this.actor(user));
  }

  @Patch('ouvriers/:id')
  updateOuvrier(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOuvrierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.effectif.updateOuvrier(siteId, id, dto, this.actor(user));
  }

  @Delete('ouvriers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeOuvrier(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.effectif.removeOuvrier(siteId, id, this.actor(user));
  }

  // ── Pointages ─────────────────────────────────────────────────────────

  @Get('pointages')
  listPointages(
    @Param('siteId') siteId: string,
    @Query('mois') mois: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const m = mois ?? new Date().toISOString().slice(0, 7);
    return this.effectif.listPointages(siteId, this.actor(user), m);
  }

  @Post('pointages')
  upsertPointage(
    @Param('siteId') siteId: string,
    @Body() dto: UpsertPointageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.effectif.upsertPointage(siteId, dto, this.actor(user));
  }

  @Delete('pointages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePointage(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.effectif.deletePointage(siteId, id, this.actor(user));
  }

  // ── Résumé mensuel ────────────────────────────────────────────────────

  @Get('resume')
  resumeMensuel(
    @Param('siteId') siteId: string,
    @Query('mois') mois: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const m = mois ?? new Date().toISOString().slice(0, 7);
    return this.effectif.resumeMensuel(siteId, this.actor(user), m);
  }
}
