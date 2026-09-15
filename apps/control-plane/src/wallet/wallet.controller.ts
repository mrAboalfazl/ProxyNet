import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { PricingService } from './pricing.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Wallet summary for the logged-in user. Includes the current pricing so
   * the panel can display "at your rate, this would be N calls" copy.
   */
  @Get('me')
  async me(@Req() req: { user: { id: bigint } }) {
    const [wallet, pricing] = await Promise.all([
      this.wallet.getOrCreate(req.user.id),
      this.pricing.get(),
    ]);
    return {
      balanceToman: wallet.balanceToman.toString(),
      currency: wallet.currency,
      updatedAt: wallet.updatedAt,
      pricing: {
        perRequestToman: pricing.perRequestToman.toString(),
        perMbToman: pricing.perMbToman.toString(),
        minBalanceToman: pricing.minBalanceToman.toString(),
      },
    };
  }

  @Get('me/transactions')
  async myTransactions(
    @Req() req: { user: { id: bigint } },
    @Query('limit') limit?: string,
  ) {
    const rows = await this.wallet.listTransactions(
      req.user.id,
      limit ? parseInt(limit, 10) : 50,
    );
    return rows.map((r) => ({
      id: r.id.toString(),
      amountToman: r.amountToman.toString(),
      type: r.type,
      description: r.description,
      balanceAfterToman: r.balanceAfterToman.toString(),
      createdAt: r.createdAt,
    }));
  }
}
