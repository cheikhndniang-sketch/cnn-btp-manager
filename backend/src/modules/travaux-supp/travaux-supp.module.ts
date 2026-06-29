import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SitesModule } from '../sites/sites.module';
import { TravauxSuppController } from './travaux-supp.controller';
import { TravauxSuppService } from './travaux-supp.service';

@Module({
  imports: [PrismaModule, SitesModule],
  controllers: [TravauxSuppController],
  providers: [TravauxSuppService],
})
export class TravauxSuppModule {}
