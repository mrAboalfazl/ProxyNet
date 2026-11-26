import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { createHash } from 'crypto';
import { UpstreamProtocol, UpstreamStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptRelaySecret,
  encryptRelaySecret,
} from '../nodes/relay-secret.crypto';
import { planCountryWhere } from '../nodes/node-access';
import { parseProxyUrl, parseWireguardConf } from './upstreams.parser';
import {
  AiCheckStatus,
  SelectedUpstreamCandidate,
  UpstreamConfigPayload,
  WireguardJunkConfig,
} from './upstreams.types';

export interface CreateUpstreamDto {
  label: string;
  protocol: 'wireguard' | 'amneziawg' | 'socks5' | 'http';
  hostNodeId?: string | number | null;
  countryCode: string;
  rawConfig: string;
  junk?: WireguardJunkConfig | null;
  mtu?: number | null;
  priority?: number;
  enabled?: boolean;
}

export interface UpdateUpstreamDto {
  label?: string;
  protocol?: 'wireguard' | 'amneziawg' | 'socks5' | 'http';
  hostNodeId?: string | number | null;
  countryCode?: string;
  rawConfig?: string;
  junk?: WireguardJunkConfig | null;
  mtu?: number | null;
  priority?: number;
  enabled?: boolean;
}

export interface NodeUpstreamSyncItem {
  id: string;
  label: string;
  protocol: UpstreamProtocol;
  countryCode: string;
  priority: number;
  configHash: string;
  config: UpstreamConfigPayload;
}

export interface UpstreamHealthReport {
  tunnelId: string;
  status: UpstreamStatus;
  exitIp?: string | null;
  latencyMs?: number | null;
  aiCheckStatus?: AiCheckStatus | null;
  lastError?: string | null;
}

@Injectable()
export class UpstreamsService {
  private readonly logger = new Logger(UpstreamsService.name);
  private readonly failedUntil = new Map<number, number>();
  private readonly failureCooldownMs = 45_000;
  private rrCursor = 0;

  constructor(private readonly prisma: PrismaService) {}

  markFailed(tunnelId: number): void {
    this.failedUntil.set(tunnelId, Date.now() + this.failureCooldownMs);
  }

  private isCoolingDown(tunnelId: number): boolean {
    return (this.failedUntil.get(tunnelId) ?? 0) > Date.now();
  }

  private sanitizeUpstream<
    T extends { configEncrypted?: string; [key: string]: unknown },
  >(row: T) {
    const { configEncrypted: _secret, ...rest } = row;
    return rest;
  }

  private buildEncryptedConfig(
    protocol: 'wireguard' | 'amneziawg' | 'socks5' | 'http',
    rawConfig: string,
    junk?: WireguardJunkConfig | null,
    mtu?: number | null,
  ): {
    configEncrypted: string;
    endpointPreview: string;
    hasJunkObfuscation: boolean;
    mtu: number | null;
  } {
    if (protocol === 'wireguard' || protocol === 'amneziawg') {
      const parsed = parseWireguardConf(rawConfig, {
        protocol,
        junkOverride: junk,
        mtuOverride: mtu,
      });
      const payload: UpstreamConfigPayload = {
        type: protocol,
        wg: parsed.config,
      };
      return {
        configEncrypted: encryptRelaySecret(JSON.stringify(payload)),
        endpointPreview: parsed.endpointPreview,
        hasJunkObfuscation: parsed.hasJunkObfuscation,
        mtu: parsed.mtu,
      };
    }

    const parsed = parseProxyUrl(rawConfig, protocol);
    const payload: UpstreamConfigPayload = {
      type: parsed.config.scheme,
      proxy: parsed.config,
    };
    return {
      configEncrypted: encryptRelaySecret(JSON.stringify(payload)),
      endpointPreview: parsed.endpointPreview,
      hasJunkObfuscation: false,
      mtu: null,
    };
  }

