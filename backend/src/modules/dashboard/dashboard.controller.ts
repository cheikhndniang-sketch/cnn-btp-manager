import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('alerts')
  alerts(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getAlerts({ userId: user.userId, role: user.role as Role });
  }

  @Get('finance')
  financeGlobal(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getFinanceGlobal({
      userId: user.userId,
      role: user.role as Role,
    });
  }
}
