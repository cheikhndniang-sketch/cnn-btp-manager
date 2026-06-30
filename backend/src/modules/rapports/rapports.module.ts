import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { RapportsController } from './rapports.controller';
import { RapportsService } from './rapports.service';

@Module({
  imports: [SitesModule],
  controllers: [RapportsController],
  providers: [RapportsService],
})
export class RapportsModule {}
