import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ContratSTStatusDto } from './create-contrat-st.dto';

export class UpdateContratSTDto {
  @IsString()
  @IsOptional()
  lotId?: string | null;

  @IsString()
  @MinLength(1)
  @IsOptional()
  reference?: string;

  @IsString()
  @MinLength(2)
  @IsOptional()
  intitule?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  montantHt?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tvaRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tauxRg?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  avanceForfaitaire?: number;

  @IsEnum(ContratSTStatusDto)
  @IsOptional()
  status?: ContratSTStatusDto;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
