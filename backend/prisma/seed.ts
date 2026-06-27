import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rounds = 12;
  const adminHash = await bcrypt.hash('Admin@2026!', rounds);
  const userHash = await bcrypt.hash('User@2026!', rounds);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminHash,
      name: 'Administrateur CSE',
      role: Role.ADMIN,
      email: 'admin@cseimmobilier.sn',
    },
  });

  const dp = await prisma.user.upsert({
    where: { username: 'directeur.projet' },
    update: {},
    create: {
      username: 'directeur.projet',
      passwordHash: userHash,
      name: 'Directeur de Projet',
      role: Role.DIRECTEUR_PROJET,
      email: 'dp@cseimmobilier.sn',
    },
  });

  const dt = await prisma.user.upsert({
    where: { username: 'directeur.travaux' },
    update: {},
    create: {
      username: 'directeur.travaux',
      passwordHash: userHash,
      name: 'Directeur de Travaux',
      role: Role.DIRECTEUR_TRAVAUX,
      email: 'dt@cseimmobilier.sn',
    },
  });

  const ct = await prisma.user.upsert({
    where: { username: 'cheikh.conducteur' },
    update: {},
    create: {
      username: 'cheikh.conducteur',
      passwordHash: userHash,
      name: 'Cheikh — Conducteur de travaux',
      role: Role.CONDUCTEUR_TRAVAUX,
      email: 'cheikh@cseimmobilier.sn',
    },
  });

  const site = await prisma.site.upsert({
    where: { reference: 'SAN-2024-001' },
    update: {},
    create: {
      reference: 'SAN-2024-001',
      name: 'PROJET DE RECONSTRUCTION DU MARCHÉ SANDAGA',
      location: 'Plateau, Dakar, Sénégal',
      marcheHt: BigInt('6000000000'),
      tvaRate: 0.18,
      startDate: new Date('2024-01-15'),
      endDatePlanned: new Date('2026-12-31'),
      status: 'ACTIVE',
      description:
        'Reconstruction du Marché Sandaga — 4 lots, plusieurs corps de métier et sous-traitants (~6 milliards FCFA).',
    },
  });

  // Affecter tous les utilisateurs opérationnels au chantier Sandaga
  const assignments: Array<[{ id: string }, Role]> = [
    [dp, Role.DIRECTEUR_PROJET],
    [dt, Role.DIRECTEUR_TRAVAUX],
    [ct, Role.CONDUCTEUR_TRAVAUX],
  ];

  for (const [user, role] of assignments) {
    await prisma.siteMember.upsert({
      where: { siteId_userId: { siteId: site.id, userId: user.id } },
      update: {},
      create: { siteId: site.id, userId: user.id, role },
    });
  }

  // L'admin est également membre (rôle ADMIN) pour visibilité complète
  await prisma.siteMember.upsert({
    where: { siteId_userId: { siteId: site.id, userId: admin.id } },
    update: {},
    create: { siteId: site.id, userId: admin.id, role: Role.ADMIN },
  });

  console.log('✓ Seed terminé');
  console.log('  Chantier : SAN-2024-001 — Marché Sandaga');
  console.log('  admin / Admin@2026!');
  console.log('  directeur.projet / User@2026!');
  console.log('  directeur.travaux / User@2026!');
  console.log('  cheikh.conducteur / User@2026!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
