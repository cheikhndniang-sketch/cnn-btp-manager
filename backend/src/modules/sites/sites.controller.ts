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
import { AddMemberDto } from './dto/add-member.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { SitesService } from './sites.service';

@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.sites.findAll({ userId: user.userId, role: user.role });
  }

  @Post()
  @Roles(Role.DIRECTEUR_PROJET)
  create(@Body() dto: CreateSiteDto) {
    return this.sites.create(dto);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sites.findOne(id, { userId: user.userId, role: user.role });
  }

  @Patch(':id')
  @Roles(Role.DIRECTEUR_TRAVAUX)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sites.update(id, dto, {
      userId: user.userId,
      role: user.role,
    });
  }

  @Delete(':id')
  @Roles(Role.DIRECTEUR_PROJET)
  archive(@Param('id') id: string) {
    return this.sites.archive(id);
  }

  @Get(':id/members')
  getMembers(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sites.getMembers(id, { userId: user.userId, role: user.role });
  }

  @Post(':id/members')
  @Roles(Role.DIRECTEUR_PROJET)
  addMember(@Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.sites.addMember(id, dto);
  }

  @Delete(':id/members/:userId')
  @Roles(Role.DIRECTEUR_PROJET)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.sites.removeMember(id, userId);
  }

  @Get(':id/kpi')
  getKpi(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sites.getKpi(id, { userId: user.userId, role: user.role });
  }
}
