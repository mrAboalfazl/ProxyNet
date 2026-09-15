import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XrayConfigService } from '../xray/xray-config.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class ProxyCredentialsService {
  constructor(
    private prisma: PrismaService,
    private xray: XrayConfigService,
  ) {}

  async create(userId: bigint, label?: string) {
    const secret = randomBytes(24).toString('base64url');
    const secretHash = await bcrypt.hash(secret, 10);

    const credential = await this.prisma.proxyCredential.create({
      data: {
        userId,
        secretHash,
        label: label ?? 'Default',
      },
    });

    // Sync new UUID to xray so the VLESS connection actually works
    await this.xray.addClient(credential.uuid);

    return {
      id: credential.id.toString(),
      uuid: credential.uuid,
      secret,           // returned once — client must save it
      label: credential.label,
      createdAt: credential.createdAt,
    };
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
        createdAt: true,
      },
    });
  }

  async getSocks5Endpoints(userId: bigint) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) return [];

    const nodes = await this.prisma.node.findMany({
      where: {
        status: { in: ['healthy', 'degraded'] },
        ipv4Address: { not: null },
        roles: { has: 'exit' },
        country: { enabled: true },
      },
      include: {
        country: { select: { name: true } },
        heartbeats: {
          select: { agentVersion: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { countryCode: 'asc' },
    });

    const allowedCountries = subscription.plan.allowedCountries;
    const socksPort = Number.parseInt(process.env.SOCKS5_PORT ?? '1080', 10) || 1080;
    return nodes
      .filter((node) =>
        (allowedCountries.length === 0 || allowedCountries.includes(node.countryCode)) &&
        supportsSocks5(node.heartbeats[0]?.agentVersion),
      )
      .map((node) => ({
        nodeId: node.id.toString(),
        label: node.label,
        countryCode: node.countryCode,
        countryName: node.country.name,
        host: node.ipv4Address as string,
        port: socksPort,
      }));
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

  async verify(uuid: string, secret: string): Promise<{ valid: false } | { valid: true; userId: bigint }> {
    const credential = await this.prisma.proxyCredential.findUnique({
      where: { uuid },
    });

    if (!credential || !credential.enabled || credential.revokedAt !== null) {
      return { valid: false };
    }

    const match = await bcrypt.compare(secret, credential.secretHash);
    if (!match) return { valid: false };
    return { valid: true, userId: credential.userId };
  }
}

function supportsSocks5(agentVersion?: string | null): boolean {
  const match = agentVersion?.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const [, major, minor] = match;
  return Number(major) > 1 || (Number(major) === 1 && Number(minor) >= 1);
}
