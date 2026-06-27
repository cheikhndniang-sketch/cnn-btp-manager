import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: Role;
}

/** Injecte l'utilisateur authentifié (issu du JWT) dans le handler. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return data ? request.user?.[data] : request.user;
  },
);
