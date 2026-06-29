import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateLigneDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  avancementCumul?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
