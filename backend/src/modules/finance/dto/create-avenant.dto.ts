import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateAvenantDto {
  @IsInt()
  @Min(1)
  numero!: number;

  @IsString()
  @IsNotEmpty()
  objet!: string;

  @IsInt()
  montantHt!: number;

  @IsDateString()
  dateNotif!: string;

  @IsOptional()
  @IsDateString()
  dateApprobation?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
