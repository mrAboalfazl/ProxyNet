import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const userId = 1n;
  const user = await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      displayName: 'BitServer Gateway Test',
      email: 'bitserver@local.test',
      phone: '09120000000',
      publicSlug: 'bitserver-test',
      role: 'user',
      status: 'active',
    },
    update: {
      status: 'active',
    },
  });

  const secret = 'test_secret_bitserver_2026';
  const secretHash = await bcrypt.hash(secret, 10);
  const uuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

  await prisma.proxyCredential.upsert({
    where: { uuid },
    create: {
      userId: user.id,
      uuid,
      secretHash,
      label: 'BitServer Gateway',
      enabled: true,
    },
    update: {
      secretHash,
      enabled: true,
      revokedAt: null,
    },
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      balanceToman: 500000n,
      currency: 'IRR',
    },
    update: {
      balanceToman: 500000n,
    },
  });

  const passwordHash = await bcrypt.hash('admin123', 10);
  const existingCred = await prisma.userCredential.findFirst({
    where: { userId: user.id, method: 'password' },
  });
  if (!existingCred) {
    await prisma.userCredential.create({
      data: {
        userId: user.id,
        method: 'password',
        credentialHash: passwordHash,
        email: user.email,
        isPrimary: true,
        enabled: true,
      },
    });
  } else {
    await prisma.userCredential.update({
      where: { id: existingCred.id },
      data: { credentialHash: passwordHash, enabled: true },
    });
  }

  console.log('BitServer Test User Seeded Successfully:');
  console.log('UUID:', uuid);
  console.log('Secret:', secret);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
