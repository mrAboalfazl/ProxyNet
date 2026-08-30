import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

export interface QuotaTokenPayload {
  tokenId: string;
  userId: string;
  credentialUuid: string;
  bytesRemaining: string;
  connsRemaining: number;
  expiresAt: string;
}

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async issueToken(
    userId: bigint,
    credentialUuid: string,
  ): Promise<QuotaTokenPayload | null> {
    const account = await this.prisma.usageAccount.findUnique({
      where: { userId },
      include: {
        user: {
          include: {
            subscriptions: {
              where: { status: 'active' },
              take: 1,
              include: { plan: true },
            },
          },
        },
      },
    });

    if (!account) return null;

    const activeSub = account.user.subscriptions[0];
    if (!activeSub) return null;

    const plan = activeSub.plan;
    const bytesLimitGb = Number(plan.monthlyBandwidthGb);
    const bytesLimit = BigInt(Math.floor(bytesLimitGb * 1024 * 1024 * 1024));

    const bytesRemaining = bytesLimit - account.bytesUsed;
    if (bytesRemaining <= 0n) return null;

    const connsRemaining = plan.maxConcurrentSessions;

    const tokenId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    await this.prisma.quotaToken.create({
      data: {
        id: tokenId,
        userId,
        credentialUuid,
        bytesRemaining,
        connsRemaining,
        expiresAt,
      },
    });

    const payload: QuotaTokenPayload = {
      tokenId,
      userId: userId.toString(),
      credentialUuid,
      bytesRemaining: bytesRemaining.toString(),
      connsRemaining,
      expiresAt: expiresAt.toISOString(),
    };

    const ttlSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    await this.redis.set(
      `quota:token:${credentialUuid}`,
      JSON.stringify(payload),
      'EX',
      ttlSeconds,
    );

    return payload;
  }

  async getToken(credentialUuid: string): Promise<QuotaTokenPayload | null> {
    const raw = await this.redis.get(`quota:token:${credentialUuid}`);
    if (!raw) return null;
    return JSON.parse(raw) as QuotaTokenPayload;
  }

  async revokeUserTokens(userId: bigint): Promise<void> {
    const credentials = await this.prisma.proxyCredential.findMany({
      where: { userId, enabled: true },
      select: { uuid: true },
    });

    if (credentials.length === 0) return;

    const pipeline = this.redis.pipeline();
    for (const cred of credentials) {
      pipeline.del(`quota:token:${cred.uuid}`);
    }
    await pipeline.exec();

    const uuids = credentials.map((c) => c.uuid);
    await this.prisma.quotaToken.updateMany({
      where: {
        userId,
        credentialUuid: { in: uuids },
        invalidatedAt: null,
      },
      data: { invalidatedAt: new Date() },
    });
  }
}
