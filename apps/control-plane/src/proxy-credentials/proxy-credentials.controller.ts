import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProxyCredentialsService } from './proxy-credentials.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

type AuthedRequest = { user: { id: bigint } };

@ApiTags('proxy-credentials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('proxy-credentials')
export class ProxyCredentialsController {
  constructor(private readonly proxyCredentials: ProxyCredentialsService) {}

  @Get()
  findByUser(@Request() req: AuthedRequest) {
    return this.proxyCredentials.findByUser(BigInt(req.user.id));
  }

  @Get('socks5/endpoints')
  getSocks5Endpoints(@Request() req: AuthedRequest) {
    return this.proxyCredentials.getSocks5Endpoints(BigInt(req.user.id));
  }

  @Post()
  create(
    @Request() req: AuthedRequest,
    @Body()
    body: {
      label?: string;
      projectId?: string | number | null;
      exitNodeId?: string | null;
      countryCode?: string | null;
      routingMode?: string;
    },
  ) {
    return this.proxyCredentials.create(BigInt(req.user.id), body);
  }

  @Patch(':id')
  update(
    @Request() req: AuthedRequest,
    @Param('id') id: string,
    @Body()
    body: {
      label?: string;
      enabled?: boolean;
      projectId?: string | number | null;
      exitNodeId?: string | null;
      countryCode?: string | null;
      routingMode?: string;
    },
  ) {
    return this.proxyCredentials.update(BigInt(req.user.id), BigInt(id), body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Request() req: AuthedRequest, @Param('id') id: string) {
    return this.proxyCredentials.revoke(BigInt(req.user.id), BigInt(id));
  }
}
