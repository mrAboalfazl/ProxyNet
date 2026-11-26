import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Always query live state: snapshots may predate a pause or sharing withdrawal. */
export function usableNodeWhere(userId: bigint): Prisma.NodeWhereInput {
  return {
    status: { in: ['active', 'healthy'] },
    userPaused: false,
    roles: { has: 'exit' },
    country: { enabled: true },
    OR: [{ submittedById: userId }, { visibility: 'public' }],
  };
}

/** HTTP remains usable with a wallet and no subscription, as before. An active
 * subscription's country restrictions still apply to explicit node selection. */
export async function planCountryWhere(
  prisma: PrismaService,
  userId: bigint,
): Promise<Prisma.NodeWhereInput> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'active',
      periodStart: { lte: new Date() },
      periodEnd: { gt: new Date() },
    },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
  const countries = subscription?.plan.allowedCountries ?? [];
  return countries.length ? { countryCode: { in: countries } } : {};
}

export async function resolveExitNode(
  prisma: PrismaService,
  userId: bigint,
  value?: string | null,
): Promise<bigint | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))
    throw new BadRequestException('Invalid exit node');
  const id = BigInt(value);
  const countries = await planCountryWhere(prisma, userId);
  const node = await prisma.node.findFirst({
    where: { AND: [usableNodeWhere(userId), countries, { id }] },
    select: { id: true },
  });
  if (!node)
    throw new BadRequestException(
      'Exit node is unavailable or not accessible to your account',
    );
  return id;
}
