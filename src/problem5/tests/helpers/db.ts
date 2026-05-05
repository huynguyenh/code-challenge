// Shared test fixtures. Both test files share a single Postgres + a
// single seeded demo user, so the precondition probe and the disconnect
// teardown are identical — extracted once here.
import { prisma } from '../../src/lib/prisma.js';

const SEED_HINT =
  'Run `yarn p5:db:migrate && yarn p5:db:seed` first.';

export async function ensureDemoUser() {
  const user = await prisma.user.findUnique({
    where: { email: 'demo@example.com' },
  });
  if (!user) {
    throw new Error(`Demo user not found. ${SEED_HINT}`);
  }
  return user;
}

export const disconnect = () => prisma.$disconnect();
