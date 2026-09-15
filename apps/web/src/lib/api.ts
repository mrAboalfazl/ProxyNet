const BASE = process.env.NEXT_PUBLIC_API_URL || '';

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
      const msg = Array.isArray(json.message) ? json.message.join(', ') : (json.message || text);
      throw new Error(msg);
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) throw new Error(text);
      throw parseErr;
    }
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  // Auth
  login: (identifier: string, password: string) =>
    request<{ accessToken: string }>('POST', '/auth/login', { identifier, password }),

  startRegistration: (data: { displayName: string; email: string; phone: string; password: string }) =>
    request<{ registrationId: string; expiresInSeconds: number }>('POST', '/auth/registration/start', data),

  confirmRegistration: (registrationId: string, code: string) =>
    request<{ accessToken: string }>('POST', '/auth/registration/confirm', { registrationId, code }),

  sendOtp: (identifier: string, method: string) =>
    request<{ sent: boolean }>('POST', '/auth/otp/send', { identifier, method }),

  verifyOtp: (identifier: string, method: string, code: string) =>
    request<{ accessToken: string }>('POST', '/auth/otp/verify', { identifier, method, code }),

  logout: () => request<void>('POST', '/auth/logout'),

  // Current user
  me: () => request<User & { routingPreference?: { routingMode: string; preferredCountry: string | null } }>('GET', '/users/me'),

  updateRoutingPreference: (routingMode: string, preferredCountry?: string) =>
    request<unknown>('PATCH', '/users/me/routing', { routingMode, preferredCountry }),

  // Usage
  myUsage: () =>
    request<{ bytesUsed: number; connectionsUsed: number; periodStart: string; periodEnd: string; plan?: { name: string; monthlyBandwidthGb: number } }>(
      'GET', '/metering/usage/me',
    ),

  // Proxy credentials
  myCredentials: () => request<ProxyCredential[]>('GET', '/proxy-credentials'),

  createCredential: (label?: string) =>
    request<ProxyCredential & { secret?: string }>('POST', '/proxy-credentials', { label }),

  revokeCredential: (id: string) =>
    request<void>('DELETE', `/proxy-credentials/${id}`),

  // Dashboard
  dashboard: () =>
    request<{ totalUsers: number; totalNodes: number; healthyNodes: number; activeCountries: number }>(
      'GET', '/admin/dashboard',
    ),

  // Nodes (admin)
  nodes: {
    list: (country?: string) => request<Node[]>('GET', country ? `/admin/nodes?country=${country}` : '/admin/nodes'),
    create: (data: { countryCode: string; label: string; roles: string[] }) =>
      request<Node & { token: string; expiresAt: string }>('POST', '/admin/nodes', data),
    setStatus: (id: string, status: string) =>
      request<Node>('PATCH', `/admin/nodes/${id}/status`, { status }),
    enrollmentToken: (id: string) =>
      request<{ token: string; expiresAt: string }>('POST', `/admin/nodes/${id}/enrollment-token`),
    approve: (id: string) => request<Node>('POST', `/admin/nodes/${id}/approve`, {}),
    reject: (id: string) => request<Node>('POST', `/admin/nodes/${id}/reject`, {}),
  },

  // Nodes (user self-service)
  myNodes: {
    list: () => request<Node[]>('GET', '/nodes/my'),
    create: (data: { countryCode: string; label: string }) =>
      request<{ node: Node; token: string; expiresAt: string }>('POST', '/nodes/my', data),
  },

  // Users
  users: {
    list: (page = 1) => request<{ users: User[]; total: number; page: number }>('GET', `/admin/users?page=${page}&limit=20`),
    get: (id: string) => request<AdminUserDetails>('GET', `/admin/users/${id}`),
    getVless: (id: string) => request<AdminVlessBundle>('GET', `/admin/users/${id}/vless`),
    setStatus: (id: string, status: string) => request<User>('PATCH', `/admin/users/${id}/status`, { status }),
  },

  // Health check (authenticated — verifies auth + returns account status/usage/wallet)
  healthMe: () => request<HealthMeResponse>('GET', '/health/me'),

  // Wallet (user)
  wallet: {
    me: () => request<WalletMeResponse>('GET', '/wallet/me'),
    transactions: (limit = 50) => request<WalletTransaction[]>('GET', `/wallet/me/transactions?limit=${limit}`),
  },

  // Wallet + pricing (admin)
  adminWallet: {
    get: (userId: string) => request<AdminWalletBundle>('GET', `/admin/users/${userId}/wallet`),
    topup: (userId: string, amountToman: number | string, description?: string) =>
      request<{ wallet: { balanceToman: string; currency: string }; transactionId: string }>(
        'POST', `/admin/users/${userId}/wallet/topup`, { amountToman, description },
      ),
    adjust: (userId: string, amountToman: number | string, description?: string) =>
      request<{ wallet: { balanceToman: string; currency: string }; transactionId: string }>(
        'POST', `/admin/users/${userId}/wallet/adjust`, { amountToman, description },
      ),
  },
  adminPricing: {
    get: () => request<PricingResponse>('GET', '/admin/pricing'),
    update: (patch: Partial<PricingResponse>) => request<PricingResponse>('PATCH', '/admin/pricing', patch),
  },

  // Forwarders (user)
  forwarders: {
    list: () => request<{ userSlug: string; forwarders: Forwarder[] }>('GET', '/forwarders'),
    create: (data: { label: string; targetUrl: string; forwardAuthHeader?: boolean; preservePath?: boolean; preserveQuery?: boolean }) =>
      request<Forwarder>('POST', '/forwarders', data),
    update: (id: string, data: Partial<{ label: string; targetUrl: string; enabled: boolean; forwardAuthHeader: boolean; preservePath: boolean; preserveQuery: boolean }>) =>
      request<Forwarder>('PATCH', `/forwarders/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/forwarders/${id}`),
  },

  // Plans
  plans: {
    list: () => request<Plan[]>('GET', '/plans'),
    create: (data: { name: string; monthlyBandwidthGb: number; maxConcurrentSessions?: number }) =>
      request<Plan>('POST', '/admin/plans', data),
    assignToUser: (userId: string, planId: string) =>
      request<unknown>('POST', `/admin/users/${userId}/assign-plan/${planId}`),
  },

  // Countries
  countries: {
    list: () => request<Country[]>('GET', '/countries'),
    setEnabled: (code: string, enabled: boolean) =>
      request<Country>('PATCH', `/admin/countries/${code}/enabled`, { enabled }),
    status: () => request<CountryStatus[]>('GET', '/admin/countries/status'),
  },

  // Routing snapshot
  snapshot: () => request<{ version: string; nodes: unknown[]; compiledAt: string }>('GET', '/routing/snapshot'),
  recompileSnapshot: () => request<{ version: string }>('POST', '/routing/snapshot/recompile'),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface Node {
  id: string;
  label: string;
  countryCode: string;
  roles: string[];
  status: string;
  createdAt: string;
  submittedById?: string | null;
  submittedBy?: { id: string; displayName: string } | null;
  approvedAt?: string | null;
  nodeSecretHash?: string | null;
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
}

export interface Country {
  code: string;
  name: string;
  enabled: boolean;
}

export interface CountryStatus {
  countryCode: string;
  totalNodes: number;
  healthyNodes: number;
}

export interface ProxyCredential {
  id: string;
  uuid: string;
  label: string | null;
  enabled: boolean;
  createdAt: string;
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

export interface Forwarder {
  id: string;
  slug: string;
  label: string;
  targetUrl: string;
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
  user: { id: string; displayName: string; email: string | null; phone: string | null };
  credentials: Array<{ id: string; uuid: string; label: string | null; createdAt: string; vlessUri: string }>;
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
  routingPreference: { routingMode: string; preferredCountry: string | null } | null;
  proxyCredentials: Array<{ id: string; uuid: string; label: string | null; enabled: boolean; createdAt: string }>;
  forwarders: Array<{ id: string; slug: string; label: string; targetUrl: string; enabled: boolean; callCount: string; lastUsedAt: string | null; createdAt: string }>;
}
