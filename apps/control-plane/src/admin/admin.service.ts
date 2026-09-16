import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NodesService } from '../nodes/nodes.service';
import { PlansService } from '../plans/plans.service';
import { CountriesService } from '../countries/countries.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private nodes: NodesService,
    private plans: PlansService,
    private countries: CountriesService,
    private users: UsersService,
  ) {}

  async getDashboardSummary() {
    const [totalUsers, totalNodes, healthyNodes, activeCountries, walletTotals, requestCount, socksBytes] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { status: 'active' } }),
      this.prisma.node.count(),
      this.prisma.node.count({ where: { status: 'healthy' } }),
      this.prisma.country.count({ where: { enabled: true } }),
      this.prisma.wallet.aggregate({ _sum: { balanceToman: true } }),
      this.prisma.usageEvent.count({ where: { eventType: 'http_request' } }),
      this.prisma.usageEvent.aggregate({ where: { protocol: 'socks5' }, _sum: { bytesIn: true, bytesOut: true } }),
    ]);
    const revenue = await this.prisma.walletTransaction.aggregate({ where: { amountToman: { lt: 0n } }, _sum: { amountToman: true } });
    return { totalUsers, totalNodes, healthyNodes, activeCountries, walletBalanceToman: (walletTotals._sum.balanceToman ?? 0n).toString(), revenueToman: (-(revenue._sum.amountToman ?? 0n)).toString(), requestCount, socksBandwidthBytes: ((socksBytes._sum.bytesIn ?? 0n) + (socksBytes._sum.bytesOut ?? 0n)).toString() };
  }

  async getStatistics() {
    const summary = await this.getDashboardSummary();
    const [activeSubscriptions, activeCredentials, forwarders, transactions] = await this.prisma.$transaction([
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.proxyCredential.count({ where: { enabled: true } }),
      this.prisma.forwarder.count({ where: { enabled: true } }),
      this.prisma.walletTransaction.count(),
    ]);
    return { ...summary, activeSubscriptions, activeCredentials, activeForwarders: forwarders, transactionCount: transactions, generatedAt: new Date() };
  }

  async createNode(data: {
    countryCode: string;
    label: string;
    roles: string[];
    providerId?: string;
  }) {
    const node = await this.nodes.create({
      ...data,
      providerId: data.providerId ? BigInt(data.providerId) : undefined,
    });
    return this.nodes.generateEnrollmentToken(node.id).then((t) => ({ ...node, ...t }));
  }

  async createPlan(data: {
    name: string;
    monthlyBandwidthGb: number;
    maxConcurrentSessions?: number;
    allowedProtocols?: string[];
  }) {
    return this.prisma.plan.create({
      data: {
        name: data.name,
        monthlyBandwidthGb: data.monthlyBandwidthGb,
        maxConcurrentSessions: data.maxConcurrentSessions ?? 10,
        allowedProtocols: data.allowedProtocols ?? ['http', 'socks5', 'tcp', 'udp'],
        allowedCountries: [],
      },
    });
  }

  async assignPlan(userId: string, planId: string) {
    return this.plans.assignPlan(BigInt(userId), BigInt(planId));
  }

  async listAuditLog(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.auditLog.count(),
    ]);
    return { logs, total, page, limit };
  }
}
