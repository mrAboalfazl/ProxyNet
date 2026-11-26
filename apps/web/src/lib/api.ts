const BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function getPublicApiBase(): string {
  if (process.env.NEXT_PUBLIC_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_PUBLIC_API_BASE;
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/api`;
  }
  return 'https://panel.civonex.ir/api';
}

export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_token') || '';
}

export function setToken(token: string) {
  localStorage.setItem('admin_token', token);
}

export function clearToken() {
  localStorage.removeItem('admin_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      const msg = Array.isArray(json.message)
        ? json.message.join(', ')
        : json.message || text;
      throw new Error(msg);
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) throw new Error(text);
      throw parseErr;
    }
  }

  if (res.status === 204) return undefined as T;
  // Some successful endpoints intentionally return no body (for example,
  // DELETE revoke operations). Avoid failing while parsing an empty response.
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  // Auth
  login: (identifier: string, password: string) =>
    request<{ accessToken: string }>('POST', '/auth/login', {
      identifier,
      password,
    }),

  startRegistration: (data: {
    displayName: string;
    email: string;
    phone: string;
    password: string;
  }) =>
    request<{ registrationId: string; expiresInSeconds: number }>(
      'POST',
      '/auth/registration/start',
      data,
    ),

  confirmRegistration: (registrationId: string, code: string) =>
    request<{ accessToken: string }>('POST', '/auth/registration/confirm', {
      registrationId,
      code,
    }),

  sendOtp: (identifier: string, method: string) =>
    request<{ sent: boolean }>('POST', '/auth/otp/send', {
      identifier,
      method,
    }),

  verifyOtp: (identifier: string, method: string, code: string) =>
    request<{ accessToken: string }>('POST', '/auth/otp/verify', {
      identifier,
      method,
      code,
    }),

  logout: () => request<void>('POST', '/auth/logout'),

  // Current user
  me: () =>
    request<
      User & {
        routingPreference?: {
          routingMode: string;
          preferredCountry: string | null;
        };
      }
    >('GET', '/users/me'),

  updateRoutingPreference: (routingMode: string, preferredCountry?: string) =>
    request<unknown>('PATCH', '/users/me/routing', {
      routingMode,
      preferredCountry,
    }),

  // Usage
  myUsage: () =>
    request<{
      bytesUsed: number;
      connectionsUsed: number;
      periodStart: string;
      periodEnd: string;
      subscriptionId?: string | null;
      subscriptionStatus?: string | null;
      plan?: {
        id?: string;
        name: string;
        monthlyBandwidthGb: number;
        maxConcurrentSessions?: number;
        priceToman?: string;
        allowedCountries?: string[];
      } | null;
    }>('GET', '/metering/usage/me'),
  financialReport: (
    params: Partial<{
      page: number;
      limit: number;
      usagePage: number;
      usageLimit: number;
      from: string;
      to: string;
      category: string;
    }> = {},
  ) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => [key, String(value)]),
    );
    return request<FinancialReport>(
      'GET',
      `/metering/financial/me${query.toString() ? `?${query}` : ''}`,
    );
  },

  // Proxy credentials
  myCredentials: () => request<ProxyCredential[]>('GET', '/proxy-credentials'),

  createCredential: (
    data:
      | string
      | {
          label?: string;
          projectId?: string | null;
          exitNodeId?: string | null;
          countryCode?: string | null;
          routingMode?: string;
        },
  ) =>
    request<ProxyCredential & { secret?: string }>(
      'POST',
      '/proxy-credentials',
      typeof data === 'string' ? { label: data } : data,
    ),

  updateCredential: (
    id: string,
    data: Partial<{
      label: string;
      enabled: boolean;
      projectId: string | null;
      exitNodeId: string | null;
      countryCode: string | null;
      routingMode: string;
    }>,
  ) => request<ProxyCredential>('PATCH', `/proxy-credentials/${id}`, data),

  revokeCredential: (id: string) =>
    request<void>('DELETE', `/proxy-credentials/${id}`),

  // Projects (zones) — group forwarders and credentials into one workspace
  projects: {
    list: () => request<Project[]>('GET', '/projects'),
    create: (data: { name: string; defaultMode?: string }) =>
      request<Project>('POST', '/projects', data),
    get: (id: string) =>
      request<{ project: Project; userSlug?: string; records: ProjectRecord[] }>(
        'GET',
        `/projects/${id}`,
      ),
    update: (id: string, data: Partial<{ name: string; defaultMode: string }>) =>
      request<Project>('PATCH', `/projects/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/projects/${id}`),
  },

  socks5: {
    endpoints: () =>
      request<Socks5EndpointResult>(
        'GET',
        '/proxy-credentials/socks5/endpoints',
      ),
  },

  // Dashboard
  dashboard: () =>
    request<{
      totalUsers: number;
      totalNodes: number;
      healthyNodes: number;
      activeCountries: number;
      walletBalanceToman: string;
      revenueToman: string;
      requestCount: number;
      socksBandwidthBytes: string;
    }>('GET', '/admin/dashboard'),
  adminStatistics: () => request<AdminStatistics>('GET', '/admin/statistics'),
  adminUserFinancial: (
    id: string,
    params: Partial<{
      page: number;
      limit: number;
      usagePage: number;
      usageLimit: number;
      from: string;
      to: string;
      category: string;
    }> = {},
  ) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => [key, String(value)]),
    );
    return request<FinancialReport>(
      'GET',
      `/admin/users/${id}/financial${query.toString() ? `?${query}` : ''}`,
    );
  },

  // Nodes (admin)
  nodes: {
    list: (country?: string) =>
      request<Node[]>(
        'GET',
        country ? `/admin/nodes?country=${country}` : '/admin/nodes',
      ),
    get: (id: string) => request<NodeDetails>('GET', `/admin/nodes/${id}`),
    create: (data: { countryCode: string; label: string; roles: string[] }) =>
      request<Node & { token: string; expiresAt: string }>(
        'POST',
        '/admin/nodes',
        data,
      ),
    setStatus: (id: string, status: string) =>
      request<Node>('PATCH', `/admin/nodes/${id}/status`, { status }),
    enrollmentToken: (id: string) =>
      request<{ token: string; expiresAt: string }>(
        'POST',
        `/admin/nodes/${id}/enrollment-token`,
      ),
    approve: (id: string) =>
      request<Node>('POST', `/admin/nodes/${id}/approve`, {}),
    reject: (id: string) =>
      request<Node>('POST', `/admin/nodes/${id}/reject`, {}),
    update: (id: string) =>
      request<Node>('POST', `/admin/nodes/${id}/update`, {}),
    updateAll: () =>
      request<{ requested: number }>('POST', '/admin/nodes/update-all', {}),
  },

  // Nodes (user self-service)
  myNodes: {
    list: () => request<Node[]>('GET', '/nodes/my'),
    available: () => request<AvailableNode[]>('GET', '/nodes/my/available'),
    updateSoftware: (id: string) => request<{ requested: boolean }>('POST', `/nodes/my/${id}/update`, {}),
    update: (id: string, data: { label?: string; userPaused?: boolean; sharing?: 'private' | 'request-public' }) => request<{ success: boolean }>('PATCH', `/nodes/my/${id}`, data),
    enrollmentToken: (id: string) => request<{ token: string; expiresAt: string }>('POST', `/nodes/my/${id}/enrollment-token`, {}),
    create: (data: { countryCode: string; label: string; sharing?: 'private' | 'request-public' }) =>
      request<{ node: Node; token: string; expiresAt: string }>(
        'POST',
        '/nodes/my',
        data,
      ),
  },

  // Users
  users: {
    list: (page = 1) =>
      request<{ users: User[]; total: number; page: number }>(
        'GET',
        `/admin/users?page=${page}&limit=20`,
      ),
    get: (id: string) => request<AdminUserDetails>('GET', `/admin/users/${id}`),
    getVless: (id: string) =>
      request<AdminVlessBundle>('GET', `/admin/users/${id}/vless`),
    setStatus: (id: string, status: string) =>
      request<User>('PATCH', `/admin/users/${id}/status`, { status }),
  },

  // Health check (authenticated — verifies auth + returns account status/usage/wallet)
  healthMe: () => request<HealthMeResponse>('GET', '/health/me'),

  // Wallet (user)
  wallet: {
    me: () => request<WalletMeResponse>('GET', '/wallet/me'),
    transactions: (limit = 50) =>
      request<WalletTransaction[]>(
        'GET',
        `/wallet/me/transactions?limit=${limit}`,
      ),
  },

  // Wallet + pricing (admin)
  adminWallet: {
    get: (userId: string) =>
      request<AdminWalletBundle>('GET', `/admin/users/${userId}/wallet`),
    topup: (
      userId: string,
      amountToman: number | string,
      description?: string,
    ) =>
      request<{
        wallet: { balanceToman: string; currency: string };
        transactionId: string;
      }>('POST', `/admin/users/${userId}/wallet/topup`, {
        amountToman,
        description,
      }),
    adjust: (
      userId: string,
      amountToman: number | string,
      description?: string,
    ) =>
      request<{
        wallet: { balanceToman: string; currency: string };
        transactionId: string;
      }>('POST', `/admin/users/${userId}/wallet/adjust`, {
        amountToman,
        description,
      }),
  },
  adminPricing: {
    get: () => request<PricingResponse>('GET', '/admin/pricing'),
    update: (patch: Partial<PricingResponse>) =>
      request<PricingResponse>('PATCH', '/admin/pricing', patch),
  },

  // Forwarders (user)
  forwarders: {
    list: () =>
      request<{ userSlug: string; forwarders: Forwarder[] }>(
        'GET',
        '/forwarders',
      ),
    create: (data: {
      label: string;
      targetUrl: string;
      forwardAuthHeader?: boolean;
      preservePath?: boolean;
      preserveQuery?: boolean;
      routingMode?: 'auto' | 'country' | 'tunnel' | 'direct';
      countryCode?: string | null;
      countryCodes?: string[] | null;
      projectId?: string | null;
      exitNodeId?: string | null;
      upstreamTunnelId?: string | null;
      streamingEnabled?: boolean;
    }) => request<Forwarder>('POST', '/forwarders', data),
    update: (
      id: string,
      data: Partial<{
        label: string;
        targetUrl: string;
        enabled: boolean;
        forwardAuthHeader: boolean;
        preservePath: boolean;
        preserveQuery: boolean;
        routingMode: 'auto' | 'country' | 'tunnel' | 'direct';
        countryCode: string | null;
        countryCodes: string[] | null;
        projectId: string | null;
        exitNodeId: string | null;
        upstreamTunnelId: string | null;
        streamingEnabled: boolean;
      }>,
    ) => request<Forwarder>('PATCH', `/forwarders/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/forwarders/${id}`),
  },

  // Upstream outbound tunnels (WireGuard / AmneziaWG / SOCKS5 / HTTP)
  upstreams: {
    listAdmin: () => request<UpstreamTunnel[]>('GET', '/admin/upstreams'),
    create: (data: CreateUpstreamPayload) =>
      request<UpstreamTunnel>('POST', '/admin/upstreams', data),
    update: (id: string, data: UpdateUpstreamPayload) =>
      request<UpstreamTunnel>('PATCH', `/admin/upstreams/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/admin/upstreams/${id}`),
    test: (id: string) =>
      request<UpstreamProbeResult>('POST', `/admin/upstreams/${id}/test`, {}),
    available: () =>
      request<AvailableUpstreamTunnel[]>('GET', '/upstreams/available'),
  },

  // Plans
  plans: {
    list: () => request<Plan[]>('GET', '/plans'),
    create: (data: {
      name: string;
      monthlyBandwidthGb: number;
      maxConcurrentSessions?: number;
      priceToman?: number | string;
    }) => request<Plan>('POST', '/admin/plans', data),
    update: (
      id: string,
      data: Partial<{
        name: string;
        monthlyBandwidthGb: number;
        maxConcurrentSessions: number;
        priceToman: number | string;
        isActive: boolean;
      }>,
    ) => request<Plan>('PATCH', `/admin/plans/${id}`, data),
    purchase: (id: string) =>
      request<{
        subscription: {
          id: string;
          status: string;
          periodStart: string;
          periodEnd: string;
        };
        plan: Plan;
        wallet: { balanceToman: string };
      }>('POST', `/plans/${id}/purchase`),
    assignToUser: (userId: string, planId: string) =>
      request<unknown>('POST', `/admin/users/${userId}/assign-plan/${planId}`),
  },
  adminPlans: {
    list: () => request<Plan[]>('GET', '/admin/plans'),
  },

  // Countries
  countries: {
    list: () => request<Country[]>('GET', '/countries'),
    listAdmin: () => request<Country[]>('GET', '/admin/countries'),
    setEnabled: (code: string, enabled: boolean) =>
      request<Country>('PATCH', `/admin/countries/${code}/enabled`, {
        enabled,
      }),
    status: () => request<CountryStatus[]>('GET', '/admin/countries/status'),
  },

  // Routing snapshot
  snapshot: () =>
    request<{ version: string; nodes: unknown[]; compiledAt: string }>(
      'GET',
      '/routing/snapshot',
    ),
  recompileSnapshot: () =>
    request<{ version: string }>('POST', '/routing/snapshot/recompile'),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface Node {
  id: string;
  label: string;
  countryCode: string;
  roles: string[];
  status: string;
  createdAt: string;
  updatedAt?: string;
  submittedById?: string | null;
  submittedBy?: { id: string; displayName: string } | null;
  approvedAt?: string | null;
  nodeSecretHash?: string | null;
  enrolled?: boolean;
  httpReady?: boolean;
  visibility?: 'private' | 'public';
  sharingRequested?: boolean;
  userPaused?: boolean;
  ipv4Address?: string | null;
  ipv6Address?: string | null;
  reportedCountry?: string | null;
  lastGeoVerifiedAt?: string | null;
  configVersion?: string;
  hostname?: string | null;
  osName?: string | null;
  architecture?: string | null;
  cpuCores?: number | null;
  memoryBytes?: string | null;
  uptimeSeconds?: string | null;
  relayVersion?: string | null;
  relaySha256?: string | null;
  updateRequestedAt?: string | null;
  updateStatus?: string | null;
  updateMessage?: string | null;
  country?: { code: string; name: string } | null;
  heartbeats?: Array<{
    agentVersion: string | null;
    configVersion: string | null;
    reportedAt: string;
  }>;
  metrics?: Array<{
    activeSessions: number | null;
    cpuPct: string | null;
    memPct: string | null;
    recordedAt: string;
  }>;
}

export interface NodeDetails extends Node {
  capabilities: Array<{
    protocol: string;
    transport: string;
    port: number;
    enabled: boolean;
  }>;
  heartbeats: Array<{
    agentVersion: string | null;
    configVersion: string | null;
    reportedAt: string;
  }>;
  metrics: Array<{
    activeSessions: number | null;
    cpuPct: string | null;
    memPct: string | null;
    recordedAt: string;
  }>;
  healthChecks: Array<{
    checkType: string;
    status: string;
    latencyMs: number | null;
    checkedAt: string;
  }>;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  monthlyBandwidthGb: number;
  maxConcurrentSessions: number;
  allowedProtocols: string[];
  allowedCountries: string[];
  priceToman: string;
  isActive?: boolean;
}

export interface Country {
  code: string;
  name: string;
  enabled: boolean;
  autoModeEligible?: boolean;
}

export interface CountryStatus {
  code: string;
  name?: string;
  total: number;
  healthy: number;
  active?: number;
  degraded?: number;
  unhealthy?: number;
  available?: boolean;
}

export interface ProxyCredential {
  exitNodeId?: string | null;
  id: string;
  uuid: string;
  label: string | null;
  enabled: boolean;
  projectId?: string | null;
  countryCode?: string | null;
  routingMode?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  defaultMode: string;
  createdAt: string;
  updatedAt?: string;
  recordCount?: number;
  activeCount?: number;
  forwarderCount?: number;
  credentialCount?: number;
}

export interface AvailableNode {
  id: string; label: string; countryCode: string; visibility: string; submittedById: string | null;
}

export interface ProjectRecord {
  exitNodeId?: string | null;
  id: string;
  rawId: string;
  type: 'forwarder' | 'socks5';
  label: string;
  enabled: boolean;
  routingMode: string;
  countryCode: string | null;
  countryCodes: string[];
  targetUrl?: string;
  slug?: string;
  uuid?: string;
  preservePath?: boolean;
  preserveQuery?: boolean;
  forwardAuthHeader?: boolean;
  callCount: string;
  bytesIn: string;
  bytesOut: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface Socks5Endpoint {
  nodeId: string;
  label: string;
  countryCode: string;
  countryName: string;
  host: string;
  port: number;
}

export interface Socks5EndpointResult {
  endpoints: Socks5Endpoint[];
  requiresActivePlan: boolean;
}

export interface WalletMeResponse {
  balanceToman: string;
  currency: string;
  updatedAt: string;
  pricing: PricingResponse;
}

export interface WalletTransaction {
  id: string;
  amountToman: string;
  type: string;
  description: string | null;
  balanceAfterToman: string;
  createdAt: string;
}

export interface FinancialReport {
  categories: Array<{ category: string; spentToman: string }>;
  transactionsTotal: number;
  page: number;
  limit: number;
  usage: Array<{
    id: string;
    eventType: string;
    protocol: string;
    requests: number;
    bytesIn: string;
    bytesOut: string;
    occurredAt: string;
  }>;
  usageTotal: number;
  usagePage: number;
  usageLimit: number;
  dailySpending: Array<{ day: string; spentToman: string }>;
  transactions: WalletTransaction[];
}

export interface AdminStatistics {
  totalUsers: number;
  totalNodes: number;
  healthyNodes: number;
  activeCountries: number;
  walletBalanceToman: string;
  revenueToman: string;
  requestCount: number;
  socksBandwidthBytes: string;
  activeSubscriptions: number;
  activeCredentials: number;
  activeForwarders: number;
  transactionCount: number;
  generatedAt: string;
}

export interface PricingResponse {
  perRequestToman: string;
  perMbToman: string;
  minBalanceToman: string;
}

export interface AdminWalletBundle {
  wallet: { balanceToman: string; currency: string; updatedAt: string };
  transactions: WalletTransaction[];
}

export interface HealthMeResponse {
  status: 'ok' | string;
  timestamp: string;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    publicSlug: string;
    status: string;
    createdAt: string;
  };
  plan: {
    name: string;
    monthlyBandwidthGb: number;
    maxConcurrentSessions: number;
  } | null;
  usage: {
    totalForwarders: number;
    enabledForwarders: number;
    activeCredentials: number;
    totalCallsAllTime: string;
    totalBytesIn: string;
    totalBytesOut: string;
    forwardersUsedToday: number;
  };
  wallet: {
    balanceToman: string;
    currency: string;
    aboveMinBalance: boolean;
  };
  pricing: PricingResponse;
}

export type UpstreamProtocol = 'wireguard' | 'amneziawg' | 'socks5' | 'http';
export type UpstreamStatus =
  | 'pending'
  | 'healthy'
  | 'degraded'
  | 'unhealthy'
  | 'disabled';

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

export interface AiCheckStatus {
  openai?: boolean;
  openrouter?: boolean;
  opencode?: boolean;
}

export interface UpstreamTunnel {
  id: string;
  label: string;
  protocol: UpstreamProtocol;
  hostNodeId: string | null;
  countryCode: string;
  endpointPreview: string;
  hasJunkObfuscation: boolean;
  mtu: number | null;
  priority: number;
  enabled: boolean;
  status: UpstreamStatus;
  exitIp: string | null;
  latencyMs: number | null;
  aiCheckStatus: AiCheckStatus | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  requestCount: string;
  bytesIn: string;
  bytesOut: string;
  createdAt: string;
  updatedAt: string;
  country?: { code: string; name: string } | null;
  hostNode?: {
    id: string;
    label: string;
    countryCode: string;
    ipv4Address: string | null;
    status: string;
    tunnelProxyPort: number;
  } | null;
}

export interface AvailableUpstreamTunnel {
  id: string;
  label: string;
  protocol: UpstreamProtocol;
  countryCode: string;
  country?: { code: string; name: string } | null;
  hasJunkObfuscation: boolean;
  status: UpstreamStatus;
  latencyMs: number | null;
  aiCheckStatus: AiCheckStatus | null;
  priority: number;
}

export interface CreateUpstreamPayload {
  label: string;
  protocol: UpstreamProtocol;
  hostNodeId?: string | null;
  countryCode: string;
  rawConfig: string;
  junk?: WireguardJunkConfig | null;
  mtu?: number | null;
  priority?: number;
  enabled?: boolean;
}

export interface UpdateUpstreamPayload {
  label?: string;
  protocol?: UpstreamProtocol;
  hostNodeId?: string | null;
  countryCode?: string;
  rawConfig?: string;
  junk?: WireguardJunkConfig | null;
  mtu?: number | null;
  priority?: number;
  enabled?: boolean;
}

export interface UpstreamProbeResult {
  ok: boolean;
  exitIp?: string;
  latencyMs?: number;
  aiCheckStatus?: AiCheckStatus;
  error?: string;
  tunnel?: UpstreamTunnel;
}

export interface Forwarder {
  exitNodeId?: string | null;
  id: string;
  slug: string;
  label: string;
  targetUrl: string;
  routingMode?: 'auto' | 'country' | 'tunnel' | 'direct' | string;
  upstreamTunnelId?: string | null;
  upstreamTunnel?: {
    id: string;
    label: string;
    protocol: UpstreamProtocol;
    countryCode: string;
    status: UpstreamStatus;
    hasJunkObfuscation: boolean;
  } | null;
  streamingEnabled?: boolean;
  countryCode: string | null;
  countryCodes: string[];
  enabled: boolean;
  preservePath: boolean;
  preserveQuery: boolean;
  forwardAuthHeader: boolean;
  callCount: string;
  bytesIn: string;
  bytesOut: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface AdminVlessBundle {
  user: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
  };
  credentials: Array<{
    id: string;
    uuid: string;
    label: string | null;
    createdAt: string;
    vlessUri: string;
  }>;
}

export interface AdminUserDetails {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  publicSlug: string;
  status: string;
  role: string;
  createdAt: string;
  subscriptions: Array<{ status: string; plan: Plan }>;
  routingPreference: {
    routingMode: string;
    preferredCountry: string | null;
  } | null;
  proxyCredentials: Array<{
    id: string;
    uuid: string;
    label: string | null;
    enabled: boolean;
    createdAt: string;
  }>;
  forwarders: Array<{
    id: string;
    slug: string;
    label: string;
    targetUrl: string;
    enabled: boolean;
    callCount: string;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
}
