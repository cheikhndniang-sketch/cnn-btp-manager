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
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PlanningService } from './planning.service';

@Controller('sites/:siteId')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role };
  }

  // ---- Lots ----

  @Get('lots')
  listLots(
    @Param('siteId') siteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.listLots(siteId, this.actor(user));
  }

  @Post('lots')
  @Roles(Role.DIRECTEUR_TRAVAUX)
  createLot(
    @Param('siteId') siteId: string,
    @Body() dto: CreateLotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.createLot(siteId, dto, this.actor(user));
  }

  @Patch('lots/:lotId')
  @Roles(Role.DIRECTEUR_TRAVAUX)
  updateLot(
    @Param('siteId') siteId: string,
    @Param('lotId') lotId: string,
    @Body() dto: UpdateLotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.updateLot(siteId, lotId, dto, this.actor(user));
  }

  @Delete('lots/:lotId')
  @Roles(Role.DIRECTEUR_TRAVAUX)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLot(
    @Param('siteId') siteId: string,
    @Param('lotId') lotId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.planning.deleteLot(siteId, lotId, this.actor(user));
  }

  // ---- Tâches (un conducteur peut créer/mettre à jour l'avancement) ----

  @Get('lots/:lotId/tasks')
  listTasks(
    @Param('siteId') siteId: string,
    @Param('lotId') lotId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.listTasks(siteId, lotId, this.actor(user));
  }

  @Post('lots/:lotId/tasks')
  @Roles(Role.CONDUCTEUR_TRAVAUX)
  createTask(
    @Param('siteId') siteId: string,
    @Param('lotId') lotId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.createTask(siteId, lotId, dto, this.actor(user));
  }

  @Patch('lots/:lotId/tasks/:taskId')
  @Roles(Role.CONDUCTEUR_TRAVAUX)
  updateTask(
    @Param('siteId') siteId: string,
    @Param('lotId') lotId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.planning.updateTask(siteId, lotId, taskId, dto, this.actor(user));
  }

  @Delete('lots/:lotId/tasks/:taskId')
  @Roles(Role.DIRECTEUR_TRAVAUX)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(
    @Param('siteId') siteId: string,
    @Param('lotId') lotId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.planning.deleteTask(siteId, lotId, taskId, this.actor(user));
  }
}
