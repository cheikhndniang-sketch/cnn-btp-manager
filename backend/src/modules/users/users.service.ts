import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService, SafeUser } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findAll(query: QueryUsersDto): Promise<SafeUser[]> {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    return users.map(AuthService.sanitize);
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return AuthService.sanitize(user);
  }

  /**
   * Crée un utilisateur. Le mot de passe initial est généré aléatoirement
   * et retourné une seule fois (jamais stocké en clair).
   */
  async create(
    dto: CreateUserDto,
  ): Promise<{ user: SafeUser; temporaryPassword: string }> {
    const username = dto.username.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) {
      throw new ConflictException("Ce nom d'utilisateur existe déjà");
    }

    const temporaryPassword = UsersService.generatePassword();
    const rounds = Number(this.config.get<number>('BCRYPT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(temporaryPassword, rounds);

    const user = await this.prisma.user.create({
      data: {
        username,
        name: dto.name,
        email: dto.email ?? null,
        role: dto.role ?? Role.CONDUCTEUR_TRAVAUX,
        passwordHash,
        mustChangePassword: true,
      },
    });

    return { user: AuthService.sanitize(user), temporaryPassword };
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: { userId: string; role: Role },
  ): Promise<SafeUser> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const touchesPrivileged =
      dto.role !== undefined || dto.isActive !== undefined;
    if (touchesPrivileged && actor.role !== Role.ADMIN) {
      throw new BadRequestException(
        'Seul un administrateur peut modifier le rôle ou le statut',
      );
    }

    // Un admin ne peut pas se désactiver lui-même.
    if (dto.isActive === false && id === actor.userId) {
      throw new BadRequestException(
        'Vous ne pouvez pas désactiver votre propre compte',
      );
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.user.update({ where: { id }, data });
    return AuthService.sanitize(updated);
  }

  /** Désactivation logique : isActive=false, jamais de suppression physique. */
  async deactivate(
    id: string,
    actor: { userId: string },
  ): Promise<SafeUser> {
    if (id === actor.userId) {
      throw new BadRequestException(
        'Vous ne pouvez pas désactiver votre propre compte',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Couper les sessions de l'utilisateur désactivé.
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });

    return AuthService.sanitize(updated);
  }

  async findSites(id: string): Promise<
    Array<{ siteId: string; role: Role; reference: string; name: string }>
  > {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const members = await this.prisma.siteMember.findMany({
      where: { userId: id },
      include: { site: true },
    });

    return members.map((m) => ({
      siteId: m.siteId,
      role: m.role,
      reference: m.site.reference,
      name: m.site.name,
    }));
  }

  private static generatePassword(): string {
    // 16 caractères hex + symbole : suffisant comme mot de passe temporaire.
    return `Cse-${randomBytes(8).toString('hex')}!`;
  }
}

export type { User };
