import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PricingService } from './pricing.service';
import { WalletController } from './wallet.controller';

@Global()
@Module({
  providers: [WalletService, PricingService],
  controllers: [WalletController],
  exports: [WalletService, PricingService],
})
export class WalletModule {}
