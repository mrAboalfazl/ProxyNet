import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed countries
  const countries = [
    { code: 'DE', name: 'Germany' },
    { code: 'TR', name: 'Turkey' },
    { code: 'FR', name: 'France' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States' },
  ];

  for (const country of countries) {
    await prisma.country.upsert({
      where: { code: country.code },
      create: country,
      update: {},
    });
  }

  // Seed plans
  const plans = [
    {
      name: 'Starter',
      monthlyBandwidthGb: 50,
      maxConcurrentSessions: 5,
      allowedProtocols: ['http', 'socks5', 'tcp'],
      allowedCountries: [],
      priorityClass: 0,
    },
    {
      name: 'Pro',
      monthlyBandwidthGb: 200,
      maxConcurrentSessions: 20,
      allowedProtocols: ['http', 'socks5', 'tcp', 'udp'],
      allowedCountries: [],
      priorityClass: 1,
    },
    {
      name: 'Business',
      monthlyBandwidthGb: 1000,
      maxConcurrentSessions: 100,
      allowedProtocols: ['http', 'socks5', 'tcp', 'udp'],
      allowedCountries: [],
      priorityClass: 2,
    },
  ];

  for (const plan of plans) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (!existing) {
      await prisma.plan.create({ data: plan });
    }
  }

  console.log('Seed complete: 6 countries, 3 plans');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
