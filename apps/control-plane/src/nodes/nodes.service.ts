import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { encryptRelaySecret } from './relay-secret.crypto';
import { RoutingSnapshotService } from '../routing/routing-snapshot.service';

export interface RelayArtifact {
  version: string;
  sha256: string;
  content: Buffer;
}

@Injectable()
export class NodesService {
  constructor(
    private prisma: PrismaService,
    private readonly routingSnapshot: RoutingSnapshotService,
  ) {}

  findAll(countryCode?: string) {
    return this.prisma.node.findMany({
      where: countryCode ? { countryCode } : undefined,
      include: {
        country: true,
        provider: true,
        capabilities: true,
        heartbeats: { orderBy: { reportedAt: 'desc' }, take: 1 },
        metrics: { orderBy: { recordedAt: 'desc' }, take: 1 },
        submittedBy: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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

  findUserNodes(userId: bigint) {
    return this.prisma.node.findMany({
      where: { submittedById: userId },
      include: { country: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    countryCode: string;
    label: string;
    roles: string[];
    providerId?: bigint;
  }) {
    return this.prisma.node.create({
      data: { ...data, status: 'pending' },
      include: { country: true },
    });
  }

  async createUserNode(
    userId: bigint,
    data: { countryCode: string; label: string; roles: string[] },
  ) {
    const node = await this.prisma.node.create({
      data: { ...data, status: 'pending', submittedById: userId },
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

    const updated = await this.prisma.node.update({
      where: { id: node.id },
      data: {
        status: newStatus as never,
        ipv4Address: agentData.ipv4Address,
        ipv6Address: agentData.ipv6Address,
        enrollmentToken: null,
        enrollmentTokenExpiry: null,
        nodeSecretHash,
      },
    });

    await this.prisma.nodeHeartbeat.create({
      data: { nodeId: node.id, agentVersion: agentData.agentVersion },
    });

    await this.routingSnapshot.compileSnapshot();

    return { ...updated, nodeSecret };
  }

  async approveNode(nodeId: bigint, adminId: bigint) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const updated = await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        status: 'active' as never,
        approvedById: adminId,
        approvedAt: new Date(),
      },
      include: { submittedBy: { select: { id: true, displayName: true } } },
    });
    await this.routingSnapshot.compileSnapshot();
    return updated;
  }

  async rejectNode(nodeId: bigint) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const updated = await this.prisma.node.update({
      where: { id: nodeId },
      data: { status: 'disabled' as never },
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
