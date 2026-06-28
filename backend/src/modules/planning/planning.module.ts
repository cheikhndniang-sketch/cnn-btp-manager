import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';

@Module({
  imports: [SitesModule],
  controllers: [PlanningController],
  providers: [PlanningService],
})
export class PlanningModule {}
