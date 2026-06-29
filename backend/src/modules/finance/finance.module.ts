import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SitesModule } from '../sites/sites.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [PrismaModule, SitesModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
