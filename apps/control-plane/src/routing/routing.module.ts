import { Module } from '@nestjs/common';
import { RoutingSnapshotService } from './routing-snapshot.service';
import { RoutingController } from './routing.controller';

@Module({
  providers: [RoutingSnapshotService],
  controllers: [RoutingController],
  exports: [RoutingSnapshotService],
})
export class RoutingModule {}
