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
import { SousTraitanceService } from './sous-traitance.service';
import { CreateSousTraitantDto } from './dto/create-sous-traitant.dto';
import { UpdateSousTraitantDto } from './dto/update-sous-traitant.dto';
import { CreateContratSTDto } from './dto/create-contrat-st.dto';
import { UpdateContratSTDto } from './dto/update-contrat-st.dto';
import { CreateSituationSTDto } from './dto/create-situation-st.dto';
import { UpdateSituationSTDto } from './dto/update-situation-st.dto';

@Controller('sites/:siteId/sous-traitance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SousTraitanceController {
  constructor(private readonly st: SousTraitanceService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role as Role };
  }

  /* ── Sous-traitants ─────────────────────────────────────────────── */

  @Get('sous-traitants')
  listST(@Param('siteId') siteId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.st.listSousTraitants(siteId, this.actor(user));
  }

  @Post('sous-traitants')
  createST(
    @Param('siteId') siteId: string,
    @Body() dto: CreateSousTraitantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.st.createSousTraitant(siteId, dto, this.actor(user));
  }

  @Patch('sous-traitants/:id')
  updateST(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSousTraitantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.st.updateSousTraitant(siteId, id, dto, this.actor(user));
  }

  @Delete('sous-traitants/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteST(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.st.deleteSousTraitant(siteId, id, this.actor(user));
  }

  /* ── Contrats ───────────────────────────────────────────────────── */

  @Post('contrats')
  createContrat(
    @Param('siteId') siteId: string,
    @Body() dto: CreateContratSTDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.st.createContrat(siteId, dto, this.actor(user));
  }

  @Patch('contrats/:contratId')
  updateContrat(
    @Param('siteId') siteId: string,
    @Param('contratId') contratId: string,
    @Body() dto: UpdateContratSTDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.st.updateContrat(siteId, contratId, dto, this.actor(user));
  }

  @Delete('contrats/:contratId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContrat(
    @Param('siteId') siteId: string,
    @Param('contratId') contratId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.st.deleteContrat(siteId, contratId, this.actor(user));
  }

  /* ── Situations ST ──────────────────────────────────────────────── */

  @Post('contrats/:contratId/situations')
  createSituationST(
    @Param('siteId') siteId: string,
    @Param('contratId') contratId: string,
    @Body() dto: CreateSituationSTDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.st.createSituationST(siteId, contratId, dto, this.actor(user));
  }

  @Patch('contrats/:contratId/situations/:situationId')
  updateSituationST(
    @Param('siteId') siteId: string,
    @Param('contratId') contratId: string,
    @Param('situationId') situationId: string,
    @Body() dto: UpdateSituationSTDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.st.updateSituationST(siteId, contratId, situationId, dto, this.actor(user));
  }

  @Delete('contrats/:contratId/situations/:situationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSituationST(
    @Param('siteId') siteId: string,
    @Param('contratId') contratId: string,
    @Param('situationId') situationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.st.deleteSituationST(siteId, contratId, situationId, this.actor(user));
  }
}
