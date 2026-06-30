/**
 * Seed runner for local execution against Railway production DB.
 * railway run --service backend injects DATABASE_PUBLIC_URL (external hostname).
 * We override DATABASE_URL so Prisma connects via the public URL instead of
 * the internal postgres.railway.internal which is unreachable locally.
 */
if (process.env.DATABASE_PUBLIC_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}
const { execSync } = require('child_process');
execSync('npm run prisma:seed', { stdio: 'inherit', env: process.env, cwd: __dirname + '/..' });
