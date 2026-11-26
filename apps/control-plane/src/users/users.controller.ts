import type { Request as ExpressRequest } from 'express';
type AuthedRequest = ExpressRequest & { user: { id: bigint } };
import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  getMe(@Request() req: AuthedRequest) {
    return this.users.findById(req.user.id);
  }

  @Patch('me/routing')
  updateRouting(
    @Request() req: AuthedRequest,
    @Body() body: { routingMode?: string; preferredCountry?: string | null },
  ) {
    return this.users.updateRoutingPreference(req.user.id, body);
  }
}
