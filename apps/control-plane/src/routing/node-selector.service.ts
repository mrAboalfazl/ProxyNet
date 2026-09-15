import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingSnapshotService } from './routing-snapshot.service';
import { decryptRelaySecret } from '../nodes/relay-secret.crypto';

export interface SelectedNode {
  id: number;
  countryCode: string;
  label: string;
  host: string;      // ipv4 or ipv6 address to reach the node's relay
  relayPort: number; // convention: 9443
  relaySecret: string;
  isLocal: boolean;  // true if this is the control-plane's own host — skip the network hop
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
   * Pick an active/healthy node to route a user's outbound request through.
   * Returns null when the user's mode is 'local' or when nothing is available;
   * caller should then fall back to fetching from the control-plane itself.
   */
  async selectForUser(userId: bigint): Promise<SelectedNode | null> {
    const pref = await this.prisma.userRoutingPreference.findUnique({
      where: { userId },
    });

    const mode = pref?.routingMode ?? 'auto';
    const preferredCountry = pref?.preferredCountry ?? null;

    if (mode === 'local') return null;

    const snap = await this.snapshot.getCurrentSnapshot();
    let candidates = snap.nodes.filter(
      (n) => n.status === 'healthy' || n.status === 'active',
    );

    if (mode === 'country' && preferredCountry) {
      candidates = candidates.filter((n) => n.countryCode === preferredCountry);
    }

    if (!candidates.length) {
      this.logger.debug(`no candidates for user=${userId} mode=${mode} country=${preferredCountry ?? '-'}`);
      return null;
    }

    // Round-robin. The snapshot ordering is stable per version.
    const pick = candidates[this.rrCursor % candidates.length];
    this.rrCursor = (this.rrCursor + 1) % Number.MAX_SAFE_INTEGER;

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
    // Only skip the network hop when the node's public IP matches the control-plane's
    // public IP. 127.0.0.1 goes via the relay too — it just happens to be the loopback,
    // which is the honest behaviour for a co-located dev node.
    const isLocal = !!controlPlaneHost && host === controlPlaneHost;

    if (!node.relaySecretEncrypted) {
      this.logger.warn(`selected node ${pick.id} has not registered a relay credential`);
      return null;
    }

    let relaySecret: string;
    try {
      relaySecret = decryptRelaySecret(node.relaySecretEncrypted);
    } catch {
      this.logger.error(`selected node ${pick.id} has an unreadable relay credential`);
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
