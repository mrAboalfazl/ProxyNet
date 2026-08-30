import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { NodesService } from '../nodes/nodes.service';
import { CountriesService } from '../countries/countries.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// TODO: Replace JwtAuthGuard with an AdminGuard that checks admin role
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private nodes: NodesService,
    private countries: CountriesService,
    private users: UsersService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.getDashboardSummary();
  }

  // ── Users ──
  @Get('users')
  listUsers(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.users.findMany(+page, +limit);
  }

  @Patch('users/:id/status')
  setUserStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'suspended' | 'banned' }) {
    return this.users.updateStatus(BigInt(id), body.status);
  }

  // ── Nodes ──
  @Post('nodes')
  createNode(@Body() body: { countryCode: string; label: string; roles: string[]; providerId?: string }) {
    return this.admin.createNode(body);
  }

  @Get('nodes')
  listNodes(@Query('country') country?: string) {
    return this.nodes.findAll(country);
  }

  @Patch('nodes/:id/status')
  setNodeStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.nodes.updateStatus(BigInt(id), body.status);
  }

  @Post('nodes/:id/enrollment-token')
  generateToken(@Param('id') id: string) {
    return this.nodes.generateEnrollmentToken(BigInt(id));
  }

  @Post('nodes/:id/approve')
  approveNode(@Param('id') id: string, @Req() req: any) {
    return this.nodes.approveNode(BigInt(id), req.user.id);
  }

  @Post('nodes/:id/reject')
  rejectNode(@Param('id') id: string) {
    return this.nodes.rejectNode(BigInt(id));
  }

  // ── Plans ──
  @Post('plans')
  createPlan(@Body() body: { name: string; monthlyBandwidthGb: number; maxConcurrentSessions?: number }) {
    return this.admin.createPlan(body);
  }

  @Post('users/:userId/assign-plan/:planId')
  assignPlan(@Param('userId') userId: string, @Param('planId') planId: string) {
    return this.admin.assignPlan(userId, planId);
  }

  // ── Countries ──
  @Post('countries')
  upsertCountry(@Body() body: { code: string; name: string }) {
    return this.countries.upsert(body.code, body.name);
  }

  @Patch('countries/:code/enabled')
  setCountryEnabled(@Param('code') code: string, @Body() body: { enabled: boolean }) {
    return this.countries.setEnabled(code, body.enabled);
  }

  @Get('countries/status')
  countryStatus() {
    return this.countries.getPoolStatus();
  }

  // ── Audit ──
  @Get('audit')
  auditLog(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.admin.listAuditLog(+page, +limit);
  }
}
