import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingSnapshotService } from './routing-snapshot.service';
import { decryptRelaySecret } from '../nodes/relay-secret.crypto';

export interface SelectedNode {
  id: number;
  countryCode: string;
  label: string;
  host: string; // ipv4 or ipv6 address to reach the node's relay
  relayPort: number; // convention: 9443
  relaySecret: string;
  isLocal: boolean; // true if this is the control-plane's own host — skip the network hop
}

export interface RoutingPreference {
  mode: 'auto' | 'country' | 'local';
  preferredCountry: string | null;
}

@Injectable()
export class NodeSelectorService {
  private readonly logger = new Logger(NodeSelectorService.name);
  private rrCursor = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshot: RoutingSnapshotService,
  ) {}

  /**
   * Read the normalized routing preference used by both the selector and
   * callers that need to distinguish an explicit country from auto mode.
   */
  async getPreference(userId: bigint): Promise<RoutingPreference> {
    const pref = await this.prisma.userRoutingPreference.findUnique({
      where: { userId },
    });

    const mode =
      pref?.routingMode === 'country' || pref?.routingMode === 'local'
        ? pref.routingMode
        : 'auto';
    const preferredCountry =
      pref?.preferredCountry?.trim().toUpperCase() || null;

    return { mode, preferredCountry };
  }

  /**
   * Return an ordered list of usable exit nodes for automatic routing/failover.
   * Round-robin is applied to the candidate list so consecutive requests spread
   * across nodes instead of always hammering the first one.
   */
  async selectCandidatesForUser(
    userId: bigint,
    options: { country?: string | null; limit?: number; excludeIds?: number[] } = {},
  ): Promise<SelectedNode[]> {
    const pref = await this.getPreference(userId);
    const override = options.country?.trim().toUpperCase() || null;
    const mode = override ? 'country' : pref.mode;
    const preferredCountry = override ?? pref.preferredCountry;

    if (mode === 'local') return [];

    const snap = await this.snapshot.getCurrentSnapshot();
    const exclude = new Set(options.excludeIds ?? []);
    let candidates = snap.nodes.filter(
      (n) =>
        (n.status === 'healthy' || n.status === 'active') &&
        !exclude.has(Number(n.id)),
    );

    if (mode === 'country' && preferredCountry) {
      candidates = candidates.filter((n) => n.countryCode === preferredCountry);
    }

    if (!candidates.length) {
      this.logger.debug(
        `no candidates for user=${userId} mode=${mode} country=${preferredCountry ?? '-'}`,
      );
      return [];
    }

    const limit = Math.max(1, Math.min(options.limit ?? 1, 10));
    const start = this.rrCursor % candidates.length;
    const ordered = candidates.slice(start).concat(candidates.slice(0, start));
    this.rrCursor = (this.rrCursor + 1) % Number.MAX_SAFE_INTEGER;

    const selected: SelectedNode[] = [];
    for (const pick of ordered) {
      if (selected.length >= limit) break;
      const node = await this.buildSelectedNode(pick);
      if (node) selected.push(node);
    }
    return selected;
  }

  async selectForUser(
    userId: bigint,
    overrideCountry?: string | null,
  ): Promise<SelectedNode | null> {
    const nodes = await this.selectCandidatesForUser(userId, {
      country: overrideCountry,
      limit: 1,
    });
    return nodes[0] ?? null;
  }

  /**
   * Lightweight, secret-free list used by the gateway status endpoint so an
   * integration can discover which nodes are currently eligible.
   */
  async listAvailableNodes(
    userId: bigint,
    country?: string | null,
  ): Promise<Array<{ id: number; countryCode: string; label: string; status: string }>> {
    const pref = await this.getPreference(userId);
    const override = country?.trim().toUpperCase() || null;
    const mode = override ? 'country' : pref.mode;
    const preferredCountry = override ?? pref.preferredCountry;

    if (mode === 'local') return [];

    const snap = await this.snapshot.getCurrentSnapshot();
    let nodes = snap.nodes.filter(
      (n) => n.status === 'healthy' || n.status === 'active',
    );
    if (mode === 'country' && preferredCountry) {
      nodes = nodes.filter((n) => n.countryCode === preferredCountry);
    }

    return nodes.map((n) => ({
      id: Number(n.id),
      countryCode: n.countryCode,
      label: n.label,
      status: n.status,
    }));
  }

  private async buildSelectedNode(pick: {
    id: string;
    countryCode: string;
    label: string;
  }): Promise<SelectedNode | null> {
    // The snapshot doesn't carry ipv4_address (that's a routing detail, not a client detail).
    // Look up the address from the DB.
    const node = await this.prisma.node.findUnique({
      where: { id: BigInt(pick.id) },
      select: {
        id: true,
        ipv4Address: true,
        ipv6Address: true,
        countryCode: true,
        label: true,
        relaySecretEncrypted: true,
      },
    });
    if (!node || (!node.ipv4Address && !node.ipv6Address)) {
      this.logger.warn(`selected node ${pick.id} has no reachable address`);
      return null;
    }

    const host = node.ipv4Address ?? node.ipv6Address!;
    const controlPlaneHost = process.env.CONTROL_PLANE_PUBLIC_IP ?? '';
    const isLocal = !!controlPlaneHost && host === controlPlaneHost;

    if (!node.relaySecretEncrypted) {
      this.logger.warn(
        `selected node ${pick.id} has not registered a relay credential`,
      );
      return null;
    }

    let relaySecret: string;
    try {
      relaySecret = decryptRelaySecret(node.relaySecretEncrypted);
    } catch {
      this.logger.error(
        `selected node ${pick.id} has an unreadable relay credential`,
      );
      return null;
    }

    return {
      id: Number(node.id),
      countryCode: node.countryCode,
      label: node.label,
      host,
      relayPort: parseInt(process.env.NODE_RELAY_PORT ?? '9443', 10),
      relaySecret,
      isLocal,
    };
  }

  /**
   * Fetch a node's shared secret (the plaintext secret is not stored — the
   * heartbeat token is. For MVP, use the token that was persisted at enrollment
   * time in the config file. In production this should be a per-node relay
   * secret rotated independently.)
   *
   * For now: read from an env-var-configured map, or return null and let the
   * caller decide to skip the hop.
   */
}
