import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum SituationSTStatusDto {
  BROUILLON = 'BROUILLON',
  VALIDEE = 'VALIDEE',
  PAYEE = 'PAYEE',
}

export class UpdateSituationSTDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  montantHtPeriode?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  deductionAvance?: number;

  @IsEnum(SituationSTStatusDto)
  @IsOptional()
  status?: SituationSTStatusDto;

  @IsString()
  @IsOptional()
  notes?: string;
}
