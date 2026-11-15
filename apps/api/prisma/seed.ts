/**
 * Seeds data every environment needs: the first admin account and the badge catalogue.
 * Safe to run repeatedly. Run with: pnpm --filter @prodlike/api db:seed
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const BADGES = [
  {
    id: 'clean-rollback',
    name: 'Clean Rollback',
    description: 'Restored service within 2 minutes of an incident.',
  },
  {
    id: 'edge-case-hunter',
    name: 'Edge-Case Hunter',
    description: 'Covered a boundary case with a test before shipping.',
  },
  {
    id: 'canary-keeper',
    name: 'Canary Keeper',
    description: 'Shipped with a canary release and limited the blast radius.',
  },
];

async function main() {
  for (const b of BADGES) {
    await prisma.badge.upsert({
      where: { id: b.id },
      create: b,
      update: { name: b.name, description: b.description },
    });
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@prodlike.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists.`);
  } else if (!password || password.length < 10) {
    console.warn('ADMIN_PASSWORD is not set (min 10 characters): skipping admin account.');
  } else {
    await prisma.user.create({
      data: {
        email,
        name: 'Prodlike Admin',
        role: 'ADMIN',
        passwordHash: await hash(password, 12),
        onboardedAt: new Date(),
      },
    });
    console.log(`Created admin ${email}.`);
  }
  console.log(`Badges: ${BADGES.map((b) => b.id).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
