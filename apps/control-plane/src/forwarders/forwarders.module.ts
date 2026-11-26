import { Module } from '@nestjs/common';
import { ForwardersService } from './forwarders.service';
import { ForwardersController } from './forwarders.controller';
import { ForwarderProxyController } from './forwarder-proxy.controller';
import { RoutingModule } from '../routing/routing.module';
import { UpstreamsModule } from '../upstreams/upstreams.module';

@Module({
  imports: [RoutingModule, UpstreamsModule],
  providers: [ForwardersService],
  controllers: [ForwardersController, ForwarderProxyController],
})
export class ForwardersModule {}
