import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priorityClass: 'desc' } });
  }

  async findById(id: bigint) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async assignPlan(userId: bigint, planId: bigint, periodDays = 30) {
    const plan = await this.findById(planId);
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);

    // Expire any currently active subscription
    await this.prisma.subscription.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'cancelled' },
    });

    const sub = await this.prisma.subscription.create({
      data: { userId, planId: plan.id, periodStart, periodEnd },
    });

    // Create or reset usage account
    await this.prisma.usageAccount.upsert({
      where: { userId },
      create: { userId, subscriptionId: sub.id, periodStart, periodEnd, bytesUsed: 0n, connectionsUsed: 0n },
      update: { subscriptionId: sub.id, periodStart, periodEnd, bytesUsed: 0n, connectionsUsed: 0n },
    });

    return sub;
  }
}
