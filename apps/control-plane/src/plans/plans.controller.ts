import { Controller, Get, Post, Param, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plans')
export class PlansController {
  constructor(private plans: PlansService) {}

  @Get()
  findAll() {
    return this.plans.findAll();
  }

  @Post(':id/purchase')
  purchase(@Request() req, @Param('id') id: string) {
    return this.plans.purchase(BigInt(req.user.id), BigInt(id));
  }
}
