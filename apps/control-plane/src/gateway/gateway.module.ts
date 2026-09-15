import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { ProxyCredentialsModule } from '../proxy-credentials/proxy-credentials.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  imports: [ProxyCredentialsModule, RoutingModule],
  providers: [GatewayService],
  controllers: [GatewayController],
})
export class GatewayModule {}
