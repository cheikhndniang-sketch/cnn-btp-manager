import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SitesModule } from '../sites/sites.module';
import { EffectifController } from './effectif.controller';
import { EffectifService } from './effectif.service';

@Module({
  imports: [PrismaModule, SitesModule],
  controllers: [EffectifController],
  providers: [EffectifService],
})
export class EffectifModule {}
