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

  /** Return a live token, creating one from the user's active plan when needed. */
  async getOrIssueToken(userId: bigint, credentialUuid: string): Promise<QuotaTokenPayload | null> {
    return (await this.getToken(credentialUuid)) ?? this.issueToken(userId, credentialUuid);
  }

  /** Atomically deduct completed SOCKS5 session traffic from the live token. */
  async consumeTokenBytes(credentialUuid: string, bytes: bigint): Promise<void> {
    if (bytes <= 0n) return;
    const key = `quota:token:${credentialUuid}`;
    await this.redis.eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return 0 end
       local token = cjson.decode(raw)
       token.bytesRemaining = tostring(math.max(0, tonumber(token.bytesRemaining) - tonumber(ARGV[1])))
       local ttl = redis.call('TTL', KEYS[1])
       if ttl > 0 then redis.call('SETEX', KEYS[1], ttl, cjson.encode(token)) end
       return 1`,
      1,
      key,
      bytes.toString(),
    );
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
