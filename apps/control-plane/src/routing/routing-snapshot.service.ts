import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

export interface SnapshotNode {
  id: string;
  countryCode: string;
  label: string;
  roles: string[];
  status: string;
  weight: number;
  endpoints: Array<{
    id: string;
    transportType: string;
    ipAddress: string;
    port: number;
    domain: string | null;
    publicKey: string | null;
    reachabilityScore: number;
  }>;
}

export interface ConfigSnapshot {
  version: string;
  nodes: SnapshotNode[];
  policies: Array<{
    id: string;
    name: string;
    scope: string;
    action: string;
    priority: number;
    targetCountry: string | null;
    targetNodeId: string | null;
    appliesToUserId: string | null;
    appliesToPlanId: string | null;
  }>;
  compiledAt: string;
}

const SNAPSHOT_REDIS_KEY = 'routing:snapshot:current';
const SNAPSHOT_TTL_SECONDS = 3600;
const SNAPSHOT_PUBSUB_CHANNEL = 'routing:snapshot:updated';

@Injectable()
export class RoutingSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async compileSnapshot(): Promise<ConfigSnapshot> {
    const [nodes, policies, lastVersion] = await Promise.all([
      this.prisma.node.findMany({
        where: {
          status: { in: ['healthy', 'degraded', 'active'] },
          // A disabled country must never remain routable through a stale
          // snapshot. Manual preferences are validated separately, but this
          // protects automatic routing and already-saved preferences too.
          country: { enabled: true },
        },
        include: {
          edgeEndpoints: {
            where: { status: 'active' },
          },
        },
      }),
      this.prisma.policy.findMany({
        where: { enabled: true },
        orderBy: { priority: 'desc' },
      }),
      this.prisma.configVersion.findFirst({
        orderBy: { version: 'desc' },
      }),
    ]);

    const nextVersion = ((lastVersion?.version ?? 0n) + 1n).toString();

    const snapshot: ConfigSnapshot = {
      version: nextVersion,
      nodes: nodes.map(
        (node): SnapshotNode => ({
          id: node.id.toString(),
          countryCode: node.countryCode,
          label: node.label,
          roles: node.roles,
          status: node.status,
          weight: node.status === 'healthy' ? 1.0 : 0.5,
          endpoints: node.edgeEndpoints.map((ep) => ({
            id: ep.id.toString(),
            transportType: ep.transportType,
            ipAddress: ep.ipAddress,
            port: ep.port,
            domain: ep.domain ?? null,
            publicKey: ep.publicKey ?? null,
            reachabilityScore: Number(ep.reachabilityScore),
          })),
        }),
      ),
      policies: policies.map((policy) => ({
        id: policy.id.toString(),
        name: policy.name,
        scope: policy.scope,
        action: policy.action,
        priority: policy.priority,
        targetCountry: policy.targetCountry ?? null,
        targetNodeId: policy.targetNodeId?.toString() ?? null,
        appliesToUserId: policy.appliesToUserId?.toString() ?? null,
        appliesToPlanId: policy.appliesToPlanId?.toString() ?? null,
      })),
      compiledAt: new Date().toISOString(),
    };

    await this.redis.set(
      SNAPSHOT_REDIS_KEY,
      JSON.stringify(snapshot),
      'EX',
      SNAPSHOT_TTL_SECONDS,
    );

    await this.prisma.configVersion.create({
      data: { version: BigInt(nextVersion) },
    });

    await this.redis.publish(SNAPSHOT_PUBSUB_CHANNEL, nextVersion);

    return snapshot;
  }

  async getCurrentSnapshot(): Promise<ConfigSnapshot> {
    const cached = await this.redis.get(SNAPSHOT_REDIS_KEY);
    if (cached) {
      return JSON.parse(cached) as ConfigSnapshot;
    }
    return this.compileSnapshot();
  }
}
