import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { NodeAuthGuard } from './guards/node-auth.guard';
import { QuotaModule } from '../quota/quota.module';
import { MeteringModule } from '../metering/metering.module';
import { ProxyCredentialsModule } from '../proxy-credentials/proxy-credentials.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  imports: [QuotaModule, MeteringModule, ProxyCredentialsModule, RoutingModule],
  providers: [NodesService, NodeAuthGuard],
  controllers: [NodesController],
  exports: [NodesService],
})
export class NodesModule {}
