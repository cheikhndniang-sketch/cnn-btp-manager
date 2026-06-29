import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSousTraitantDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  nom?: string;

  @IsString()
  @IsOptional()
  contact?: string;
}
