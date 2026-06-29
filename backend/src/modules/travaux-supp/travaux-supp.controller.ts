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
import { CreateTsDto, UpdateTsDto } from './dto/create-ts.dto';
import { TravauxSuppService } from './travaux-supp.service';

@Controller('sites/:siteId/travaux-supp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TravauxSuppController {
  constructor(private readonly svc: TravauxSuppService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role as Role };
  }

  @Get()
  list(@Param('siteId') siteId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(siteId, this.actor(user));
  }

  @Post()
  create(
    @Param('siteId') siteId: string,
    @Body() dto: CreateTsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.create(siteId, dto, this.actor(user));
  }

  @Patch(':id')
  update(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(siteId, id, dto, this.actor(user));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.svc.remove(siteId, id, this.actor(user));
  }
}
