import { Module } from '@nestjs/common';
import { RoutingSnapshotService } from './routing-snapshot.service';
import { NodeSelectorService } from './node-selector.service';
import { RoutingController } from './routing.controller';

@Module({
  providers: [RoutingSnapshotService, NodeSelectorService],
  controllers: [RoutingController],
  exports: [RoutingSnapshotService, NodeSelectorService],
})
export class RoutingModule {}
