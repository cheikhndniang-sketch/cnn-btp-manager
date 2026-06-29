import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SituationStatus } from '@prisma/client';

export class UpdateSituationDto {
  @IsOptional()
  @IsEnum(SituationStatus)
  status?: SituationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deductionAvance?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
