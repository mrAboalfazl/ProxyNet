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
