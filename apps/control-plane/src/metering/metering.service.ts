import { Injectable } from '@nestjs/common';
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
  async getFinancialReport(userId: bigint) {
    const [transactions, ledgerTotals, usage] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletUserId: userId }, orderBy: { createdAt: 'desc' }, take: 200,
      }),
      this.prisma.walletTransaction.groupBy({
        by: ['type'], where: { walletUserId: userId, amountToman: { lt: 0n } },
        _sum: { amountToman: true },
      }),
      this.prisma.usageEvent.groupBy({
        by: ['eventType', 'protocol'], where: { userId },
        _count: { _all: true }, _sum: { bytesIn: true, bytesOut: true },
      }),
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

    return {
      categories: Object.entries(totals).map(([category, spentToman]) => ({ category, spentToman: spentToman.toString() })),
      usage: usage.map((row) => ({
        eventType: row.eventType, protocol: row.protocol, requests: row._count._all,
        bytesIn: (row._sum.bytesIn ?? 0n).toString(), bytesOut: (row._sum.bytesOut ?? 0n).toString(),
      })),
      transactions: transactions.map((tx) => ({
        id: tx.id.toString(), type: tx.type, amountToman: tx.amountToman.toString(),
        description: tx.description, balanceAfterToman: tx.balanceAfterToman.toString(), createdAt: tx.createdAt,
      })),
    };
  }
}
