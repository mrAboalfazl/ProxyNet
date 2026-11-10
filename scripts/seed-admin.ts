import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@platform.local';
  const password = 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    // Reset sequence if needed
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1) + 1, false) FROM users;`);
    admin = await prisma.user.create({
      data: {
        displayName: 'مدیر کل سیستم',
        email,
        phone: '09121111111',
        publicSlug: 'admin-master',
        role: 'admin',
        status: 'active',
      },
    });
  } else {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'admin', status: 'active' },
    });
  }

  // Ensure password credential
  const existingCred = await prisma.userCredential.findFirst({
    where: { userId: admin.id, method: 'password' },
  });
  if (!existingCred) {
    await prisma.userCredential.create({
      data: {
        userId: admin.id,
        method: 'password',
        credentialHash: passwordHash,
        email,
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

  // Ensure wallet
  await prisma.wallet.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      balanceToman: 10000000n,
      currency: 'IRR',
    },
    update: {
      balanceToman: 10000000n,
    },
  });

  console.log('Admin user ready:');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Role:', admin.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
