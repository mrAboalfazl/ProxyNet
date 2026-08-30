import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NodesService } from './nodes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NodeAuthGuard } from './guards/node-auth.guard';
import { QuotaService } from '../quota/quota.service';
import { MeteringService, RecordUsageEventData } from '../metering/metering.service';
import { ProxyCredentialsService } from '../proxy-credentials/proxy-credentials.service';
import { RoutingSnapshotService } from '../routing/routing-snapshot.service';

@ApiTags('nodes')
@ApiBearerAuth()
@Controller('nodes')
export class NodesController {
  constructor(
    private readonly nodes: NodesService,
    private readonly quota: QuotaService,
    private readonly metering: MeteringService,
    private readonly proxyCredentials: ProxyCredentialsService,
    private readonly routingSnapshot: RoutingSnapshotService,
  ) {}

  // ──────────────────────────────────────────────
  // Admin / JWT-authenticated endpoints
  // ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query('country') country?: string) {
    return this.nodes.findAll(country);
  }

  // ──────────────────────────────────────────────
  // User self-service node endpoints
  // (Must be registered before /:id to avoid route clash)
  // ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMyNodes(@Req() req: any) {
    return this.nodes.findUserNodes(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('my')
  createMyNode(
    @Req() req: any,
    @Body() body: { countryCode: string; label: string; roles?: string[] },
  ) {
    return this.nodes.createUserNode(req.user.id, {
      countryCode: body.countryCode.toUpperCase(),
      label: body.label,
      roles: body.roles ?? ['exit'],
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nodes.findById(BigInt(id));
  }

  // ──────────────────────────────────────────────
  // Public: Agent enrollment (uses enrollment token, no JWT)
  // ──────────────────────────────────────────────

  @Post('enroll')
  enroll(
    @Body()
    body: {
      token: string;
      ipv4Address?: string;
      ipv6Address?: string;
      agentVersion?: string;
    },
  ) {
    return this.nodes.consumeEnrollmentToken(body.token, {
      ipv4Address: body.ipv4Address,
      ipv6Address: body.ipv6Address,
      agentVersion: body.agentVersion,
    });
  }

  // ──────────────────────────────────────────────
  // Node-authenticated endpoints (Bearer <nodeSecret>)
  // All share NodeAuthGuard which reads :id from path params
  // ──────────────────────────────────────────────

  /** Agent heartbeat */
  @UseGuards(NodeAuthGuard)
  @Post(':id/heartbeat')
  heartbeat(
    @Param('id') id: string,
    @Body()
    body: {
      configVersion?: number;
      activeSessions?: number;
      agentVersion?: string;
      cpuPct?: number;
      memPct?: number;
    },
  ) {
    return this.nodes.recordHeartbeat(BigInt(id), body);
  }

  /** Agent fetches current routing snapshot */
  @UseGuards(NodeAuthGuard)
  @Get(':id/snapshot')
  getSnapshot() {
    return this.routingSnapshot.getCurrentSnapshot();
  }

  /**
   * Agent verifies a client proxy credential before opening a session.
   * Returns 200 with quota payload if valid and quota remains, 401/403 otherwise.
   */
  @UseGuards(NodeAuthGuard)
  @Post(':id/credential-verify')
  @HttpCode(HttpStatus.OK)
  async verifyCredential(
    @Body() body: { uuid: string; secret: string },
  ) {
    if (!body.uuid || !body.secret) {
      throw new BadRequestException('uuid and secret are required');
    }

    const valid = await this.proxyCredentials.verify(body.uuid, body.secret);
    if (!valid) {
      return { allowed: false, reason: 'invalid_credential' };
    }

    // Check Redis for a live quota token
    const quotaToken = await this.quota.getToken(body.uuid);
    if (!quotaToken) {
      return { allowed: false, reason: 'no_quota_token' };
    }

    const bytesRemaining = BigInt(quotaToken.bytesRemaining);
    if (bytesRemaining <= 0n) {
      return { allowed: false, reason: 'quota_exhausted' };
    }

    return {
      allowed: true,
      quotaToken,
    };
  }

  /**
   * Agent checks remaining quota for a credential (without verifying the secret).
   * Used for periodic quota re-checks on long-lived sessions.
   */
  @UseGuards(NodeAuthGuard)
  @Get(':id/quota/:credentialUuid')
  async getQuota(@Param('credentialUuid') credentialUuid: string) {
    const token = await this.quota.getToken(credentialUuid);
    if (!token) {
      return { hasQuota: false, reason: 'no_quota_token' };
    }
    return {
      hasQuota: BigInt(token.bytesRemaining) > 0n,
      bytesRemaining: token.bytesRemaining,
      connsRemaining: token.connsRemaining,
      expiresAt: token.expiresAt,
    };
  }

  /**
   * Agent reports a completed session's usage for metering.
   * Enqueues to BullMQ for async DB writes.
   */
  @UseGuards(NodeAuthGuard)
  @Post(':id/usage-events')
  @HttpCode(HttpStatus.ACCEPTED)
  async reportUsage(
    @Param('id') id: string,
    @Body()
    body: {
      userId: string;
      sessionId?: string;
      eventType: RecordUsageEventData['eventType'];
      protocol: string;
      bytesIn: string;
      bytesOut: string;
      sessionSeconds?: number;
      exitCountry?: string;
      exitNodeId?: string;
      destination?: string;
    },
  ) {
    await this.metering.recordUsageEvent({
      userId: BigInt(body.userId),
      nodeId: BigInt(id),
      sessionId: body.sessionId,
      eventType: body.eventType,
      protocol: body.protocol,
      bytesIn: BigInt(body.bytesIn),
      bytesOut: BigInt(body.bytesOut),
      sessionSeconds: body.sessionSeconds,
      exitCountry: body.exitCountry,
      exitNodeId: body.exitNodeId ? BigInt(body.exitNodeId) : undefined,
      destination: body.destination,
    });
    return { accepted: true };
  }
}
