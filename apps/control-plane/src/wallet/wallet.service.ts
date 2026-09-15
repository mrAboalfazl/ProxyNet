import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ChargeType =
  | 'gateway_call'
  | 'forwarder_call'
  | 'socks5_session'
  | 'topup_admin'
  | 'adjustment_admin'
  | 'refund';

export interface ChargeMetadata {
  requestUrl?: string;
  bytesIn?: number;
  bytesOut?: number;
  forwarderId?: string;
  credentialUuid?: string;
  nodeId?: number;
  [key: string]: unknown;
}

/**
 * All balance mutations flow through this service so we can:
 *   - guarantee row-level locking via a Prisma transaction
 *   - write a matching WalletTransaction ledger entry in the same tx
 *   - reject debits that would leave the wallet negative
 *
 * Toman is stored as BigInt (integer smallest unit, since Iranian pricing is
 * whole toman in practice).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fetch (auto-create if missing). Read-only, no locking. */
  async getOrCreate(userId: bigint) {
    const existing = await this.prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.wallet.create({ data: { userId } });
  }

  async listTransactions(userId: bigint, limit = 50) {
    return this.prisma.walletTransaction.findMany({
      where: { walletUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /**
   * Atomic credit. Positive amount adds funds. Returns updated wallet + tx.
   * `type` is a coarse category; `description` is human-facing.
   */
  async credit(
    userId: bigint,
    amountToman: bigint,
    type: ChargeType,
    description?: string,
    metadata?: ChargeMetadata,
  ) {
    if (amountToman <= 0n) throw new BadRequestException('credit amount must be > 0');
    return this.prisma.$transaction(async (tx) => {
      // Ensure the wallet row exists, then lock it for update
      await tx.wallet.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      await tx.$executeRaw`SELECT balance_toman FROM wallets WHERE user_id = ${userId} FOR UPDATE`;

      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balanceToman: { increment: amountToman } },
      });
      const txn = await tx.walletTransaction.create({
        data: {
          walletUserId: userId,
          amountToman,
          type,
          description,
          balanceAfterToman: wallet.balanceToman,
          metadata: metadata as never,
        },
      });
      return { wallet, transaction: txn };
    });
  }

  /**
   * Atomic debit. `amountToman` is expected positive; we store the ledger entry
   * as a negative number. Throws ForbiddenException if insufficient funds.
   */
  async debit(
    userId: bigint,
    amountToman: bigint,
    type: ChargeType,
    description?: string,
    metadata?: ChargeMetadata,
  ) {
    if (amountToman <= 0n) throw new BadRequestException('debit amount must be > 0');
    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      await tx.$executeRaw`SELECT balance_toman FROM wallets WHERE user_id = ${userId} FOR UPDATE`;

      const current = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (current.balanceToman < amountToman) {
        throw new ForbiddenException('insufficient_balance');
      }
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balanceToman: { decrement: amountToman } },
      });
      const txn = await tx.walletTransaction.create({
        data: {
          walletUserId: userId,
          amountToman: -amountToman,
          type,
          description,
          balanceAfterToman: wallet.balanceToman,
          metadata: metadata as never,
        },
      });
      return { wallet, transaction: txn };
    });
  }

  /**
   * Non-blocking "did the call succeed" post-charge. Logs but doesn't throw
   * if the charge fails (e.g. balance already zero by another request) — the
   * user got the service, the wallet just goes slightly negative logically
   * (actually blocked by debit()). Called from proxy controllers.
   */
  async chargeSilently(
    userId: bigint,
    amountToman: bigint,
    type: ChargeType,
    description?: string,
    metadata?: ChargeMetadata,
  ): Promise<void> {
    if (amountToman <= 0n) return;
    try {
      await this.debit(userId, amountToman, type, description, metadata);
    } catch (err) {
      this.logger.warn(
        `wallet debit failed for user=${userId} amount=${amountToman} type=${type}: ${
          (err as Error).message
        }`,
      );
    }
  }

  /** Quick balance check — used by the pre-flight guard in proxy controllers. */
  async hasMinBalance(userId: bigint, minToman: bigint): Promise<boolean> {
    const w = await this.getOrCreate(userId);
    return w.balanceToman >= minToman;
  }
}
