-- Seed initial — utilisateurs et chantier demo
-- Idempotent : ON CONFLICT DO NOTHING (safe to run multiple times)

-- ── Utilisateurs ──────────────────────────────────────────────────────
INSERT INTO "User" (id, username, "passwordHash", email, name, role, "isActive", "mustChangePassword", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'admin',               '$2b$12$2s3PPaeIytoelTLT1vZZXOskzsVJmdSCspSpvxVtn7Qxn0TopfVOq', 'admin@cseimmobilier.sn',   'Administrateur CSE',              'ADMIN',               true, false, now(), now()),
  (gen_random_uuid(), 'directeur.projet',    '$2b$12$iTKME8yXXMMYrMP1a5n.K.PIhzlfvULkHZ/iRa0vP8K7HfU2SuZnm', 'dp@cseimmobilier.sn',      'Directeur de Projet',             'DIRECTEUR_PROJET',    true, false, now(), now()),
  (gen_random_uuid(), 'directeur.travaux',   '$2b$12$iTKME8yXXMMYrMP1a5n.K.PIhzlfvULkHZ/iRa0vP8K7HfU2SuZnm', 'dt@cseimmobilier.sn',      'Directeur de Travaux',            'DIRECTEUR_TRAVAUX',   true, false, now(), now()),
  (gen_random_uuid(), 'cheikh.conducteur',   '$2b$12$iTKME8yXXMMYrMP1a5n.K.PIhzlfvULkHZ/iRa0vP8K7HfU2SuZnm', 'cheikh@cseimmobilier.sn',  'Cheikh — Conducteur de travaux',  'CONDUCTEUR_TRAVAUX',  true, false, now(), now())
ON CONFLICT (username) DO NOTHING;

-- ── Chantier demo ────────────────────────────────────────────────────
INSERT INTO "Site" (id, reference, name, location, "marcheHt", "tvaRate", "tauxRg", "avanceForfaitaire", "startDate", "endDatePlanned", status, description, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'SAN-2024-001',
  'PROJET DE RECONSTRUCTION DU MARCHÉ SANDAGA',
  'Plateau, Dakar, Sénégal',
  6000000000,
  0.18,
  0.05,
  0,
  '2024-01-15',
  '2026-12-31',
  'ACTIVE',
  'Reconstruction du Marché Sandaga — 4 lots, plusieurs corps de métier et sous-traitants (~6 milliards FCFA).',
  now(),
  now()
)
ON CONFLICT (reference) DO NOTHING;

-- ── Membres du chantier ───────────────────────────────────────────────
INSERT INTO "SiteMember" (id, "siteId", "userId", role, "joinedAt")
SELECT
  gen_random_uuid(),
  s.id,
  u.id,
  u.role,
  now()
FROM "Site" s
CROSS JOIN "User" u
WHERE s.reference = 'SAN-2024-001'
  AND u.username IN ('admin', 'directeur.projet', 'directeur.travaux', 'cheikh.conducteur')
ON CONFLICT ("siteId", "userId") DO NOTHING;
