import { Module } from '@nestjs/common';
import { ProxyCredentialsService } from './proxy-credentials.service';
import { ProxyCredentialsController } from './proxy-credentials.controller';

@Module({
  providers: [ProxyCredentialsService],
  controllers: [ProxyCredentialsController],
  exports: [ProxyCredentialsService],
})
export class ProxyCredentialsModule {}
