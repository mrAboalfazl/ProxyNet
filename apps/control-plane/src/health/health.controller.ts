import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../wallet/pricing.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly pricing: PricingService,
  ) {}

  /** Anonymous liveness — used by monitoring + install.sh preflight */
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Authenticated health check — used by the "Test my auth" button in the panel
   * and by user code that wants to verify credentials + inspect usage counters.
   *
   * Requires: Authorization: Bearer <userJwt>
   * Response includes account info, current plan, and aggregated usage stats.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  async me(@Req() req: { user: { id: bigint; publicSlug: string; role: string } }) {
    const userId = req.user.id;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      user,
      subscription,
      totalForwarders,
      enabledForwarders,
      activeCredentials,
      forwarderAggregates,
      walletRow,
      pricing,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, displayName: true, email: true, phone: true,
          publicSlug: true, status: true, createdAt: true,
        },
      }),
      this.prisma.subscription.findFirst({
        where: { userId, status: 'active' },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.forwarder.count({ where: { userId } }),
      this.prisma.forwarder.count({ where: { userId, enabled: true } }),
      this.prisma.proxyCredential.count({ where: { userId, enabled: true, revokedAt: null } }),
      this.prisma.forwarder.aggregate({
        where: { userId },
        _sum: { callCount: true, bytesIn: true, bytesOut: true },
      }),
      this.wallet.getOrCreate(userId),
      this.pricing.get(),
    ]);

    const forwardersUsedToday = await this.prisma.forwarder.count({
      where: { userId, lastUsedAt: { gte: startOfDay } },
    });

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      user,
      plan: subscription?.plan
        ? {
            name: subscription.plan.name,
            monthlyBandwidthGb: subscription.plan.monthlyBandwidthGb,
            maxConcurrentSessions: subscription.plan.maxConcurrentSessions,
          }
        : null,
      usage: {
        totalForwarders,
        enabledForwarders,
        activeCredentials,
        totalCallsAllTime: (forwarderAggregates._sum.callCount ?? 0n).toString(),
        totalBytesIn: (forwarderAggregates._sum.bytesIn ?? 0n).toString(),
        totalBytesOut: (forwarderAggregates._sum.bytesOut ?? 0n).toString(),
        forwardersUsedToday,
      },
      wallet: {
        balanceToman: walletRow.balanceToman.toString(),
        currency: walletRow.currency,
        aboveMinBalance: walletRow.balanceToman >= pricing.minBalanceToman,
      },
      pricing: {
        perRequestToman: pricing.perRequestToman.toString(),
        perMbToman: pricing.perMbToman.toString(),
        minBalanceToman: pricing.minBalanceToman.toString(),
      },
    };
  }
}
