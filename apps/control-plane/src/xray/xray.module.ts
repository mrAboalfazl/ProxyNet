import { Module } from '@nestjs/common';
import { XrayConfigService } from './xray-config.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [XrayConfigService],
  exports: [XrayConfigService],
})
export class XrayModule {}
