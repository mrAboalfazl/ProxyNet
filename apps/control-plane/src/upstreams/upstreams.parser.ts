import { BadRequestException } from '@nestjs/common';
import {
  ParsedProxyConfig,
  ParsedWireguardConfig,
  WireguardJunkConfig,
} from './upstreams.types';

const DEFAULT_MTU = 1360;
const MIN_MTU = 1280;
const MAX_MTU = 1420;

function isValidWgKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const buf = Buffer.from(trimmed, 'base64');
    return buf.length === 32;
  } catch {
    return false;
  }
}

function parseIntOpt(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new BadRequestException(`Invalid integer value: ${value}`);
  }
  return num;
}

function validateEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw new BadRequestException('WireGuard Peer Endpoint is required');
  }
  // Support [ipv6]:port or host:port
  const ipv6Match = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
  if (ipv6Match) {
    const port = Number(ipv6Match[2]);
    if (port < 1 || port > 65535) {
      throw new BadRequestException('Invalid WireGuard Endpoint port');
    }
    return trimmed;
  }
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon <= 0) {
    throw new BadRequestException('WireGuard Endpoint must be in host:port format');
  }
  const host = trimmed.slice(0, lastColon).trim();
  const port = Number(trimmed.slice(lastColon + 1).trim());
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestException('Invalid WireGuard Endpoint host or port');
  }
  return `${host}:${port}`;
}

