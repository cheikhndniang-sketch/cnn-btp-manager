import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SituationStatus } from '@prisma/client';

export class UpdateSituationDto {
  @IsOptional()
  @IsEnum(SituationStatus)
  status?: SituationStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