  async listAll() {
    const rows = await this.prisma.upstreamTunnel.findMany({
      include: {
        country: { select: { code: true, name: true } },
        hostNode: {
          select: {
            id: true,
            label: true,
            countryCode: true,
            ipv4Address: true,
            status: true,
            tunnelProxyPort: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { id: 'desc' }],
    });
    return rows.map((r) => this.sanitizeUpstream(r));
  }

  async listAvailableForUser(userId: bigint) {
    const countryAccess = await planCountryWhere(this.prisma, userId);
    const allowedCountries =
      countryAccess.countryCode &&
      typeof countryAccess.countryCode === 'object' &&
      'in' in countryAccess.countryCode
        ? (countryAccess.countryCode.in as string[])
        : null;

    const rows = await this.prisma.upstreamTunnel.findMany({
      where: {
        enabled: true,
        status: { in: ['healthy', 'degraded', 'pending'] },
        country: { enabled: true },
        ...(allowedCountries ? { countryCode: { in: allowedCountries } } : {}),
      },
      select: {
        id: true,
        label: true,
        protocol: true,
        countryCode: true,
        country: { select: { code: true, name: true } },
        hasJunkObfuscation: true,
        status: true,
        latencyMs: true,
        aiCheckStatus: true,
        priority: true,
      },
      orderBy: [{ priority: 'asc' }, { latencyMs: 'asc' }],
    });
    return rows;
  }

  async create(dto: CreateUpstreamDto) {
    const label = (dto.label ?? '').trim();
    if (!label || label.length > 80) {
      throw new BadRequestException('label is required (1-80 characters)');
    }
    const protocol = dto.protocol;
    if (!['wireguard', 'amneziawg', 'socks5', 'http'].includes(protocol)) {
      throw new BadRequestException('Invalid protocol');
    }

    const countryCode = (dto.countryCode ?? '').trim().toUpperCase();
    const country = await this.prisma.country.findUnique({
      where: { code: countryCode },
    });
    if (!country) {
      throw new BadRequestException(`Unknown country code: ${countryCode}`);
    }

    let hostNodeId: bigint | null = null;
    if (
      dto.hostNodeId !== undefined &&
      dto.hostNodeId !== null &&
      dto.hostNodeId !== ''
    ) {
      hostNodeId = BigInt(dto.hostNodeId);
      const node = await this.prisma.node.findUnique({
        where: { id: hostNodeId },
      });
      if (!node) {
        throw new BadRequestException('Selected host node not found');
      }
    }

    const built = this.buildEncryptedConfig(
      protocol,
      dto.rawConfig,
      dto.junk,
      dto.mtu,
    );

    const created = await this.prisma.upstreamTunnel.create({
      data: {
        label,
        protocol,
        hostNodeId,
        countryCode,
        configEncrypted: built.configEncrypted,
        endpointPreview: built.endpointPreview,
        hasJunkObfuscation: built.hasJunkObfuscation,
        mtu: built.mtu,
        priority: dto.priority ?? 100,
        enabled: dto.enabled ?? true,
        status: dto.enabled === false ? 'disabled' : 'pending',
      },
      include: {
        country: { select: { code: true, name: true } },
        hostNode: {
          select: {
            id: true,
            label: true,
            countryCode: true,
            ipv4Address: true,
            status: true,
          },
        },
      },
    });

    return this.sanitizeUpstream(created);
  }

  async update(id: bigint, dto: UpdateUpstreamDto) {
    const existing = await this.prisma.upstreamTunnel.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Upstream tunnel not found');
    }

    const protocol = (dto.protocol ?? existing.protocol) as
      | 'wireguard'
      | 'amneziawg'
      | 'socks5'
      | 'http';

    let configUpdates: {
      configEncrypted?: string;
      endpointPreview?: string;
      hasJunkObfuscation?: boolean;
      mtu?: number | null;
    } = {};

    if (dto.rawConfig && dto.rawConfig.trim().length > 0) {
      configUpdates = this.buildEncryptedConfig(
        protocol,
        dto.rawConfig,
        dto.junk,
        dto.mtu,
      );
    } else if (
      (dto.junk !== undefined ||
        dto.mtu !== undefined ||
        dto.protocol !== undefined) &&
      (protocol === 'wireguard' || protocol === 'amneziawg')
    ) {
      // Update junk/mtu/protocol on existing decrypted WG config without needing rawConfig re-upload
      const currentPayload = JSON.parse(
        decryptRelaySecret(existing.configEncrypted),
      ) as UpstreamConfigPayload;
      if (currentPayload.type === 'wireguard' || currentPayload.type === 'amneziawg') {
        const wg = { ...currentPayload.wg };
        if (dto.mtu !== undefined && dto.mtu !== null) {
          if (dto.mtu < 1280 || dto.mtu > 1420) {
            throw new BadRequestException('MTU must be between 1280 and 1420');
          }
          wg.mtu = dto.mtu;
        }
        if (dto.junk === null) {
          delete wg.junk;
        } else if (dto.junk !== undefined) {
          const jc = dto.junk.jc ?? wg.junk?.jc ?? 0;
          const jmin = jc > 0 ? (dto.junk.jmin ?? wg.junk?.jmin ?? 50) : 0;
          const jmax =
            jc > 0
              ? (dto.junk.jmax ?? wg.junk?.jmax ?? Math.min(1000, wg.mtu - 80))
              : 0;
          if (jc > 0 && (jmin > jmax || jmax >= wg.mtu)) {
            throw new BadRequestException(
              `Invalid Jmin/Jmax range for MTU ${wg.mtu}`,
            );
          }
          wg.junk =
            protocol === 'wireguard'
              ? {
                  ...wg.junk,
                  ...dto.junk,
                  jc,
                  jmin,
                  jmax,
                  s1: 0,
                  s2: 0,
                  h1: 1,
                  h2: 2,
                  h3: 3,
                  h4: 4,
                }
              : {
                  ...wg.junk,
                  ...dto.junk,
                  jc,
                  jmin,
                  jmax,
                };
        }
        const nextPayload: UpstreamConfigPayload = { type: protocol, wg };
        configUpdates = {
          configEncrypted: encryptRelaySecret(JSON.stringify(nextPayload)),
          hasJunkObfuscation: Boolean(
            wg.junk &&
              ((wg.junk.jc ?? 0) > 0 ||
                (wg.junk.s1 ?? 0) > 0 ||
                (wg.junk.s2 ?? 0) > 0 ||
                wg.junk.i1),
          ),
          mtu: wg.mtu,
        };
      }
    }

    let countryCode: string | undefined;
    if (dto.countryCode !== undefined) {
      countryCode = dto.countryCode.trim().toUpperCase();
      const country = await this.prisma.country.findUnique({
        where: { code: countryCode },
      });
      if (!country) {
        throw new BadRequestException(`Unknown country code: ${countryCode}`);
      }
    }

    let hostNodeId: bigint | null | undefined;
    if (dto.hostNodeId !== undefined) {
      if (dto.hostNodeId === null || dto.hostNodeId === '') {
        hostNodeId = null;
      } else {
        hostNodeId = BigInt(dto.hostNodeId);
        const node = await this.prisma.node.findUnique({
          where: { id: hostNodeId },
        });
        if (!node) {
          throw new BadRequestException('Selected host node not found');
        }
      }
    }

    const updated = await this.prisma.upstreamTunnel.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.protocol !== undefined ? { protocol } : {}),
        ...(hostNodeId !== undefined ? { hostNodeId } : {}),
        ...(countryCode !== undefined ? { countryCode } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.enabled !== undefined
          ? {
              enabled: dto.enabled,
              status: dto.enabled ? 'pending' : 'disabled',
            }
          : {}),
        ...configUpdates,
      },
      include: {
        country: { select: { code: true, name: true } },
        hostNode: {
          select: {
            id: true,
            label: true,
            countryCode: true,
            ipv4Address: true,
            status: true,
          },
        },
      },
    });

    return this.sanitizeUpstream(updated);
  }

  async remove(id: bigint): Promise<void> {
    const existing = await this.prisma.upstreamTunnel.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Upstream tunnel not found');
    }
    await this.prisma.upstreamTunnel.delete({ where: { id } });
  }

  /**
   * Called by a host node's Go platform-agent to fetch all active upstream tunnels
   * assigned to it. Decrypted only for the authenticated host node.
   */
  async getSyncPayloadForNode(nodeId: bigint): Promise<{
    nodeId: string;
    version: string;
    tunnels: NodeUpstreamSyncItem[];
  }> {
    const rows = await this.prisma.upstreamTunnel.findMany({
      where: { hostNodeId: nodeId, enabled: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });

    const tunnels: NodeUpstreamSyncItem[] = [];
    for (const row of rows) {
      try {
        const plain = decryptRelaySecret(row.configEncrypted);
        const config = JSON.parse(plain) as UpstreamConfigPayload;
        const configHash = createHash('sha256')
          .update(`${row.protocol}:${plain}`)
          .digest('hex')
          .slice(0, 16);
        tunnels.push({
          id: row.id.toString(),
          label: row.label,
          protocol: row.protocol,
          countryCode: row.countryCode,
          priority: row.priority,
          configHash,
          config,
        });
      } catch (err) {
        this.logger.error(
          `Failed to decrypt upstream tunnel ${row.id}: ${(err as Error).message}`,
        );
      }
    }

    const version = createHash('sha256')
      .update(
        tunnels.map((t) => `${t.id}:${t.configHash}:${t.priority}`).join('|'),
      )
      .digest('hex')
      .slice(0, 16);

    return {
      nodeId: nodeId.toString(),
      version,
      tunnels,
    };
  }

  /**
   * Receives health-check reports from a host node's Go platform-agent.
   */
  async recordHealthReports(
    nodeId: bigint,
    reports: UpstreamHealthReport[],
  ): Promise<{ updated: number }> {
    let updated = 0;
    for (const report of reports) {
      if (!report.tunnelId || !/^\d+$/.test(report.tunnelId)) continue;
      const tunnelId = BigInt(report.tunnelId);
      const validStatuses: UpstreamStatus[] = [
        'pending',
        'healthy',
        'degraded',
        'unhealthy',
        'disabled',
      ];
      if (!validStatuses.includes(report.status)) continue;

      const result = await this.prisma.upstreamTunnel.updateMany({
        where: { id: tunnelId, hostNodeId: nodeId },
        data: {
          status: report.status,
          exitIp: report.exitIp ?? undefined,
          latencyMs: report.latencyMs ?? undefined,
          aiCheckStatus: (report.aiCheckStatus ?? undefined) as never,
          lastError: report.lastError ?? null,
          lastCheckedAt: new Date(),
        },
      });
      updated += result.count;
    }
    return { updated };
  }

  /**
   * Resolves the streaming engine endpoint for a given host node (or local fallback).
   */
  private resolveEngineTarget(hostNode: {
    id: bigint;
    ipv4Address: string | null;
    ipv6Address: string | null;
    relaySecretEncrypted: string | null;
    tunnelProxyPort: number;
  } | null): {
    host: string;
    port: number;
    secret: string;
    isLocal: boolean;
  } | null {
    if (!hostNode) {
      const localHost = process.env.LOCAL_TUNNEL_PROXY_HOST || '127.0.0.1';
      const localPort = parseInt(
        process.env.LOCAL_TUNNEL_PROXY_PORT || '9444',
        10,
      );
      const localSecret = process.env.LOCAL_TUNNEL_PROXY_SECRET || '';
      if (!localSecret) return null;
      return { host: localHost, port: localPort, secret: localSecret, isLocal: true };
    }

    if (!hostNode.relaySecretEncrypted) return null;
    const rawHost = hostNode.ipv4Address || hostNode.ipv6Address;
    if (!rawHost) return null;

    let secret: string;
    try {
      secret = decryptRelaySecret(hostNode.relaySecretEncrypted);
    } catch {
      return null;
    }

    const controlPlanePublicIp = process.env.CONTROL_PLANE_PUBLIC_IP ?? '';
    const isLocal =
      Boolean(controlPlanePublicIp && rawHost === controlPlanePublicIp) ||
      rawHost === '127.0.0.1' ||
      rawHost === '::1';

    return {
      host: isLocal ? '127.0.0.1' : rawHost,
      port: hostNode.tunnelProxyPort || 9444,
      secret,
      isLocal,
    };
  }

  /**
   * Triggers an immediate on-demand probe on the host node's Go tunnel engine.
   */
  async testUpstream(id: bigint) {
    const tunnel = await this.prisma.upstreamTunnel.findUnique({
      where: { id },
      include: {
        hostNode: {
          select: {
            id: true,
            ipv4Address: true,
            ipv6Address: true,
            relaySecretEncrypted: true,
            tunnelProxyPort: true,
            label: true,
          },
        },
      },
    });
    if (!tunnel) throw new NotFoundException('Upstream tunnel not found');

    const engine = this.resolveEngineTarget(tunnel.hostNode);
    if (!engine) {
      throw new BadRequestException(
        'Host node is not enrolled or has no reachable tunnel engine address',
      );
    }

    const plain = decryptRelaySecret(tunnel.configEncrypted);
    const config = JSON.parse(plain) as UpstreamConfigPayload;
    const configHash = createHash('sha256')
      .update(`${tunnel.protocol}:${plain}`)
      .digest('hex')
      .slice(0, 16);

    const payload = Buffer.from(
      JSON.stringify({
        tunnelId: tunnel.id.toString(),
        protocol: tunnel.protocol,
        configHash,
        config,
      }),
      'utf8',
    );

    const probeResult = await new Promise<{
      ok: boolean;
      exitIp?: string;
      latencyMs?: number;
      aiCheckStatus?: AiCheckStatus;
      error?: string;
    }>((resolve) => {
      const useHttps = process.env.TUNNEL_PROXY_TLS === 'true' && !engine.isLocal;
      const lib = useHttps ? https : http;
      const req = lib.request(
        {
          hostname: engine.host,
          port: engine.port,
          path: `/probe/${tunnel.id.toString()}`,
          method: 'POST',
          timeout: 25_000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(payload.length),
            'X-Node-Secret': engine.secret,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            try {
              const parsed = JSON.parse(raw);
              resolve(parsed);
            } catch {
              resolve({
                ok: false,
                error: `Engine returned HTTP ${res.statusCode}: ${raw.slice(0, 180)}`,
              });
            }
          });
        },
      );
      req.on('error', (err) =>
        resolve({ ok: false, error: `Engine unreachable: ${err.message}` }),
      );
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Probe timed out after 25s' });
      });
      req.write(payload);
      req.end();
    });

    const nextStatus: UpstreamStatus = !tunnel.enabled
      ? 'disabled'
      : probeResult.ok
        ? 'healthy'
        : 'unhealthy';

    const updated = await this.prisma.upstreamTunnel.update({
      where: { id },
      data: {
        status: nextStatus,
        exitIp: probeResult.exitIp ?? tunnel.exitIp,
        latencyMs: probeResult.latencyMs ?? null,
        aiCheckStatus: (probeResult.aiCheckStatus ?? undefined) as never,
        lastError: probeResult.ok ? null : (probeResult.error ?? 'Probe failed'),
        lastCheckedAt: new Date(),
      },
    });

    return {
      ok: probeResult.ok,
      status: updated.status,
      exitIp: updated.exitIp,
      latencyMs: updated.latencyMs,
      aiCheckStatus: updated.aiCheckStatus,
      error: updated.lastError,
    };
  }

  /**
   * Selects ordered upstream tunnel candidates for a streaming forwarder call.
   * Honors pinned tunnel, ordered country failover, plan country limits, priority,
   * health status, cooldowns, and round-robin distribution.
   */
  async selectCandidatesForUser(
    userId: bigint,
    options: {
      tunnelId?: bigint | null;
      countries?: string[] | null;
      limit?: number;
    } = {},
  ): Promise<SelectedUpstreamCandidate[]> {
    const countryAccess = await planCountryWhere(this.prisma, userId);
    const allowedCountries =
      countryAccess.countryCode &&
      typeof countryAccess.countryCode === 'object' &&
      'in' in countryAccess.countryCode
        ? (countryAccess.countryCode.in as string[])
        : null;

    const requestedCountries = (options.countries ?? [])
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));

    const rows = await this.prisma.upstreamTunnel.findMany({
      where: {
        enabled: true,
        status: {
          in: options.tunnelId
            ? ['healthy', 'degraded', 'pending']
            : ['healthy', 'degraded'],
        },
        country: { enabled: true },
        ...(options.tunnelId ? { id: options.tunnelId } : {}),
        ...(requestedCountries.length > 0 && !options.tunnelId
          ? { countryCode: { in: requestedCountries } }
          : {}),
        ...(allowedCountries ? { countryCode: { in: allowedCountries } } : {}),
      },
      include: {
        hostNode: {
          select: {
            id: true,
            ipv4Address: true,
            ipv6Address: true,
            relaySecretEncrypted: true,
            tunnelProxyPort: true,
            status: true,
            userPaused: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { latencyMs: 'asc' }, { id: 'asc' }],
    });

    const usable: Array<{
      row: (typeof rows)[number];
      engine: NonNullable<ReturnType<UpstreamsService['resolveEngineTarget']>>;
    }> = [];

    for (const row of rows) {
      if (
        row.hostNode &&
        (row.hostNode.userPaused ||
          !['active', 'healthy', 'degraded'].includes(row.hostNode.status))
      ) {
        continue;
      }
      const engine = this.resolveEngineTarget(row.hostNode);
      if (!engine) continue;
      usable.push({ row, engine });
    }

    if (!usable.length) return [];

    // Prefer non-cooling-down healthy tunnels first
    const statusWeight = (s: UpstreamStatus) =>
      s === 'healthy' ? 0 : s === 'pending' ? 1 : 2;
    const countryOrder = new Map(requestedCountries.map((c, idx) => [c, idx]));

    usable.sort((a, b) => {
      const coolDiff =
        Number(this.isCoolingDown(Number(a.row.id))) -
        Number(this.isCoolingDown(Number(b.row.id)));
      if (coolDiff !== 0) return coolDiff;

      if (countryOrder.size > 0) {
        const cDiff =
          (countryOrder.get(a.row.countryCode) ?? 999) -
          (countryOrder.get(b.row.countryCode) ?? 999);
        if (cDiff !== 0) return cDiff;
      }

      const sDiff = statusWeight(a.row.status) - statusWeight(b.row.status);
      if (sDiff !== 0) return sDiff;

      return a.row.priority - b.row.priority;
    });

    // Apply gentle round-robin within the top tier when not pinned to a single tunnel
    let ordered = usable;
    if (!options.tunnelId && usable.length > 1 && countryOrder.size === 0) {
      const topStatus = usable[0].row.status;
      const topPriority = usable[0].row.priority;
      const topTierCount = usable.findIndex(
        (u) => u.row.status !== topStatus || u.row.priority !== topPriority,
      );
      const splitAt = topTierCount === -1 ? usable.length : topTierCount;
      if (splitAt > 1) {
        const shift = this.rrCursor % splitAt;
        this.rrCursor = (this.rrCursor + 1) % Number.MAX_SAFE_INTEGER;
        const topTier = usable.slice(0, splitAt);
        ordered = topTier
          .slice(shift)
          .concat(topTier.slice(0, shift))
          .concat(usable.slice(splitAt));
      }
    }

    const limit = Math.max(1, Math.min(options.limit ?? 3, 5));
    return ordered.slice(0, limit).map(({ row, engine }) => ({
      tunnelId: Number(row.id),
      label: row.label,
      protocol: row.protocol,
      countryCode: row.countryCode,
      hostNodeId: row.hostNodeId ? Number(row.hostNodeId) : null,
      proxyHost: engine.host,
      proxyPort: engine.port,
      proxySecret: engine.secret,
      isLocal: engine.isLocal,
    }));
  }

  /** Non-blocking byte counter update after a streamed call completes. */
  async recordUsage(
    tunnelId: number,
    bytesIn: number,
    bytesOut: number,
  ): Promise<void> {
    try {
      await this.prisma.upstreamTunnel.update({
        where: { id: BigInt(tunnelId) },
        data: {
          requestCount: { increment: 1 },
          bytesIn: { increment: BigInt(Math.max(0, bytesIn)) },
          bytesOut: { increment: BigInt(Math.max(0, bytesOut)) },
        },
      });
    } catch {
      // ignore metering errors
    }
  }
}
