import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XrayConfigService } from '../xray/xray-config.service';
import * as bcrypt from 'bcrypt';
import { usableNodeWhere, resolveExitNode } from '../nodes/node-access';
import { randomBytes } from 'crypto';

export interface Socks5EndpointResult {
  endpoints: Array<{
    nodeId: string;
    label: string;
    countryCode: string;
    countryName: string;
    host: string;
    port: number;
  }>;
  requiresActivePlan: boolean;
}

@Injectable()
export class ProxyCredentialsService {
  constructor(
    private prisma: PrismaService,
    private xray: XrayConfigService,
  ) {}

  async create(
    userId: bigint,
    dto: {
      label?: string;
      projectId?: string | number | null;
      exitNodeId?: string | null;
      countryCode?: string | null;
      routingMode?: string;
    } = {},
  ) {
    const exitNodeId = await resolveExitNode(this.prisma, userId, dto.exitNodeId);
    const secret = randomBytes(24).toString('base64url');
    const secretHash = await bcrypt.hash(secret, 10);

    const projectId = await this.resolveProjectId(userId, dto.projectId);

    const credential = await this.prisma.proxyCredential.create({
      data: {
        userId,
        projectId,
        exitNodeId,
        secretHash,
        label: dto.label ?? 'Default',
        countryCode: dto.countryCode ? dto.countryCode.toUpperCase() : null,
        routingMode: dto.routingMode === 'country' ? 'country' : 'auto',
      },
    });

    // Sync new UUID to xray so the VLESS connection actually works
    if (!credential.exitNodeId) await this.xray.addClient(credential.uuid);

    return {
      id: credential.id.toString(),
      uuid: credential.uuid,
      secret,           // returned once �?" client must save it
      label: credential.label,
      projectId: credential.projectId,
      exitNodeId: credential.exitNodeId,
      countryCode: credential.countryCode,
      routingMode: credential.routingMode,
      createdAt: credential.createdAt,
    };
  }

  async update(
    userId: bigint,
    id: bigint,
    dto: {
      label?: string;
      enabled?: boolean;
      projectId?: string | number | null;
      exitNodeId?: string | null;
      countryCode?: string | null;
      routingMode?: string;
    },
  ) {
    const credential = await this.prisma.proxyCredential.findUnique({ where: { id } });
    if (!credential) throw new NotFoundException('Proxy credential not found');
    if (credential.userId !== userId) {
      throw new ForbiddenException('You do not own this credential');
    }

    const exitNodeId = await resolveExitNode(this.prisma, userId, dto.exitNodeId);
    const projectId =
      dto.projectId === undefined
        ? undefined
        : await this.resolveProjectId(userId, dto.projectId);

    const updated = await this.prisma.proxyCredential.update({
      where: { id },
      data: {
        exitNodeId,
        label: dto.label,
        enabled: dto.enabled,
        projectId,
        countryCode:
          dto.countryCode === undefined
            ? undefined
            : dto.countryCode
              ? dto.countryCode.toUpperCase()
              : null,
        routingMode:
          dto.routingMode === undefined
            ? undefined
            : dto.routingMode === 'country'
              ? 'country'
              : 'auto',
      },
    });
    if (exitNodeId !== undefined && exitNodeId !== credential.exitNodeId) {
      if (exitNodeId) await this.xray.removeClient(credential.uuid);
      else await this.xray.addClient(credential.uuid);
    }
    return updated;
  }