export function parseWireguardConf(
  rawConf: string,
  options: {
    protocol?: 'wireguard' | 'amneziawg';
    junkOverride?: WireguardJunkConfig | null;
    mtuOverride?: number | null;
  } = {},
): {
  config: ParsedWireguardConfig;
  endpointPreview: string;
  hasJunkObfuscation: boolean;
  mtu: number;
} {
  if (!rawConf || typeof rawConf !== 'string') {
    throw new BadRequestException('WireGuard configuration text is required');
  }

  let section = '';
  const iface: Record<string, string> = {};
  const peer: Record<string, string> = {};

  for (const rawLine of rawConf.split(/\r?\n/)) {
    const stripped = rawLine.replace(/[#;].*$/, '').trim();
    if (!stripped) continue;

    const secMatch = stripped.match(/^\[([A-Za-z0-9_-]+)\]$/);
    if (secMatch) {
      section = secMatch[1].toLowerCase();
      continue;
    }

    const eqIdx = stripped.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = stripped.slice(0, eqIdx).trim().toLowerCase();
    const val = stripped.slice(eqIdx + 1).trim();

    if (section === 'interface') {
      iface[key] = val;
    } else if (section === 'peer') {
      peer[key] = val;
    }
  }

  const privateKey = iface['privatekey'] ?? '';
  const publicKey = peer['publickey'] ?? '';
  const presharedKey = peer['presharedkey']?.trim() || undefined;

  if (!isValidWgKey(privateKey)) {
    throw new BadRequestException(
      'Invalid or missing [Interface] PrivateKey (expected 32-byte base64 WireGuard key)',
    );
  }
  if (!isValidWgKey(publicKey)) {
    throw new BadRequestException(
      'Invalid or missing [Peer] PublicKey (expected 32-byte base64 WireGuard key)',
    );
  }
  if (presharedKey && !isValidWgKey(presharedKey)) {
    throw new BadRequestException('Invalid [Peer] PresharedKey');
  }

  const endpoint = validateEndpoint(peer['endpoint'] ?? '');

  const addresses = (iface['address'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (addresses.length === 0) {
    throw new BadRequestException(
      'Missing [Interface] Address (e.g. 10.66.0.2/32)',
    );
  }

  const dns = (iface['dns'] ?? '1.1.1.1, 8.8.8.8')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const parsedMtu =
    options.mtuOverride ?? parseIntOpt(iface['mtu']) ?? DEFAULT_MTU;
  if (parsedMtu < MIN_MTU || parsedMtu > MAX_MTU) {
    throw new BadRequestException(
      `MTU must be between ${MIN_MTU} and ${MAX_MTU}`,
    );
  }

  const persistentKeepalive =
    parseIntOpt(peer['persistentkeepalive']) ?? 25;

  // Read any AWG fields present in [Interface]
  const confJunk: WireguardJunkConfig = {
    jc: parseIntOpt(iface['jc']),
    jmin: parseIntOpt(iface['jmin']),
    jmax: parseIntOpt(iface['jmax']),
    s1: parseIntOpt(iface['s1']),
    s2: parseIntOpt(iface['s2']),
    h1: parseIntOpt(iface['h1']),
    h2: parseIntOpt(iface['h2']),
    h3: parseIntOpt(iface['h3']),
    h4: parseIntOpt(iface['h4']),
    i1: iface['i1'] || undefined,
    i2: iface['i2'] || undefined,
    i3: iface['i3'] || undefined,
    i4: iface['i4'] || undefined,
    i5: iface['i5'] || undefined,
  };

  const mergedJunk: WireguardJunkConfig = {
    ...confJunk,
    ...(options.junkOverride ?? {}),
  };

  const protocol = options.protocol ?? 'wireguard';

  // CRITICAL SAFETY RULE:
  // When connecting to a standard WireGuard server, S1/S2 must stay 0 and
  // H1..H4 must stay 1,2,3,4; only client-side pre-handshake packets (Jc/Jmin/Jmax, I1..I5)
  // are safe to send without server-side AWG support.
  let finalJunk: WireguardJunkConfig | undefined;
  const hasPreHandshakeJunk =
    (mergedJunk.jc !== undefined && mergedJunk.jc > 0) ||
    Boolean(
      mergedJunk.i1 ||
        mergedJunk.i2 ||
        mergedJunk.i3 ||
        mergedJunk.i4 ||
        mergedJunk.i5,
    );
  const hasAwgHeaderTuning =
    (mergedJunk.s1 !== undefined && mergedJunk.s1 > 0) ||
    (mergedJunk.s2 !== undefined && mergedJunk.s2 > 0) ||
    (mergedJunk.h1 !== undefined && mergedJunk.h1 !== 1) ||
    (mergedJunk.h2 !== undefined && mergedJunk.h2 !== 2) ||
    (mergedJunk.h3 !== undefined && mergedJunk.h3 !== 3) ||
    (mergedJunk.h4 !== undefined && mergedJunk.h4 !== 4);

  if (hasPreHandshakeJunk || (protocol === 'amneziawg' && hasAwgHeaderTuning)) {
    const jc = mergedJunk.jc ?? 0;
    const jmin = jc > 0 ? (mergedJunk.jmin ?? 50) : 0;
    const jmax = jc > 0 ? (mergedJunk.jmax ?? Math.min(1000, parsedMtu - 80)) : 0;

    if (jc < 0 || jc > 128) {
      throw new BadRequestException('Jc must be between 0 and 128');
    }
    if (jc > 0) {
      if (jmin < 0 || jmax < 1 || jmin > jmax) {
        throw new BadRequestException('Invalid Jmin/Jmax range (need 0 <= Jmin <= Jmax)');
      }
      if (jmax >= parsedMtu) {
        throw new BadRequestException(
          `Jmax (${jmax}) must be smaller than MTU (${parsedMtu})`,
        );
      }
    }

    if (protocol === 'wireguard') {
      finalJunk = {
        jc,
        jmin,
        jmax,
        s1: 0,
        s2: 0,
        h1: 1,
        h2: 2,
        h3: 3,
        h4: 4,
        ...(mergedJunk.i1 ? { i1: mergedJunk.i1 } : {}),
        ...(mergedJunk.i2 ? { i2: mergedJunk.i2 } : {}),
        ...(mergedJunk.i3 ? { i3: mergedJunk.i3 } : {}),
        ...(mergedJunk.i4 ? { i4: mergedJunk.i4 } : {}),
        ...(mergedJunk.i5 ? { i5: mergedJunk.i5 } : {}),
      };
    } else {
      finalJunk = {
        jc,
        jmin,
        jmax,
        s1: mergedJunk.s1 ?? 0,
        s2: mergedJunk.s2 ?? 0,
        h1: mergedJunk.h1 ?? 1,
        h2: mergedJunk.h2 ?? 2,
        h3: mergedJunk.h3 ?? 3,
        h4: mergedJunk.h4 ?? 4,
        ...(mergedJunk.i1 ? { i1: mergedJunk.i1 } : {}),
        ...(mergedJunk.i2 ? { i2: mergedJunk.i2 } : {}),
        ...(mergedJunk.i3 ? { i3: mergedJunk.i3 } : {}),
        ...(mergedJunk.i4 ? { i4: mergedJunk.i4 } : {}),
        ...(mergedJunk.i5 ? { i5: mergedJunk.i5 } : {}),
      };
    }
  }

  return {
    config: {
      privateKey: privateKey.trim(),
      publicKey: publicKey.trim(),
      ...(presharedKey ? { presharedKey } : {}),
      endpoint,
      addresses,
      dns: dns.length > 0 ? dns : ['1.1.1.1', '8.8.8.8'],
      mtu: parsedMtu,
      persistentKeepalive: Math.max(0, Math.min(persistentKeepalive, 300)),
      ...(finalJunk ? { junk: finalJunk } : {}),
    },
    endpointPreview: endpoint,
    hasJunkObfuscation: Boolean(finalJunk),
    mtu: parsedMtu,
  };
}

export function parseProxyUrl(
  rawInput: string,
  defaultScheme: 'socks5' | 'http' = 'socks5',
): {
  config: ParsedProxyConfig;
  endpointPreview: string;
} {
  const trimmed = (rawInput ?? '').trim();
  if (!trimmed) {
    throw new BadRequestException('Proxy URL or host:port is required');
  }

  // Handle shorthand host:port or host:port:user:pass
  if (!trimmed.includes('://')) {
    const parts = trimmed.split(':');
    if (parts.length === 2 || parts.length === 4) {
      const host = parts[0].trim();
      const port = Number(parts[1].trim());
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new BadRequestException('Invalid proxy host:port');
      }
      const username = parts[2] !== undefined ? parts[2] : undefined;
      const password = parts[3] !== undefined ? parts[3] : undefined;
      return {
        config: {
          scheme: defaultScheme,
          host,
          port,
          ...(username ? { username } : {}),
          ...(password ? { password } : {}),
        },
        endpointPreview: `${host}:${port}`,
      };
    }
    throw new BadRequestException(
      'Proxy must be socks5://[user:pass@]host:port, http://[user:pass@]host:port, or host:port[:user:pass]',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('Invalid proxy URL');
  }

  const rawScheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  let scheme: 'socks5' | 'http';
  if (rawScheme === 'socks5' || rawScheme === 'socks5h') {
    scheme = 'socks5';
  } else if (rawScheme === 'http' || rawScheme === 'https') {
    scheme = 'http';
  } else {
    throw new BadRequestException(`Unsupported proxy scheme: ${rawScheme}`);
  }

  const host = parsed.hostname;
  const port = parsed.port
    ? Number(parsed.port)
    : scheme === 'socks5'
      ? 1080
      : 8080;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestException('Invalid proxy host or port');
  }

  const username = parsed.username
    ? decodeURIComponent(parsed.username)
    : undefined;
  const password = parsed.password
    ? decodeURIComponent(parsed.password)
    : undefined;

  return {
    config: {
      scheme,
      host,
      port,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
    },
    endpointPreview: `${host}:${port}`,
  };
}
