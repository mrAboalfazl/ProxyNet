import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoutingSnapshotService } from './routing-snapshot.service';

@ApiTags('routing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('routing')
export class RoutingController {
  constructor(private readonly routingSnapshot: RoutingSnapshotService) {}

  @Get('snapshot')
  getCurrentSnapshot() {
    return this.routingSnapshot.getCurrentSnapshot();
  }

  @Post('snapshot/recompile')
  recompile() {
    return this.routingSnapshot.compileSnapshot();
  }
}
