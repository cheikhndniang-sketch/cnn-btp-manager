import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSituationDto } from './dto/create-situation.dto';
import { UpdateSituationDto } from './dto/update-situation.dto';
import { UpdateLigneDto } from './dto/update-ligne.dto';
import { CreateAvenantDto } from './dto/create-avenant.dto';
import { FinanceService } from './finance.service';

@Controller('sites/:siteId/finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role as Role };
  }

  /* ── Situations ─────────────────────────────────────────────────── */

  @Get('situations')
  list(@Param('siteId') siteId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.finance.listSituations(siteId, this.actor(user));
  }

  @Get('situations/:id')
  get(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.getSituation(siteId, id, this.actor(user));
  }

  @Post('situations')
  create(
    @Param('siteId') siteId: string,
    @Body() dto: CreateSituationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.createSituation(siteId, dto, this.actor(user));
  }

  @Patch('situations/:id')
  update(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSituationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.updateSituation(siteId, id, dto, this.actor(user));
  }

  @Delete('situations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.finance.deleteSituation(siteId, id, this.actor(user));
  }

  /* ── Lignes ─────────────────────────────────────────────────────── */

  @Patch('situations/:situationId/lignes/:ligneId')
  updateLigne(
    @Param('siteId') siteId: string,
    @Param('situationId') situationId: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: UpdateLigneDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.updateLigne(siteId, situationId, ligneId, dto, this.actor(user));
  }

  /* ── Budget lot ─────────────────────────────────────────────────── */

  @Patch('lots/:lotId/budget')
  updateLotBudget(
    @Param('siteId') siteId: string,
    @Param('lotId') lotId: string,
    @Body('montantMarcheHt') montantMarcheHt: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.updateLotBudget(siteId, lotId, montantMarcheHt, this.actor(user));
  }

  /* ── Avenants ───────────────────────────────────────────────────── */

  @Get('avenants')
  listAvenants(@Param('siteId') siteId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.finance.listAvenants(siteId, this.actor(user));
  }

  @Post('avenants')
  createAvenant(
    @Param('siteId') siteId: string,
    @Body() dto: CreateAvenantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.createAvenant(siteId, dto, this.actor(user));
  }

  @Patch('avenants/:avenantId')
  updateAvenant(
    @Param('siteId') siteId: string,
    @Param('avenantId') avenantId: string,
    @Body() dto: Partial<CreateAvenantDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.updateAvenant(siteId, avenantId, dto, this.actor(user));
  }

  @Delete('avenants/:avenantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvenant(
    @Param('siteId') siteId: string,
    @Param('avenantId') avenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.finance.deleteAvenant(siteId, avenantId, this.actor(user));
  }
}
