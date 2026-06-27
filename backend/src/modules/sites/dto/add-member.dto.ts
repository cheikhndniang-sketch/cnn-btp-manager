import { IsEnum, IsString, IsUUID } from 'class-validator';
import { Role } from '@prisma/client';

export class AddMemberDto {
  @IsString()
  @IsUUID()
  userId!: string;

  @IsEnum(Role)
  role!: Role;
}
