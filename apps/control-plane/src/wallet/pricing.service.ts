import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PricingConfig {
  perRequestToman: bigint;
  perMbToman: bigint;
  minBalanceToman: bigint;
}

const KEYS = {
  perRequest: 'pricing.per_request_toman',
  perMb: 'pricing.per_mb_toman',
  minBalance: 'pricing.min_balance_toman',
} as const;

const DEFAULTS: PricingConfig = {
  perRequestToman: 10n,
  perMbToman: 50n,
  minBalanceToman: 100n,
};

// Cache pricing for 60s to avoid a DB roundtrip on every proxy request.
const CACHE_TTL_MS = 60_000;

@Injectable()
export class PricingService {
  private cached: { at: number; config: PricingConfig } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PricingConfig> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.config;
    }
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: Object.values(KEYS) } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const config: PricingConfig = {
      perRequestToman: this.parseBigInt(map.get(KEYS.perRequest)) ?? DEFAULTS.perRequestToman,
      perMbToman: this.parseBigInt(map.get(KEYS.perMb)) ?? DEFAULTS.perMbToman,
      minBalanceToman: this.parseBigInt(map.get(KEYS.minBalance)) ?? DEFAULTS.minBalanceToman,
    };
    this.cached = { at: Date.now(), config };
    return config;
  }

  async update(patch: Partial<Record<keyof PricingConfig, string | number | bigint>>) {
    const writes: Array<Promise<unknown>> = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const numeric = typeof v === 'bigint' ? v : BigInt(v as never);
      if (numeric < 0n) throw new BadRequestException(`${k} must be >= 0`);
      const dbKey = k === 'perRequestToman' ? KEYS.perRequest
                  : k === 'perMbToman'      ? KEYS.perMb
                  : k === 'minBalanceToman' ? KEYS.minBalance
                  : null;
      if (!dbKey) throw new BadRequestException(`unknown pricing key: ${k}`);
      writes.push(
        this.prisma.setting.upsert({
          where: { key: dbKey },
          create: { key: dbKey, value: numeric.toString() },
          update: { value: numeric.toString() },
        }),
      );
    }
    await Promise.all(writes);
    this.cached = null;
    return this.get();
  }

  /**
   * Compute the cost of a single proxy call.
   * Rounds partial MBs UP (favoring the platform slightly — one 500KB call = 1MB).
   */
  computeCost(bytesIn: number, bytesOut: number, cfg: PricingConfig): bigint {
    const totalBytes = BigInt(bytesIn + bytesOut);
    const mb = (totalBytes + (1024n * 1024n) - 1n) / (1024n * 1024n); // ceil
    return cfg.perRequestToman + mb * cfg.perMbToman;
  }

  private parseBigInt(v: string | undefined): bigint | null {
    if (v === undefined) return null;
    try { return BigInt(v); } catch { return null; }
  }
}
