import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveExitNode } from '../nodes/node-access';
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

export type ForwarderRoutingMode = 'auto' | 'country' | 'tunnel' | 'direct';

export interface CreateForwarderDto {
  label: string;
  targetUrl: string;
  preservePath?: boolean;
  preserveQuery?: boolean;
  forwardAuthHeader?: boolean;
  countryCode?: string | null;
  countryCodes?: string[] | null;
  projectId?: string | number | null;
  exitNodeId?: string | null;
  routingMode?: ForwarderRoutingMode;
  upstreamTunnelId?: string | number | null;
  streamingEnabled?: boolean;
}

export interface UpdateForwarderDto {
  label?: string;
  targetUrl?: string;
  preservePath?: boolean;
  preserveQuery?: boolean;
  forwardAuthHeader?: boolean;
  countryCode?: string | null;
  countryCodes?: string[] | null;
  projectId?: string | number | null;
  exitNodeId?: string | null;
  routingMode?: ForwarderRoutingMode;
  upstreamTunnelId?: string | number | null;
  streamingEnabled?: boolean;
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

  /**
   * Validate an ordered list of exit countries. `undefined` means "leave
   * unchanged", `null`/empty means "clear" (auto / account routing).
   */
  private async resolveCountries(
    userId: bigint,
    codes?: string[] | null,
  ): Promise<string[] | undefined> {
    if (codes === undefined) return undefined;
    if (codes === null) return [];

    const normalized = Array.from(
      new Set(
        codes
          .map((code) => code.trim().toUpperCase())
          .filter((code) => /^[A-Z]{2}$/.test(code)),
      ),
    );
    if (!normalized.length) return [];

    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const allowed = subscription?.plan.allowedCountries ?? [];

    for (const code of normalized) {
      const country = await this.prisma.country.findUnique({
        where: { code },
      });
      if (!country || !country.enabled) {
        throw new BadRequestException(`Country ${code} is not available`);
      }
      if (allowed.length > 0 && !allowed.includes(code)) {
        throw new BadRequestException(
          `Country ${code} is not included in your plan`,
        );
      }
    }

    return normalized;
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
      throw new BadRequestException('Invalid projectId');
    }
    return id;
  }

  private async defaultProjectId(userId: bigint): Promise<bigint> {
    let project = await this.prisma.project.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!project) {
      project = await this.prisma.project.create({
        data: { userId, name: 'Default', slug: randomSlug(12) },
      });
    }
    return project.id;
  }

  private normalizeRoutingMode(
    mode?: string | null,
    fallback: ForwarderRoutingMode = 'auto',
  ): ForwarderRoutingMode {
    if (!mode) return fallback;
    if (
      mode === 'auto' ||
      mode === 'country' ||
      mode === 'tunnel' ||
      mode === 'direct'
    ) {
      return mode;
    }
    throw new BadRequestException(
      'routingMode must be one of: auto, country, tunnel, direct',
    );
  }

  private async resolveUpstreamTunnelId(
    userId: bigint,
    tunnelId?: string | number | null,
  ): Promise<bigint | null | undefined> {
    if (tunnelId === undefined) return undefined;
    if (tunnelId === null || tunnelId === '') return null;

    const id = BigInt(tunnelId);
    const tunnel = await this.prisma.upstreamTunnel.findUnique({
      where: { id },
      include: { country: true },
    });
    if (!tunnel || !tunnel.enabled || !tunnel.country?.enabled) {
      throw new BadRequestException('Selected upstream tunnel is unavailable');
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    const allowed = subscription?.plan.allowedCountries ?? [];
    if (allowed.length > 0 && !allowed.includes(tunnel.countryCode)) {
      throw new BadRequestException(
        `Country ${tunnel.countryCode} is not included in your plan`,
      );
    }

    return id;
  }

  async list(userId: bigint) {
    return this.prisma.forwarder.findMany({
      where: { userId },
      include: {
        upstreamTunnel: {
          select: {
            id: true,
            label: true,
            protocol: true,
            countryCode: true,
            status: true,
            latencyMs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: bigint, dto: CreateForwarderDto) {
    if (!dto.label || dto.label.length > 80) {
      throw new BadRequestException('label is required (max 80 chars)');
    }
    this.validateTargetUrl(dto.targetUrl);
    const exitNodeId = await resolveExitNode(this.prisma, userId, dto.exitNodeId);
    const upstreamTunnelId = await this.resolveUpstreamTunnelId(
      userId,
      dto.upstreamTunnelId,
    );
    const countryCodes =
      dto.countryCodes !== undefined
        ? await this.resolveCountries(userId, dto.countryCodes)
        : await this.resolveCountries(
            userId,
            dto.countryCode
              ? [dto.countryCode]
              : dto.countryCode === null
                ? null
                : undefined,
          );

    const inferredMode: ForwarderRoutingMode = dto.routingMode
      ? this.normalizeRoutingMode(dto.routingMode)
      : upstreamTunnelId
        ? 'tunnel'
        : countryCodes && countryCodes.length > 0
          ? 'country'
          : 'auto';

    if (inferredMode === 'tunnel' && !upstreamTunnelId && !exitNodeId) {
      throw new BadRequestException(
        'upstreamTunnelId or exitNodeId is required when routingMode is tunnel',
      );
    }

    const projectId =
      dto.projectId === undefined
        ? await this.defaultProjectId(userId)
        : await this.resolveProjectId(userId, dto.projectId);

    // Collision-avoidance loop: generate slug, retry if unique-conflict (should never happen with 20 chars)
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = randomSlug(20);
      try {
        return await this.prisma.forwarder.create({
          data: {
            userId,
            projectId,
            exitNodeId: inferredMode === 'direct' ? null : exitNodeId,
            upstreamTunnelId:
              inferredMode === 'direct' ? null : (upstreamTunnelId ?? null),
            routingMode: inferredMode,
            streamingEnabled: dto.streamingEnabled ?? true,
            slug,
            label: dto.label,
            targetUrl: dto.targetUrl,
            preservePath: dto.preservePath ?? true,
            preserveQuery: dto.preserveQuery ?? true,
            forwardAuthHeader: dto.forwardAuthHeader ?? true,
            countryCode:
              inferredMode === 'direct' ? null : (countryCodes?.[0] ?? null),
            countryCodes:
              inferredMode === 'direct' ? [] : (countryCodes ?? []),
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

    const exitNodeId = await resolveExitNode(this.prisma, userId, dto.exitNodeId);
    const upstreamTunnelId = await this.resolveUpstreamTunnelId(
      userId,
      dto.upstreamTunnelId,
    );
    if (dto.targetUrl !== undefined) this.validateTargetUrl(dto.targetUrl);
    if (dto.label !== undefined && (dto.label.length === 0 || dto.label.length > 80)) {
      throw new BadRequestException('label must be 1-80 chars');
    }
    const countryCodes =
      dto.countryCodes !== undefined
        ? await this.resolveCountries(userId, dto.countryCodes)
        : dto.countryCode !== undefined
          ? await this.resolveCountries(
              userId,
              dto.countryCode ? [dto.countryCode] : null,
            )
          : undefined;

    const routingMode =
      dto.routingMode !== undefined
        ? this.normalizeRoutingMode(dto.routingMode)
        : undefined;

    const projectId =
      dto.projectId === undefined
        ? undefined
        : await this.resolveProjectId(userId, dto.projectId);

    return this.prisma.forwarder.update({
      where: { id },
      data: {
        exitNodeId: routingMode === 'direct' ? null : exitNodeId,
        upstreamTunnelId:
          routingMode === 'direct' ? null : upstreamTunnelId,
        routingMode,
        streamingEnabled: dto.streamingEnabled,
        label: dto.label,
        targetUrl: dto.targetUrl,
        preservePath: dto.preservePath,
        preserveQuery: dto.preserveQuery,
        forwardAuthHeader: dto.forwardAuthHeader,
        countryCode:
          routingMode === 'direct'
            ? null
            : countryCodes === undefined
              ? undefined
              : countryCodes[0] ?? null,
        countryCodes: routingMode === 'direct' ? [] : countryCodes,
        projectId,
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
