import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { encryptRelaySecret } from './relay-secret.crypto';

@Injectable()
export class NodesService {
  constructor(private prisma: PrismaService) {}

  findAll(countryCode?: string) {
    return this.prisma.node.findMany({
      where: countryCode ? { countryCode } : undefined,
      include: {
        country: true,
        provider: true,
        capabilities: true,
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

  async generateEnrollmentToken(nodeId: bigint): Promise<{ token: string; expiresAt: Date }> {
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
    agentData: { ipv4Address?: string; ipv6Address?: string; agentVersion?: string },
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

    return { ...updated, nodeSecret };
  }

  async approveNode(nodeId: bigint, adminId: bigint) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    return this.prisma.node.update({
      where: { id: nodeId },
      data: {
        status: 'active' as never,
        approvedById: adminId,
        approvedAt: new Date(),
      },
      include: { submittedBy: { select: { id: true, displayName: true } } },
    });
  }

  async rejectNode(nodeId: bigint) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    return this.prisma.node.update({
      where: { id: nodeId },
      data: { status: 'disabled' as never },
    });
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

  async registerRelaySecret(nodeId: bigint, secret: string): Promise<void> {
    await this.prisma.node.update({
      where: { id: nodeId },
      data: { relaySecretEncrypted: encryptRelaySecret(secret) },
    });
  }

  async updateStatus(id: bigint, status: string) {
    return this.prisma.node.update({ where: { id }, data: { status: status as never } });
  }

  async recordHeartbeat(
    nodeId: bigint,
    data: {
      configVersion?: number;
      activeSessions?: number;
      agentVersion?: string;
      cpuPct?: number;
      memPct?: number;
    },
  ) {
    await this.prisma.nodeHeartbeat.create({
      data: { nodeId, configVersion: data.configVersion, agentVersion: data.agentVersion },
    });

    if (data.cpuPct !== undefined || data.memPct !== undefined) {
      await this.prisma.nodeMetric.create({
        data: {
          nodeId,
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
      },
    });
  }
}
