import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { URL } from 'url';

// URL-safe base62 alphabet
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomSlug(len: number): string {
  const buf = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += B62[buf[i] % B62.length];
  return out;
}

// SSRF: reject config-time attempts to point at internal networks.
// The runtime proxy also enforces this (defense in depth).
const BLOCKED_HOSTS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./, /^169\.254\./,
  /^::1$/, /^fc[0-9a-f]{2}:/i, /^fd[0-9a-f]{2}:/i, /^fe80:/i,
];

export interface CreateForwarderDto {
  label: string;
  targetUrl: string;
  preservePath?: boolean;
  preserveQuery?: boolean;
  forwardAuthHeader?: boolean;
}

export interface UpdateForwarderDto {
  label?: string;
  targetUrl?: string;
  preservePath?: boolean;
  preserveQuery?: boolean;
  forwardAuthHeader?: boolean;
  enabled?: boolean;
}

@Injectable()
export class ForwardersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a user-supplied target URL. Same policy as GatewayService uses. */
  private validateTargetUrl(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid targetUrl');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('targetUrl must be http or https');
    }
    if (parsed.hostname.length === 0) {
      throw new BadRequestException('targetUrl missing hostname');
    }
    if (BLOCKED_HOSTS.some((re) => re.test(parsed.hostname))) {
      throw new BadRequestException(
        `targetUrl points at a blocked network (${parsed.hostname}). Private/loopback/link-local addresses are not allowed.`,
      );
    }
    return parsed;
  }

  async list(userId: bigint) {
    return this.prisma.forwarder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: bigint, dto: CreateForwarderDto) {
    if (!dto.label || dto.label.length > 80) {
      throw new BadRequestException('label is required (max 80 chars)');
    }
    this.validateTargetUrl(dto.targetUrl);

    // Collision-avoidance loop: generate slug, retry if unique-conflict (should never happen with 20 chars)
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = randomSlug(20);
      try {
        return await this.prisma.forwarder.create({
          data: {
            userId,
            slug,
            label: dto.label,
            targetUrl: dto.targetUrl,
            preservePath: dto.preservePath ?? true,
            preserveQuery: dto.preserveQuery ?? true,
            forwardAuthHeader: dto.forwardAuthHeader ?? true,
          },
        });
      } catch (e: unknown) {
        // Prisma unique-constraint code
        if ((e as { code?: string })?.code === 'P2002' && attempt < 4) continue;
        throw e;
      }
    }
    throw new Error('failed to generate a unique forwarder slug');
  }

  async update(userId: bigint, id: bigint, dto: UpdateForwarderDto) {
    const fwd = await this.prisma.forwarder.findUnique({ where: { id } });
    if (!fwd) throw new NotFoundException('Forwarder not found');
    if (fwd.userId !== userId) throw new ForbiddenException('You do not own this forwarder');

    if (dto.targetUrl !== undefined) this.validateTargetUrl(dto.targetUrl);
    if (dto.label !== undefined && (dto.label.length === 0 || dto.label.length > 80)) {
      throw new BadRequestException('label must be 1-80 chars');
    }

    return this.prisma.forwarder.update({
      where: { id },
      data: {
        label: dto.label,
        targetUrl: dto.targetUrl,
        preservePath: dto.preservePath,
        preserveQuery: dto.preserveQuery,
        forwardAuthHeader: dto.forwardAuthHeader,
        enabled: dto.enabled,
      },
    });
  }

  async remove(userId: bigint, id: bigint): Promise<void> {
    const fwd = await this.prisma.forwarder.findUnique({ where: { id } });
    if (!fwd) throw new NotFoundException('Forwarder not found');
    if (fwd.userId !== userId) throw new ForbiddenException('You do not own this forwarder');
    await this.prisma.forwarder.delete({ where: { id } });
  }

  /**
   * Looked up by the public proxy controller. Returns the forwarder plus its owner
   * (only fields needed to route the request), or null if not found/disabled/user-suspended.
   */
  async findForProxy(userSlug: string, forwarderSlug: string) {
    return this.prisma.forwarder.findFirst({
      where: {
        slug: forwarderSlug,
        enabled: true,
        user: { publicSlug: userSlug, status: 'active' },
      },
      include: { user: { select: { id: true, publicSlug: true } } },
    });
  }

  /** After a successful proxy call, bump the counters. Best-effort — errors ignored. */
  async recordCall(id: bigint, bytesIn: number, bytesOut: number): Promise<void> {
    try {
      await this.prisma.forwarder.update({
        where: { id },
        data: {
          callCount: { increment: 1 },
          bytesIn: { increment: BigInt(bytesIn) },
          bytesOut: { increment: BigInt(bytesOut) },
          lastUsedAt: new Date(),
        },
      });
    } catch {
      // metering failures shouldn't take down request handling
    }
  }
}
