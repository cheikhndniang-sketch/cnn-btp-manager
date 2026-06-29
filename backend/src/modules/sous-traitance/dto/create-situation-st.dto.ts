import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSituationSTDto {
  @IsInt()
  @Min(1)
  numero!: number;

  @IsString()
  periode!: string;

  @IsDateString()
  dateEmission!: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  montantHtPeriode?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
