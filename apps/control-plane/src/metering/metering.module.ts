import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MeteringService } from './metering.service';
import { MeteringProcessor } from './metering.processor';
import { MeteringController } from './metering.controller';

@Module({
  imports: [BullModule.registerQueue({ name: 'usage-events' })],
  providers: [MeteringService, MeteringProcessor],
  controllers: [MeteringController],
  exports: [MeteringService],
})
export class MeteringModule {}
