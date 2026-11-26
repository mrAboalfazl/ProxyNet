export interface WireguardJunkConfig {
  jc?: number;
  jmin?: number;
  jmax?: number;
  s1?: number;
  s2?: number;
  h1?: number;
  h2?: number;
  h3?: number;
  h4?: number;
  i1?: string;
  i2?: string;
  i3?: string;
  i4?: string;
  i5?: string;
}

export interface ParsedWireguardConfig {
  privateKey: string;
  publicKey: string;
  presharedKey?: string;
  endpoint: string;
  addresses: string[];
  dns: string[];
  mtu: number;
  persistentKeepalive: number;
  junk?: WireguardJunkConfig;
}

export interface ParsedProxyConfig {
  scheme: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export type UpstreamConfigPayload =
  | {
      type: 'wireguard' | 'amneziawg';
      wg: ParsedWireguardConfig;
    }
  | {
      type: 'socks5' | 'http';
      proxy: ParsedProxyConfig;
    };

export interface AiCheckStatus {
  openai?: boolean;
  openrouter?: boolean;
  opencode?: boolean;
}

export interface SelectedUpstreamCandidate {
  tunnelId: number;
  label: string;
  protocol: string;
  countryCode: string;
  hostNodeId: number | null;
  proxyHost: string;
  proxyPort: number;
  proxySecret: string;
  isLocal: boolean;
}
