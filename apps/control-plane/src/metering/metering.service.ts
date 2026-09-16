import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordUsageEventData {
  userId: bigint;
  nodeId?: bigint;
  sessionId?: string;
  eventType: 'http_request' | 'tcp_session' | 'udp_flow' | 'ws_session';
  protocol: string;
  bytesIn: bigint;
  bytesOut: bigint;
  sessionSeconds?: number;
  exitCountry?: string;
  exitNodeId?: bigint;
  destination?: string;
}

@Injectable()
export class MeteringService {
  constructor(
    @InjectQueue('usage-events') private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async recordUsageEvent(data: RecordUsageEventData): Promise<void> {
    await this.queue.add('process-usage', {
      userId: data.userId.toString(),
      nodeId: data.nodeId?.toString() ?? null,
      sessionId: data.sessionId ?? null,
      eventType: data.eventType,
      protocol: data.protocol,
      bytesIn: data.bytesIn.toString(),
      bytesOut: data.bytesOut.toString(),
      sessionSeconds: data.sessionSeconds ?? 0,
      exitCountry: data.exitCountry ?? null,
      exitNodeId: data.exitNodeId?.toString() ?? null,
      destination: data.destination ?? null,
    });
  }

  async getUsageStats(userId: bigint) {
    return this.prisma.usageAccount.findUnique({
      where: { userId },
      include: {
        user: {
          include: {
            subscriptions: {
              where: { status: 'active' },
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
  }

  /** A transparent financial/usage view backed by the wallet ledger. */
  async getFinancialReport(userId: bigint, options: { page?: number; limit?: number; usagePage?: number; usageLimit?: number; from?: string; to?: string; category?: string } = {}) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 25));
    const usagePage = Math.max(1, options.usagePage ?? 1);
    const usageLimit = Math.min(100, Math.max(1, options.usageLimit ?? 25));
    const from = options.from ? new Date(`${options.from}T00:00:00.000Z`) : undefined;
    const to = options.to ? new Date(`${options.to}T23:59:59.999Z`) : undefined;
    if (from && Number.isNaN(from.getTime())) throw new BadRequestException('Invalid from date');
    if (to && Number.isNaN(to.getTime())) throw new BadRequestException('Invalid to date');
    if (from && to && from > to) throw new BadRequestException('from must be before to');
    const categoryTypes: Record<string, string[]> = {
      requests: ['gateway_call'], proxy_bandwidth: ['socks5_session'], forwarding: ['forwarder_call'], credentials: ['credential_fee'],
    };
    const types = options.category && categoryTypes[options.category] ? categoryTypes[options.category] : undefined;
    const transactionWhere = { walletUserId: userId, ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}), ...(types ? { type: { in: types } } : {}) };
    const usageWhere = { userId, ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}), ...(options.category === 'requests' ? { protocol: { not: 'socks5' } } : options.category === 'proxy_bandwidth' ? { protocol: 'socks5' } : {}) };
    const [transactions, transactionTotal, ledgerTotals, usage, usageTotal, dailyRows] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: transactionWhere, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.walletTransaction.count({ where: transactionWhere }),
      this.prisma.walletTransaction.groupBy({
        by: ['type'], where: { ...transactionWhere, amountToman: { lt: 0n } },
        _sum: { amountToman: true },
      }),
      this.prisma.usageEvent.findMany({
        where: usageWhere, orderBy: { occurredAt: 'desc' }, skip: (usagePage - 1) * usageLimit, take: usageLimit,
      }),
      this.prisma.usageEvent.count({ where: usageWhere }),
      this.prisma.$queryRaw<Array<{ day: Date; amount: bigint }>>`
        SELECT date_trunc('day', created_at) AS day,
               COALESCE(SUM(CASE WHEN amount_toman < 0 THEN -amount_toman ELSE 0 END), 0)::bigint AS amount
        FROM wallet_transactions
        WHERE wallet_user_id = ${userId} AND created_at >= ${new Date(Date.now() - 29 * 86400000)}
        GROUP BY 1 ORDER BY 1 ASC
      `,
    ]);

    const categoryNames: Record<string, string> = {
      gateway_call: 'requests', forwarder_call: 'forwarding',
      socks5_session: 'proxy_bandwidth', credential_fee: 'credentials',
    };
    const totals: Record<string, bigint> = {
      requests: 0n, proxy_bandwidth: 0n, credentials: 0n, forwarding: 0n, other: 0n,
    };
    for (const row of ledgerTotals) {
      const category = categoryNames[row.type] ?? 'other';
      totals[category] += -(row._sum.amountToman ?? 0n);
    }

    const spendByDay = new Map(dailyRows.map((row) => [row.day.toISOString().slice(0, 10), row.amount.toString()]));
    const dailySpending = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(Date.now() - (29 - index) * 86400000).toISOString().slice(0, 10);
      return { day, spentToman: spendByDay.get(day) ?? '0' };
    });
    return {
      categories: Object.entries(totals).map(([category, spentToman]) => ({ category, spentToman: spentToman.toString() })),
      transactionsTotal: transactionTotal,
      page, limit,
      usage: usage.map((row) => ({
        id: row.id.toString(), eventType: row.eventType, protocol: row.protocol, requests: 1,
        bytesIn: row.bytesIn.toString(), bytesOut: row.bytesOut.toString(), occurredAt: row.occurredAt,
      })),
      usageTotal, usagePage, usageLimit,
      dailySpending,
      transactions: transactions.map((tx) => ({
        id: tx.id.toString(), type: tx.type, amountToman: tx.amountToman.toString(),
        description: tx.description, balanceAfterToman: tx.balanceAfterToman.toString(), createdAt: tx.createdAt,
      })),
    };
  }
}
