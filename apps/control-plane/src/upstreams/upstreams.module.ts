import { Module } from '@nestjs/common';
import { NodesModule } from '../nodes/nodes.module';
import { UpstreamsService } from './upstreams.service';
import { UpstreamsController } from './upstreams.controller';

@Module({
  imports: [NodesModule],
  providers: [UpstreamsService],
  controllers: [UpstreamsController],
  exports: [UpstreamsService],
})
export class UpstreamsModule {}
