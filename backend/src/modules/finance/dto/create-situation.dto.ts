import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Matches,
} from 'class-validator';

export class CreateSituationDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  numero!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'periode doit être au format YYYY-MM' })
  periode!: string;

  @IsDateString()
  dateEmission!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
