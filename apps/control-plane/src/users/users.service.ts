import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

export interface CreateUserDto {
  displayName: string;
  email?: string;
  phone?: string;
  telegramId?: string;
  password?: string;
}

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomSlug(len: number): string {
  const buf = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += B62[buf[i] % B62.length];
  return out;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          dto.email ? { email: dto.email } : undefined,
          dto.phone ? { phone: dto.phone } : undefined,
          dto.telegramId ? { telegramId: dto.telegramId } : undefined,
        ].filter(Boolean),
      },
    });
    if (existing)
      throw new ConflictException('User already exists with this identifier');

    const user = await this.prisma.user.create({
      data: {
        displayName: dto.displayName,
        email: dto.email,
        phone: dto.phone,
        telegramId: dto.telegramId,
        publicSlug: randomSlug(12),
      },
    });

    if (dto.password) {
      const hash = await bcrypt.hash(dto.password, 12);
      await this.prisma.userCredential.create({
        data: {
          userId: user.id,
          method: 'password',
          credentialHash: hash,
          isPrimary: true,
        },
      });
    }

    await this.prisma.userRoutingPreference.create({
      data: { userId: user.id },
    });

    return this.findById(user.id);
  }

  async findById(id: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: { status: 'active' },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        routingPreference: true,
        usageAccount: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findMany(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total, page, limit };
  }

  async updateStatus(id: bigint, status: 'active' | 'suspended' | 'banned') {
    return this.prisma.user.update({ where: { id }, data: { status } });
  }

  async updateRoutingPreference(
    userId: bigint,
    preference: { routingMode?: string; preferredCountry?: string | null },
  ) {
    const routingMode = (preference.routingMode ?? 'auto').trim().toLowerCase();
    if (!['auto', 'country', 'local'].includes(routingMode)) {
      throw new BadRequestException(
        'routingMode must be auto, country, or local',
      );
    }

    let preferredCountry: string | null = null;
    if (routingMode === 'country') {
      preferredCountry =
        preference.preferredCountry?.trim().toUpperCase() || null;
      if (!preferredCountry || !/^[A-Z]{2}$/.test(preferredCountry)) {
        throw new BadRequestException(
          'A valid ISO 3166-1 alpha-2 country code is required',
        );
      }

      const country = await this.prisma.country.findUnique({
        where: { code: preferredCountry },
        select: { enabled: true },
      });
      if (!country?.enabled) {
        throw new BadRequestException(
          'The selected country is not currently available',
        );
      }
    }

    return this.prisma.userRoutingPreference.upsert({
      where: { userId },
      create: { userId, routingMode, preferredCountry },
      update: { routingMode, preferredCountry },
    });
  }

  async findByIdWithDetails(id: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: { status: 'active' },
          include: { plan: true },
          take: 1,
        },
        routingPreference: true,
        usageAccount: true,
        proxyCredentials: {
          where: { revokedAt: null },
          select: {
            id: true,
            uuid: true,
            label: true,
            enabled: true,
            createdAt: true,
          },
        },
        forwarders: {
          select: {
            id: true,
            slug: true,
            label: true,
            targetUrl: true,
            enabled: true,
            callCount: true,
            lastUsedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Admin-only: return the constructed VLESS URIs for every active credential this
   * user owns. Users cannot access this from their own panel.
   */
  async getVlessUrisForUser(id: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        email: true,
        phone: true,
        proxyCredentials: {
          where: { revokedAt: null, enabled: true },
          select: { id: true, uuid: true, label: true, createdAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Use the domain (not the raw IP) so URIs survive server migration.
    // Override with PROXY_SERVER_HOST env var if the panel is at a different
    // hostname than the proxy endpoint.
    const host = process.env.PROXY_SERVER_HOST ?? 'api.civonex.ir';
    const port = process.env.PROXY_SERVER_PORT ?? '443';
    const sni = process.env.REALITY_SNI ?? 'www.cloudflare.com';
    const pbk =
      process.env.REALITY_PUBLIC_KEY ??
      'omSaAuvrDD7GCpU5yOK2GUZUc5N4rxnlvGlpklPCuSo';
    const sid = process.env.REALITY_SHORT_ID ?? '3c421f5e';

    const buildUri = (uuid: string, label: string | null) => {
      const params = new URLSearchParams({
        encryption: 'none',
        security: 'reality',
        sni,
        fp: 'chrome',
        pbk,
        sid,
        type: 'tcp',
        flow: 'xtls-rprx-vision',
      });
      return `vless://${uuid}@${host}:${port}?${params.toString()}#${encodeURIComponent(label ?? 'ProxyNet')}`;
    };

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
      },
      credentials: user.proxyCredentials.map((c) => ({
        id: c.id.toString(),
        uuid: c.uuid,
        label: c.label,
        createdAt: c.createdAt,
        vlessUri: buildUri(c.uuid, c.label),
      })),
    };
  }
}
