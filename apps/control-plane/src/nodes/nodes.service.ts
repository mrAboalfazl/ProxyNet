import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { usableNodeWhere, planCountryWhere } from './node-access';
import { encryptRelaySecret } from './relay-secret.crypto';
import { RoutingSnapshotService } from '../routing/routing-snapshot.service';

export interface RelayArtifact {
  version: string;
  sha256: string;
  content: Buffer;
}

@Injectable()
export class NodesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NodesService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private readonly routingSnapshot: RoutingSnapshotService,
  ) {}

  onModuleInit() {
    // Run cleanup once on startup after 30 seconds
    setTimeout(() => {
      void this.cleanupOldTelemetry();
    }, 30_000);

    // Then schedule to run every 12 hours
    this.cleanupTimer = setInterval(() => {
      void this.cleanupOldTelemetry();
    }, 12 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Automatically prune telemetry (heartbeats and raw metrics) older than 7 days
   * to prevent database bloat while keeping recent history for admin dashboards.
   */
  async cleanupOldTelemetry(retentionDays = 7) {
    try {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const [heartbeats, metrics] = await Promise.all([
        this.prisma.nodeHeartbeat.deleteMany({
          where: { reportedAt: { lt: cutoff } },
        }),
        this.prisma.nodeMetric.deleteMany({
          where: { recordedAt: { lt: cutoff } },
        }),
      ]);

      if (heartbeats.count > 0 || metrics.count > 0) {
        this.logger.log(
          `Telemetry cleanup: deleted ${heartbeats.count} old heartbeats and ${metrics.count} old metrics (older than ${retentionDays} days)`,
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to cleanup old telemetry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async findAll(countryCode?: string) {
    const nodes = await this.prisma.node.findMany({
      where: countryCode ? { countryCode } : undefined,
      include: {
        country: true,
        provider: true,
        capabilities: true,
        submittedBy: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      nodes.map(async (node) => {
        const [heartbeat, metric] = await Promise.all([
          this.prisma.nodeHeartbeat.findFirst({
            where: { nodeId: node.id },
            orderBy: { reportedAt: 'desc' },
          }),
          this.prisma.nodeMetric.findFirst({
            where: { nodeId: node.id },
            orderBy: { recordedAt: 'desc' },
          }),
        ]);
        return {
          ...node,
          heartbeats: heartbeat ? [heartbeat] : [],
          metrics: metric ? [metric] : [],
        };
      }),
    );
  }

  async findById(id: bigint) {
    const node = await this.prisma.node.findUnique({
      where: { id },
      include: {
        country: true,
        provider: true,
        capabilities: true,
        edgeEndpoints: true,
        healthChecks: { orderBy: { checkedAt: 'desc' }, take: 10 },
        heartbeats: { orderBy: { reportedAt: 'desc' }, take: 20 },
        metrics: { orderBy: { recordedAt: 'desc' }, take: 5 },
        submittedBy: { select: { id: true, displayName: true } },
      },
    });
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  async findUserNodes(userId: bigint) {
    const nodes = await this.prisma.node.findMany({
      where: { submittedById: userId },
      include: { country: true },
      orderBy: { createdAt: 'desc' },
    });
    return nodes.map(({ nodeSecretHash, relaySecretEncrypted, enrollmentToken, enrollmentTokenExpiry, ...node }) => ({ ...node, enrolled: Boolean(nodeSecretHash), httpReady: Boolean(relaySecretEncrypted) && !node.userPaused && ['active', 'healthy'].includes(node.status) && Boolean(node.roles?.includes('exit')) && Boolean(node.country?.enabled) && Boolean(node.ipv4Address || node.ipv6Address) }));
  }

  private validLabel(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new BadRequestException('Name must be 1-80 characters');
    return value.trim();
  }

  private async ownedNode(userId: bigint, value: string) {
    if (!/^[1-9][0-9]*$/.test(value)) throw new BadRequestException('Invalid node');
    const node = await this.prisma.node.findUnique({ where: { id: BigInt(value) } });
    if (!node || node.submittedById !== userId) throw new ForbiddenException('You do not own this node');
    return node;
  }

  async updateUserNode(userId: bigint, value: string, body: { label?: string; userPaused?: boolean; sharing?: 'private' | 'request-public' }) {
    const node = await this.ownedNode(userId, value);
    if (body.userPaused !== undefined && typeof body.userPaused !== 'boolean') throw new BadRequestException('Invalid pause state');
    if (body.sharing !== undefined && !['private', 'request-public'].includes(body.sharing)) throw new BadRequestException('Invalid sharing choice');
    if (body.sharing === 'request-public' && node.status === 'disabled') throw new BadRequestException('Disabled nodes require administrator review');
    await this.prisma.node.update({ where: { id: node.id }, data: {
      ...(body.label !== undefined ? { label: this.validLabel(body.label) } : {}),
      ...(body.userPaused !== undefined ? { userPaused: body.userPaused } : {}),
      ...(body.sharing === 'private' ? { visibility: 'private', sharingRequested: false } : {}),
      ...(body.sharing === 'request-public' && node.visibility !== 'public' ? { sharingRequested: true } : {}),
    } });
    await this.routingSnapshot.compileSnapshot();
    return { success: true };
  }

  async requestUserNodeUpdate(userId: bigint, value: string) {
    const node = await this.ownedNode(userId, value);
    if (!node.nodeSecretHash || !['pending', 'active', 'healthy', 'degraded'].includes(node.status)) throw new BadRequestException('This node cannot receive an update');
    await this.requestNodeUpdate(node.id);
    return { requested: true };
  }

  async renewUserEnrollment(userId: bigint, value: string) {
    const node = await this.ownedNode(userId, value);
    if (node.status !== 'pending' || node.nodeSecretHash) throw new BadRequestException('Only uninstalled pending nodes can receive an installation token');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.node.update({ where: { id: node.id }, data: { enrollmentToken: token, enrollmentTokenExpiry: expiresAt } });
    return { token, expiresAt };
  }

  async availableForUser(userId: bigint) {
    const countryAccess = await planCountryWhere(this.prisma, userId);
    return this.prisma.node.findMany({
      where: { AND: [usableNodeWhere(userId), countryAccess, { relaySecretEncrypted: { not: null }, OR: [{ ipv4Address: { not: null } }, { ipv6Address: { not: null } }] }] },
      select: { id: true, label: true, countryCode: true, visibility: true, submittedById: true },
      orderBy: { label: 'asc' },
    });
  }

  async snapshotForNode(nodeId: bigint) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId }, select: { submittedById: true } });
    const snapshot = await this.routingSnapshot.getCurrentSnapshot();
    const visible = await this.prisma.node.findMany({ where: {
      OR: [{ visibility: 'public' }, { id: nodeId }, ...(node?.submittedById ? [{ submittedById: node.submittedById }] : [])],
    }, select: { id: true } });
    const ids = new Set(visible.map((n) => n.id.toString()));
    return { ...snapshot, nodes: snapshot.nodes.filter((n) => ids.has(n.id)), policies: snapshot.policies.filter((p) => !p.appliesToUserId || p.appliesToUserId === node?.submittedById?.toString()) };
  }

  async create(data: {
    countryCode: string;
    label: string;
    roles: string[];
    providerId?: bigint;
  }) {
    return this.prisma.node.create({
      data: { ...data, status: 'pending', visibility: 'public' },
      include: { country: true },
    });
  }

  async createUserNode(
    userId: bigint,
    data: { countryCode: string; label: string; roles: string[]; sharing?: 'private' | 'request-public' },
  ) {
    const label = this.validLabel(data.label);
    const countryCode = typeof data.countryCode === 'string' ? data.countryCode.trim().toUpperCase() : '';
    const country = await this.prisma.country.findUnique({ where: { code: countryCode } });
    if (!country?.enabled) throw new BadRequestException('Select an enabled country');
    if (data.sharing && !['private', 'request-public'].includes(data.sharing)) throw new BadRequestException('Invalid sharing choice');
    const node = await this.prisma.node.create({
      data: { label, countryCode, roles: ['exit'], status: 'pending', submittedById: userId, visibility: 'private', sharingRequested: data.sharing === 'request-public' },
      include: { country: true },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.node.update({
      where: { id: node.id },
      data: { enrollmentToken: token, enrollmentTokenExpiry: expiresAt },
    });

    return { node, token, expiresAt };
  }

  async generateEnrollmentToken(
    nodeId: bigint,
  ): Promise<{ token: string; expiresAt: Date }> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.status !== 'pending' || node.nodeSecretHash) throw new BadRequestException('Only uninstalled pending nodes can receive an installation token');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.node.update({
      where: { id: nodeId },
      data: { enrollmentToken: token, enrollmentTokenExpiry: expiresAt },
    });

    return { token, expiresAt };
  }

  async consumeEnrollmentToken(
    token: string,
    agentData: {
      ipv4Address?: string;
      ipv6Address?: string;
      agentVersion?: string;
    },
  ) {
    const node = await this.prisma.node.findFirst({
      where: {
        enrollmentToken: token,
        enrollmentTokenExpiry: { gt: new Date() },
        status: 'pending',
      },
    });

    if (!node) return null;

    const nodeSecret = randomBytes(32).toString('hex');
    const nodeSecretHash = await bcrypt.hash(nodeSecret, 10);

    // User-submitted nodes stay pending until admin approves.
    // Admin-created nodes (submittedById = null) auto-activate on enrollment.
    const newStatus = node.submittedById ? 'pending' : 'active';

    const claimed = await this.prisma.node.updateMany({
      where: { id: node.id, enrollmentToken: token, enrollmentTokenExpiry: { gt: new Date() }, status: 'pending', nodeSecretHash: null },
      data: {
        status: newStatus as never,
        ipv4Address: agentData.ipv4Address,
        ipv6Address: agentData.ipv6Address,
        enrollmentToken: null,
        enrollmentTokenExpiry: null,
        nodeSecretHash,
        updateRequestedAt: new Date(),
        updateStatus: 'requested',
      },
    });

    if (claimed.count !== 1) return null;
    const updated = await this.prisma.node.findUniqueOrThrow({ where: { id: node.id } });

    await this.prisma.nodeHeartbeat.create({
      data: { nodeId: node.id, agentVersion: agentData.agentVersion },
    });

    await this.routingSnapshot.compileSnapshot();

    return { ...updated, nodeSecret };
  }

  async approveNode(nodeId: bigint, adminId: bigint) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    if ((node.status !== 'pending' && !node.sharingRequested) || node.status === 'disabled' || !node.nodeSecretHash) {
      throw new BadRequestException('Only enrolled nodes awaiting approval can be approved');
    }

    const approved = await this.prisma.node.updateMany({
      where: { id: nodeId, status: node.status, sharingRequested: node.sharingRequested ?? false, nodeSecretHash: { not: null } },
      data: {
        status: (node.status === 'pending' ? 'active' : node.status) as never,
        ...(node.sharingRequested ? { visibility: 'public', sharingRequested: false } : {}),
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
    if (approved.count !== 1) throw new BadRequestException('Node or sharing request changed; refresh before approving');
    const updated = await this.prisma.node.findUniqueOrThrow({ where: { id: nodeId } });
    await this.routingSnapshot.compileSnapshot();
    return updated;
  }

  async rejectNode(nodeId: bigint) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const updated = await this.prisma.node.update({
      where: { id: nodeId },
      data: node.sharingRequested && node.status !== 'pending'
        ? { sharingRequested: false, visibility: 'private' }
        : { status: 'disabled' as never, sharingRequested: false, visibility: 'private' },
    });
    await this.routingSnapshot.compileSnapshot();
    return updated;
  }

  async verifyNodeSecret(nodeId: bigint, secret: string): Promise<boolean> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { nodeSecretHash: true, status: true },
    });

    if (!node?.nodeSecretHash) return false;

    // Allow pending (enrolled but not yet approved) nodes to heartbeat
    const activeStatuses = ['pending', 'active', 'healthy', 'degraded'];
    if (!activeStatuses.includes(node.status)) return false;

    return bcrypt.compare(secret, node.nodeSecretHash);
  }

  private resolveRepoRoot(): string {
    const candidates = [
      process.env.PROXYNET_REPO_ROOT,
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(process.cwd(), '../..'),
      path.resolve(__dirname, '../../..'),
      path.resolve(__dirname, '../../../..'),
    ].filter((value): value is string => Boolean(value));

    for (const root of candidates) {
      if (fs.existsSync(path.join(root, 'packages/node-relay/index.js'))) {
        return root;
      }
    }
    throw new ServiceUnavailableException(
      'Relay artifact is not available on this control plane',
    );
  }

  getInstaller(): Buffer {
    return fs.readFileSync(path.join(this.resolveRepoRoot(), 'scripts/install.sh'));
  }

  getUpdaterArtifact(): RelayArtifact {
    const content = fs.readFileSync(path.join(this.resolveRepoRoot(), 'packages/node-relay/updater.js'));
    return { version: '2026.11.16.1', content, sha256: createHash('sha256').update(content).digest('hex') };
  }

  getRelayArtifact(): RelayArtifact {
    const root = this.resolveRepoRoot();
    const file = path.join(root, 'packages/node-relay/index.js');
    const content = fs.readFileSync(file);
    const sha256 = createHash('sha256').update(content).digest('hex');
    const versionFile = path.join(root, 'packages/node-relay/VERSION');
    const version = fs.existsSync(versionFile)
      ? fs.readFileSync(versionFile, 'utf8').trim()
      : sha256.slice(0, 12);
    return { version, sha256, content };
  }

  async registerRelaySecret(
    nodeId: bigint,
    secret: string,
    meta?: { relayVersion?: string; relaySha256?: string },
  ): Promise<{ update: { requestedAt: string; relay: { version: string; sha256: string; url: string } } | null }> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { updateRequestedAt: true },
    });
    const requestedAt = node?.updateRequestedAt ?? null;

    let artifact: RelayArtifact | null = null;
    try {
      artifact = this.getRelayArtifact();
    } catch {
      artifact = null;
    }

    const matchesCurrentBuild = Boolean(
      artifact && meta?.relaySha256 && meta.relaySha256 === artifact.sha256,
    );

    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        relaySecretEncrypted: encryptRelaySecret(secret),
        ...(meta?.relayVersion ? { relayVersion: meta.relayVersion } : {}),
        ...(meta?.relaySha256 ? { relaySha256: meta.relaySha256 } : {}),
        ...(requestedAt && matchesCurrentBuild
          ? { updateRequestedAt: null, updateStatus: 'success', updateMessage: null }
          : {}),
      },
    });

    if (!requestedAt || matchesCurrentBuild || !artifact) {
      return { update: null };
    }

    return {
      update: {
        requestedAt: requestedAt.toISOString(),
        relay: {
          version: artifact.version,
          sha256: artifact.sha256,
          url: `/api/nodes/${nodeId}/artifact/relay`,
        },
      },
    };
  }

  async requestNodeUpdate(nodeId: bigint) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true },
    });
    if (!node) throw new NotFoundException('Node not found');
    return this.prisma.node.update({
      where: { id: nodeId },
      data: {
        updateRequestedAt: new Date(),
        updateStatus: 'requested',
        updateMessage: null,
      },
    });
  }

  async requestAllNodesUpdate() {
    const result = await this.prisma.node.updateMany({
      where: {
        nodeSecretHash: { not: null },
        status: { not: 'disabled' },
      },
      data: {
        updateRequestedAt: new Date(),
        updateStatus: 'requested',
        updateMessage: null,
      },
    });
    return { requested: result.count };
  }

  async reportNodeUpdate(
    nodeId: bigint,
    data: { status: string; message?: string },
  ) {
    return this.prisma.node.update({
      where: { id: nodeId },
      data: {
        updateStatus: data.status,
        updateMessage: data.message ?? null,
        ...(data.status === 'success' ? { updateRequestedAt: null } : {}),
      },
    });
  }

  async updateStatus(id: bigint, status: string) {
    const node = await this.prisma.node.findUnique({
      where: { id },
      select: { nodeSecretHash: true },
    });
    if (!node) throw new NotFoundException('Node not found');
    if (status === 'pending' && node.nodeSecretHash) {
      throw new BadRequestException(
        'An enrolled node cannot be reset to pending',
      );
    }
    if (status === 'active' && !node.nodeSecretHash) {
      throw new BadRequestException('Enroll the node before activating it');
    }
    const updated = await this.prisma.node.update({
      where: { id },
      data: { status: status as never },
    });
    await this.routingSnapshot.compileSnapshot();
    return updated;
  }

  async recordHeartbeat(
    nodeId: bigint,
    data: {
      configVersion?: number;
      agentVersion?: string;
      cpuPct?: number;
      memPct?: number;
      activeSessions?: number;
      hostname?: string;
      osName?: string;
      architecture?: string;
      cpuCores?: number;
      memoryBytes?: string;
      uptimeSeconds?: string;
    },
  ) {
    await this.prisma.nodeHeartbeat.create({
      data: {
        nodeId,
        configVersion: data.configVersion,
        agentVersion: data.agentVersion,
      },
    });

    if (
      data.cpuPct !== undefined ||
      data.memPct !== undefined ||
      data.activeSessions !== undefined
    ) {
      await this.prisma.nodeMetric.create({
        data: {
          nodeId,
          activeSessions: data.activeSessions,
          cpuPct: data.cpuPct,
          memPct: data.memPct,
        },
      });
    }

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { status: true },
    });

    const lastSeen = new Date();
    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        updatedAt: lastSeen,
        // Only promote to healthy if already approved/active (not pending)
        ...(node?.status === 'active' ? { status: 'healthy' as never } : {}),
        ...(data.agentVersion !== undefined ? { relayVersion: data.agentVersion } : {}),
        ...(data.hostname !== undefined ? { hostname: data.hostname } : {}),
        ...(data.osName !== undefined ? { osName: data.osName } : {}),
        ...(data.architecture !== undefined
          ? { architecture: data.architecture }
          : {}),
        ...(data.cpuCores !== undefined ? { cpuCores: data.cpuCores } : {}),
        ...(data.memoryBytes !== undefined
          ? { memoryBytes: BigInt(data.memoryBytes) }
          : {}),
        ...(data.uptimeSeconds !== undefined
          ? { uptimeSeconds: BigInt(data.uptimeSeconds) }
          : {}),
      },
    });
  }
}
