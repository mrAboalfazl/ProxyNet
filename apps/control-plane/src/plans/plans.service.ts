import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priorityClass: 'desc' } });
  }

  /**
   * Buy or renew a plan using the user's prepaid wallet balance.
   * The debit, subscription switch and quota reset happen in one transaction.
   */
  async purchase(userId: bigint, planId: bigint, periodDays = 30) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findUnique({ where: { id: planId } });
      if (!plan || !plan.isActive) throw new NotFoundException('Plan not found');

      const price = plan.priceToman;

      await tx.wallet.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      await tx.$executeRaw`SELECT balance_toman FROM wallets WHERE user_id = ${userId} FOR UPDATE`;
      let wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      if (price > 0n && wallet.balanceToman < price) {
        throw new ForbiddenException('insufficient_balance');
      }

      if (price > 0n) {
        wallet = await tx.wallet.update({
          where: { userId },
          data: { balanceToman: { decrement: price } },
        });
        await tx.walletTransaction.create({
          data: {
            walletUserId: userId,
            amountToman: -price,
            type: 'plan_purchase',
            description: `Plan purchase: ${plan.name}`,
            balanceAfterToman: wallet.balanceToman,
            metadata: { planId: plan.id.toString() },
          },
        });
      }

      const periodStart = new Date();
      const periodEnd = new Date(
        Date.now() + periodDays * 24 * 60 * 60 * 1000,
      );

      await tx.subscription.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'cancelled' },
      });

      const subscription = await tx.subscription.create({
        data: { userId, planId: plan.id, periodStart, periodEnd },
      });

      await tx.usageAccount.upsert({
        where: { userId },
        create: {
          userId,
          subscriptionId: subscription.id,
          periodStart,
          periodEnd,
          bytesUsed: 0n,
          connectionsUsed: 0n,
        },
        update: {
          subscriptionId: subscription.id,
          periodStart,
          periodEnd,
          bytesUsed: 0n,
          connectionsUsed: 0n,
        },
      });

      return { subscription, plan, wallet };
    });
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
