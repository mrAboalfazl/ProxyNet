import { Module } from '@nestjs/common';
import { ProxyCredentialsService } from './proxy-credentials.service';
import { ProxyCredentialsController } from './proxy-credentials.controller';
import { XrayModule } from '../xray/xray.module';

@Module({
  imports: [XrayModule],
  providers: [ProxyCredentialsService],
  controllers: [ProxyCredentialsController],
  exports: [ProxyCredentialsService],
})
export class ProxyCredentialsModule {}
