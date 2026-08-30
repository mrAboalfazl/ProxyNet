import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Processor('usage-events')
export class MeteringProcessor {
  private readonly logger = new Logger(MeteringProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('process-usage')
  async handle(job: Job): Promise<void> {
    const data = job.data;

    const userId = BigInt(data.userId);
    const bytesIn = BigInt(data.bytesIn);
    const bytesOut = BigInt(data.bytesOut);
    const totalBytes = bytesIn + bytesOut;

    // Create usage event record
    await this.prisma.usageEvent.create({
      data: {
        userId,
        nodeId: data.nodeId ? BigInt(data.nodeId) : null,
        sessionId: data.sessionId ?? null,
        eventType: data.eventType,
        protocol: data.protocol,
        bytesIn,
        bytesOut,
        sessionSeconds: data.sessionSeconds ?? 0,
        exitCountry: data.exitCountry ?? null,
        exitNodeId: data.exitNodeId ? BigInt(data.exitNodeId) : null,
        destination: data.destination ?? null,
      },
    });

    // Increment counters on usage account
    await this.prisma.usageAccount.update({
      where: { userId },
      data: {
        bytesUsed: { increment: totalBytes },
        connectionsUsed: { increment: 1n },
      },
    });

    // Re-query account with active subscription and plan to check quota
    const account = await this.prisma.usageAccount.findUnique({
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

    if (!account) {
      this.logger.warn(`No usage account found for userId=${userId}`);
      return;
    }

    const activeSubscription = account.user?.subscriptions?.[0];
    if (!activeSubscription) {
      return;
    }

    const plan = activeSubscription.plan;
    // monthlyBandwidthGb is a Decimal — convert to bytes as BigInt
    // 1 GB = 1_000_000_000 bytes
    const byteLimitBigInt = BigInt(
      Math.floor(Number(plan.monthlyBandwidthGb) * 1_000_000_000),
    );

    if (account.bytesUsed >= byteLimitBigInt) {
      await this.prisma.subscription.update({
        where: { id: activeSubscription.id },
        data: { status: 'suspended' },
      });
      this.logger.log(
        `Subscription ${activeSubscription.id} suspended: bytesUsed=${account.bytesUsed} >= limit=${byteLimitBigInt}`,
      );
    }
  }
}