  private async resolveProjectId(
    userId: bigint,
    projectId?: string | number | null,
  ): Promise<bigint | null> {
    if (projectId === undefined || projectId === null || projectId === '') {
      return null;
    }
    const id = BigInt(projectId);
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project || project.userId !== userId) {
      throw new ForbiddenException('Invalid projectId');
    }
    return id;
  }

  async findByUser(userId: bigint) {
    return this.prisma.proxyCredential.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      select: {
        id: true,
        uuid: true,
        label: true,
        enabled: true,
        projectId: true,
        exitNodeId: true,
        countryCode: true,
        routingMode: true,
        createdAt: true,
      },
    });
  }

  async getSocks5Endpoints(userId: bigint): Promise<Socks5EndpointResult> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active', periodStart: { lte: new Date() }, periodEnd: { gt: new Date() } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) return { endpoints: [], requiresActivePlan: true };

    const nodes = await this.prisma.node.findMany({
      where: {
        ...usableNodeWhere(userId),
        ipv4Address: { not: null },
        roles: { has: 'exit' },
        country: { enabled: true },
      },
      include: {
        country: { select: { name: true } },
      },
      orderBy: { countryCode: 'asc' },
    });

    const nodeVersions = await Promise.all(
      nodes.map(async (node) => {
        if (node.relayVersion) return { nodeId: node.id, version: node.relayVersion };
        const hb = await this.prisma.nodeHeartbeat.findFirst({
          where: { nodeId: node.id },
          select: { agentVersion: true },
          orderBy: { reportedAt: 'desc' },
        });
        return { nodeId: node.id, version: hb?.agentVersion ?? null };
      }),
    );
    const versionMap = new Map(nodeVersions.map((v) => [v.nodeId, v.version]));

    const allowedCountries = subscription.plan.allowedCountries;
    const socksPort = Number.parseInt(process.env.SOCKS5_PORT ?? '1080', 10) || 1080;
    return {
      requiresActivePlan: false,
      endpoints: nodes
        .filter(
          (node) =>
            (allowedCountries.length === 0 || allowedCountries.includes(node.countryCode)) &&
            supportsSocks5(versionMap.get(node.id)),
        )
        .map((node) => ({
          nodeId: node.id.toString(),
          label: node.label,
          countryCode: node.countryCode,
          countryName: node.country.name,
          host: node.ipv4Address as string,
          port: socksPort,
        })),
    };
  }

  async revoke(userId: bigint, credentialId: bigint): Promise<void> {
    const credential = await this.prisma.proxyCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      throw new NotFoundException('Proxy credential not found');
    }

    if (credential.userId !== userId) {
      throw new ForbiddenException('You do not own this credential');
    }

    await this.prisma.proxyCredential.update({
      where: { id: credentialId },
      data: {
        enabled: false,
        revokedAt: new Date(),
      },
    });

    // Remove from xray so the UUID can no longer connect
    await this.xray.removeClient(credential.uuid);
  }

  async canUseCredentialOnNode(uuid: string, nodeId: bigint): Promise<boolean> {
    const credential = await this.prisma.proxyCredential.findUnique({ where: { uuid }, include: { user: { select: { status: true } } } });
    if (!credential || !credential.enabled || credential.revokedAt || credential.user.status !== 'active') return false;
    if (credential.exitNodeId && credential.exitNodeId !== nodeId) return false;
    const node = await this.prisma.node.findFirst({ where: { AND: [usableNodeWhere(credential.userId), { id: nodeId }] } });
    if (!node) return false;
    const subscription = await this.prisma.subscription.findFirst({ where: { userId: credential.userId, status: 'active', periodStart: { lte: new Date() }, periodEnd: { gt: new Date() } }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
    if (!subscription) return false;
    const allowed = subscription.plan.allowedCountries;
    return !allowed.length || allowed.includes(node.countryCode);
  }

  async verify(uuid: string, secret: string, nodeId?: bigint): Promise<{ valid: false } | { valid: true; userId: bigint }> {
    const credential = await this.prisma.proxyCredential.findUnique({ where: { uuid }, include: { user: { select: { status: true } } } });
    if (!credential || !credential.enabled || credential.revokedAt || credential.user.status !== 'active' || !await bcrypt.compare(secret, credential.secretHash)) return { valid: false };
    if (nodeId !== undefined) {
      if (!await this.canUseCredentialOnNode(uuid, nodeId)) return { valid: false };
    } else if (credential.exitNodeId) {
      // A credential bound to a SOCKS5 exit cannot be reused on the HTTP gateway.
      return { valid: false };
    }
    return { valid: true, userId: credential.userId };
  }

  async recordUsage(uuid: string, bytesIn: bigint, bytesOut: bigint): Promise<void> {
    try {
      await this.prisma.proxyCredential.update({
        where: { uuid },
        data: {
          callCount: { increment: 1n },
          bytesIn: { increment: bytesIn },
          bytesOut: { increment: bytesOut },
          lastUsedAt: new Date(),
        },
      });
    } catch {
      // Non-blocking: table column might not yet exist if migration is pending
    }
  }
}

function supportsSocks5(agentVersion?: string | null): boolean {
  const match = agentVersion?.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const [, major, minor] = match;
  return Number(major) > 1 || (Number(major) === 1 && Number(minor) >= 1);
}
