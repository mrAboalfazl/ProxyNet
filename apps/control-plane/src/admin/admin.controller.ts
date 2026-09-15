import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { NodesService } from '../nodes/nodes.service';
import { CountriesService } from '../countries/countries.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../wallet/pricing.service';
import { AdminGuard } from './guards/admin.guard';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private nodes: NodesService,
    private countries: CountriesService,
    private users: UsersService,
    private wallet: WalletService,
    private pricing: PricingService,
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

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.users.findByIdWithDetails(BigInt(id));
  }

  /**
   * Admin-only view of a user's VLESS credentials. This is where the raw VLESS URIs
   * are exposed — the user's own panel does NOT show them (see /user/credentials).
   */
  @Get('users/:id/vless')
  getUserVless(@Param('id') id: string) {
    return this.users.getVlessUrisForUser(BigInt(id));
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
  /** Admins must be able to re-enable countries that are temporarily disabled. */
  @Get('countries')
  listCountries() {
    return this.countries.findAll(false);
  }

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

  // ── Wallet ──
  @Get('users/:id/wallet')
  async getUserWallet(@Param('id') id: string) {
    const [w, txns] = await Promise.all([
      this.wallet.getOrCreate(BigInt(id)),
      this.wallet.listTransactions(BigInt(id), 100),
    ]);
    return {
      wallet: {
        balanceToman: w.balanceToman.toString(),
        currency: w.currency,
        updatedAt: w.updatedAt,
      },
      transactions: txns.map((t) => ({
        id: t.id.toString(),
        amountToman: t.amountToman.toString(),
        type: t.type,
        description: t.description,
        balanceAfterToman: t.balanceAfterToman.toString(),
        createdAt: t.createdAt,
      })),
    };
  }

  @Post('users/:id/wallet/topup')
  async topUp(
    @Param('id') id: string,
    @Body() body: { amountToman: number | string; description?: string },
    @Req() req: { user: { id: bigint } },
  ) {
    const amt = BigInt(body.amountToman);
    const result = await this.wallet.credit(
      BigInt(id),
      amt,
      'topup_admin',
      body.description ?? 'Admin top-up',
      { adminUserId: req.user.id.toString() },
    );
    return {
      wallet: {
        balanceToman: result.wallet.balanceToman.toString(),
        currency: result.wallet.currency,
      },
      transactionId: result.transaction.id.toString(),
    };
  }

  @Post('users/:id/wallet/adjust')
  async adjust(
    @Param('id') id: string,
    @Body() body: { amountToman: number | string; description?: string },
    @Req() req: { user: { id: bigint } },
  ) {
    const amt = BigInt(body.amountToman);
    const result = amt >= 0n
      ? await this.wallet.credit(BigInt(id), amt, 'adjustment_admin', body.description ?? 'Admin adjustment', { adminUserId: req.user.id.toString() })
      : await this.wallet.debit(BigInt(id), -amt, 'adjustment_admin', body.description ?? 'Admin adjustment', { adminUserId: req.user.id.toString() });
    return {
      wallet: {
        balanceToman: result.wallet.balanceToman.toString(),
        currency: result.wallet.currency,
      },
      transactionId: result.transaction.id.toString(),
    };
  }

  // ── Pricing ──
  @Get('pricing')
  async getPricing() {
    const p = await this.pricing.get();
    return {
      perRequestToman: p.perRequestToman.toString(),
      perMbToman: p.perMbToman.toString(),
      minBalanceToman: p.minBalanceToman.toString(),
    };
  }

  @Patch('pricing')
  async updatePricing(
    @Body() body: Partial<{ perRequestToman: string; perMbToman: string; minBalanceToman: string }>,
  ) {
    const p = await this.pricing.update(body);
    return {
      perRequestToman: p.perRequestToman.toString(),
      perMbToman: p.perMbToman.toString(),
      minBalanceToman: p.minBalanceToman.toString(),
    };
  }
}
