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
}
