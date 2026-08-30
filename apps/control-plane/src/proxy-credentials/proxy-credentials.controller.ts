import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProxyCredentialsService } from './proxy-credentials.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('proxy-credentials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('proxy-credentials')
export class ProxyCredentialsController {
  constructor(private readonly proxyCredentials: ProxyCredentialsService) {}

  @Get()
  findByUser(@Request() req) {
    return this.proxyCredentials.findByUser(BigInt(req.user.id));
  }

  @Post()
  create(@Request() req, @Body() body: { label?: string }) {
    return this.proxyCredentials.create(BigInt(req.user.id), body.label);
  }

  @Delete(':id')
  revoke(@Request() req, @Param('id') id: string) {
    return this.proxyCredentials.revoke(BigInt(req.user.id), BigInt(id));
  }
}
