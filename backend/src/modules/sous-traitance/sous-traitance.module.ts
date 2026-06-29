import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SitesModule } from '../sites/sites.module';
import { SousTraitanceController } from './sous-traitance.controller';
import { SousTraitanceService } from './sous-traitance.service';

@Module({
  imports: [PrismaModule, SitesModule],
  controllers: [SousTraitanceController],
  providers: [SousTraitanceService],
})
export class SousTraitanceModule {}
