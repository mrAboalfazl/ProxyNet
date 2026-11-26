import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.country.upsert({
    where: { code: 'DE' },
    create: { code: 'DE', name: 'Germany' },
    update: { enabled: true },
  });

  let node = await prisma.node.findFirst({ where: { label: 'DE-01 Demo' } });
  if (!node) {
    node = await prisma.node.create({
      data: {
        countryCode: 'DE',
        label: 'DE-01 Demo',
        visibility: 'public',
        roles: ['edge', 'exit'],
        status: 'healthy',
        ipv4Address: '185.140.12.192',
      },
    });
  }
  await prisma.nodeHeartbeat.create({
    data: { nodeId: node.id, agentVersion: 'v1.2.0' },
  });

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@platform.local' },
  });
  if (!admin) throw new Error('admin@platform.local not found (run seed-admin.ts first)');

  await prisma.wallet.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, balanceToman: 10000000n, currency: 'IRR' },
    update: { balanceToman: 10000000n },
  });

  const plan = await prisma.plan.findFirst({ where: { name: 'Starter' } });
  if (plan) {
    const active = await prisma.subscription.findFirst({
      where: { userId: admin.id, status: 'active' },
    });
    if (!active) {
      await prisma.subscription.create({
        data: {
          userId: admin.id,
          planId: plan.id,
          status: 'active',
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
      });
    }
  }

  let project = await prisma.project.findFirst({ where: { userId: admin.id } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        userId: admin.id,
        name: 'Demo Project',
        slug: 'demo-' + Date.now().toString(36),
      },
    });
  }

  const fwdCount = await prisma.forwarder.count({ where: { userId: admin.id } });
  if (fwdCount === 0) {
    await prisma.forwarder.create({
      data: {
        userId: admin.id,
        projectId: project.id,
        slug: 'demo' + Date.now().toString(36),
        label: 'Telegram Bot API',
        targetUrl: 'https://api.telegram.org',
        countryCodes: [],
      },
    });
  }

  const credCount = await prisma.proxyCredential.count({ where: { userId: admin.id } });
  if (credCount === 0) {
    await prisma.proxyCredential.create({
      data: {
        userId: admin.id,
        projectId: project.id,
        secretHash: bcrypt.hashSync('demo_secret_2026', 10),
        label: 'SOCKS5 DE',
        countryCode: 'DE',
        routingMode: 'country',
      },
    });
    await prisma.proxyCredential.create({
      data: {
        userId: admin.id,
        projectId: project.id,
        secretHash: bcrypt.hashSync('demo_secret_2026', 10),
        label: 'SOCKS5 Auto',
        routingMode: 'auto',
      },
    });
  }

  console.log('Demo seed complete');
  console.log('Login: admin@platform.local / admin123');
  console.log('Project:', project.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
