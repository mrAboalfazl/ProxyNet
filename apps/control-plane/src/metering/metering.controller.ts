import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MeteringService } from './metering.service';

@Controller('metering')
@UseGuards(JwtAuthGuard)
export class MeteringController {
  constructor(private readonly meteringService: MeteringService) {}

  @Get('usage/me')
  getMyUsage(@Request() req) {
    return this.meteringService.getUsageStats(BigInt(req.user.id));
  }
}
