import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../users/users.module';
import { NodesModule } from '../nodes/nodes.module';
import { PlansModule } from '../plans/plans.module';
import { CountriesModule } from '../countries/countries.module';
import { MeteringModule } from '../metering/metering.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  imports: [
    UsersModule,
    NodesModule,
    PlansModule,
    CountriesModule,
    MeteringModule,
    RoutingModule,
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
