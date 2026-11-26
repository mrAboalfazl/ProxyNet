import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { NodeAuthGuard } from '../nodes/guards/node-auth.guard';
import {
  CreateUpstreamDto,
  UpdateUpstreamDto,
  UpstreamHealthReport,
  UpstreamsService,
} from './upstreams.service';

@ApiTags('upstreams')
@ApiBearerAuth()
@Controller()
export class UpstreamsController {
  constructor(private readonly upstreams: UpstreamsService) {}

  // ── Admin CRUD + Live Probe ────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/upstreams')
  listAll() {
    return this.upstreams.listAll();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/upstreams')
  create(@Body() body: CreateUpstreamDto) {
    return this.upstreams.create(body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/upstreams/:id')
  update(@Param('id') id: string, @Body() body: UpdateUpstreamDto) {
    return this.upstreams.update(BigInt(id), body);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/upstreams/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.upstreams.remove(BigInt(id));
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/upstreams/:id/test')
  @HttpCode(HttpStatus.OK)
  test(@Param('id') id: string) {
    return this.upstreams.testUpstream(BigInt(id));
  }

  // ── User-facing available tunnels list (no secrets) ────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('upstreams/available')
  availableForUser(@Req() req: { user: { id: bigint } }) {
    return this.upstreams.listAvailableForUser(req.user.id);
  }

  // ── Host Node sync & health reporting (Bearer <nodeSecret>) ────────────────

  @UseGuards(NodeAuthGuard)
  @Get('nodes/:id/upstreams')
  getForNode(@Param('id') id: string) {
    return this.upstreams.getSyncPayloadForNode(BigInt(id));
  }

  @UseGuards(NodeAuthGuard)
  @Post('nodes/:id/upstreams/health')
  @HttpCode(HttpStatus.OK)
  reportHealth(
    @Param('id') id: string,
    @Body() body: { reports: UpstreamHealthReport[] },
  ) {
    return this.upstreams.recordHealthReports(BigInt(id), body?.reports ?? []);
  }
}
