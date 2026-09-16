import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
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

  @Get('financial/me')
  getMyFinancialReport(@Request() req, @Query() query: { page?: string; limit?: string; usagePage?: string; usageLimit?: string; from?: string; to?: string; category?: string }) {
    return this.meteringService.getFinancialReport(BigInt(req.user.id), {
      page: query.page ? Number(query.page) : undefined, limit: query.limit ? Number(query.limit) : undefined,
      usagePage: query.usagePage ? Number(query.usagePage) : undefined, usageLimit: query.usageLimit ? Number(query.usageLimit) : undefined,
      from: query.from, to: query.to, category: query.category,
    });
  }
}
