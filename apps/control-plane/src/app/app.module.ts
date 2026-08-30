import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { NodesModule } from '../nodes/nodes.module';
import { CountriesModule } from '../countries/countries.module';
import { AdminModule } from '../admin/admin.module';
import { HealthModule } from '../health/health.module';
import { RoutingModule } from '../routing/routing.module';
import { QuotaModule } from '../quota/quota.module';
import { MeteringModule } from '../metering/metering.module';
import { ProxyCredentialsModule } from '../proxy-credentials/proxy-credentials.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    PlansModule,
    NodesModule,
    CountriesModule,
    AdminModule,
    HealthModule,
    RoutingModule,
    QuotaModule,
    MeteringModule,
    ProxyCredentialsModule,
  ],
})
export class AppModule {}
