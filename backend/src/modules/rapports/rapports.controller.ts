import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateRapportDto } from './dto/create-rapport.dto';
import { UpdateRapportDto } from './dto/update-rapport.dto';
import { RapportsService } from './rapports.service';

@Controller('sites/:siteId/rapports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RapportsController {
  constructor(private readonly rapports: RapportsService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role as Role };
  }

  @Get()
  list(@Param('siteId') siteId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rapports.list(siteId, this.actor(user));
  }

  @Post()
  create(
    @Param('siteId') siteId: string,
    @Body() dto: CreateRapportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rapports.create(siteId, dto, this.actor(user));
  }

  @Patch(':id')
  update(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRapportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rapports.update(siteId, id, dto, this.actor(user));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.rapports.remove(siteId, id, this.actor(user));
  }
}
