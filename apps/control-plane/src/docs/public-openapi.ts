import type { OpenAPIObject } from '@nestjs/swagger';

const BLOCKED_PUBLIC_PREFIXES = [
  '/api/admin',
  '/api/nodes',
  '/api/metering',
  '/api/users',
  '/api/bans',
  '/api/internal',
];

export function isPublicOpenApiPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return !BLOCKED_PUBLIC_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/**
 * Strips all internal/admin/node routes from an auto-generated NestJS Swagger document
 * so no privileged control-plane endpoints are ever exposed publicly.
 */
export function filterPublicSwaggerDocument(
  doc: OpenAPIObject,
): OpenAPIObject {
  const filteredPaths: OpenAPIObject['paths'] = {};
  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    if (isPublicOpenApiPath(path)) {
      filteredPaths[path] = pathItem;
    }
  }
  return {
    ...doc,
    paths: filteredPaths,
  };
}

export function normalizePublicOrigin(baseUrl = 'https://panel.civonex.ir'): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return 'https://panel.civonex.ir';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, '').replace(/\/api$/i, '');
  }
}

/**
 * Curated, developer-friendly Public OpenAPI 3.0.3 specification for ProxyNet.
 * Covers Forwarder Proxy (with zero-buffer SSE streaming), Forwarders CRUD,
 * Available Upstream Tunnels, HTTP Gateway, SOCKS5 Credentials, Projects, and Health.
 */
export function buildPublicOpenApiDocument(baseUrl = 'https://panel.civonex.ir'): OpenAPIObject {
  const origin = normalizePublicOrigin(baseUrl);

  return {
    openapi: '3.0.3',
    info: {
      title: 'ProxyNet — Developer & AI Gateway API',
      version: '1.3.0',
      description: [
        'Public developer API for ProxyNet (Civonex).',
        '',
        '### Key Capabilities',
        '- **Zero-Buffer SSE & HTTP/HTTPS Forwarder (`/api/f/{userSlug}/{forwarderSlug}/{path}`):** Drop-in base URL for OpenAI, OpenCode Go, Anthropic/Claude Code, OpenRouter, Telegram Bot API, and any REST/SSE endpoint.',
        '- **WireGuard / AmneziaWG Upstream Pool:** Automatic Round-Robin load balancing + instant pre-header failover across healthy multi-country tunnels (`auto`), ordered country preference (`country`), pinned tunnel (`tunnel`), or direct (`direct`).',
        '- **Privacy-First Header Sanitization:** Strips `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, and `CF-Connecting-IP` outbound so upstream targets only see the clean exit IP.',
        '- **HTTP Gateway (`/api/gateway/fetch`) & SOCKS5:** Basic-Auth JSON fetch gateway and standard SOCKS5 credentials.',
      ].join('\n'),
    },
    servers: [
      {
        url: origin,
        description: 'ProxyNet Edge Server',
      },
    ],
    tags: [
      {
        name: 'Forwarder Proxy',
        description: 'Public URL-authenticated HTTP/HTTPS & SSE streaming proxy',
      },
      {
        name: 'Forwarders',
        description: 'Create and manage persistent forwarder routes (JWT Bearer)',
      },
      {
        name: 'Upstreams',
        description: 'Inspect available healthy WireGuard/AmneziaWG/SOCKS5 tunnels',
      },
      {
        name: 'HTTP Gateway',
        description: 'Programmatic JSON fetch proxy authenticated via Basic Auth',
      },
      {
        name: 'Credentials & Projects',
        description: 'Manage SOCKS5 credentials and project grouping (JWT Bearer)',
      },
      {
        name: 'System',
        description: 'Service health check',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Panel session JWT obtained from /api/auth/login',
        },
        basicAuth: {
          type: 'http',
          scheme: 'basic',
          description: 'Proxy credential UUID as username and secret as password',
        },
      },
      schemas: {
        ForwarderRoutingMode: {
          type: 'string',
          enum: ['auto', 'country', 'tunnel', 'direct'],
          description:
            'auto = Round-Robin + automatic failover across healthy WireGuard tunnels; country = ordered country preference; tunnel = pinned to upstreamTunnelId (fail-closed); direct = direct local egress',
        },
        CreateForwarderRequest: {
          type: 'object',
          required: ['label', 'targetUrl'],
          properties: {
            label: { type: 'string', maxLength: 80, example: 'OpenCode Go (WG)' },
            targetUrl: {
              type: 'string',
              format: 'uri',
              example: 'https://opencode.ai',
            },
            routingMode: { $ref: '#/components/schemas/ForwarderRoutingMode' },
            upstreamTunnelId: {
              type: 'string',
              nullable: true,
              description: 'Required when routingMode is "tunnel"',
              example: '1',
            },
            countryCodes: {
              type: 'array',
              items: { type: 'string', example: 'NL' },
              description: 'Ordered ISO-3166 alpha-2 exit countries for "country" mode',
            },
            streamingEnabled: {
              type: 'boolean',
              default: true,
              description: 'Enable zero-buffer Server-Sent Events (SSE) streaming',
            },
            preservePath: { type: 'boolean', default: true },
            preserveQuery: { type: 'boolean', default: true },
            forwardAuthHeader: { type: 'boolean', default: true },
            projectId: { type: 'string', nullable: true },
          },
        },
        Forwarder: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '9' },
            slug: { type: 'string', example: 'erlvG3PA0VlKXkeRRsuC' },
            label: { type: 'string', example: 'OpenCode Go (WG)' },
            targetUrl: { type: 'string', example: 'https://opencode.ai' },
            routingMode: { $ref: '#/components/schemas/ForwarderRoutingMode' },
            upstreamTunnelId: { type: 'string', nullable: true },
            countryCodes: { type: 'array', items: { type: 'string' } },
            streamingEnabled: { type: 'boolean' },
            preservePath: { type: 'boolean' },
            preserveQuery: { type: 'boolean' },
            forwardAuthHeader: { type: 'boolean' },
            enabled: { type: 'boolean' },
            callCount: { type: 'string', example: '42' },
            bytesIn: { type: 'string', example: '271884' },
            bytesOut: { type: 'string', example: '514145' },
          },
        },
        AvailableUpstreamTunnel: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '1' },
            label: { type: 'string', example: 'WireGuard NL-01' },
            protocol: {
              type: 'string',
              enum: ['wireguard', 'amneziawg', 'socks5', 'http'],
            },
            countryCode: { type: 'string', example: 'NL' },
            hasJunkObfuscation: { type: 'boolean' },
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'pending', 'unhealthy', 'disabled'],
            },
            latencyMs: { type: 'number', nullable: true, example: 174 },
            aiCheckStatus: {
              type: 'object',
              nullable: true,
              properties: {
                openai: { type: 'boolean' },
                openrouter: { type: 'boolean' },
                opencode: { type: 'boolean' },
              },
            },
            priority: { type: 'integer', example: 100 },
          },
        },
        GatewayFetchRequest: {
          type: 'object',
          required: ['url'],
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              example: 'https://api.ipify.org?format=json',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
              default: 'GET',
            },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            body: { type: 'string' },
            isBase64: { type: 'boolean', default: false },
            timeoutMs: { type: 'integer', minimum: 1000, maximum: 60000, default: 30000 },
          },
        },
      },
    },
    paths: {
      '/api/f/{userSlug}/{forwarderSlug}/{path}': {
        post: {
          tags: ['Forwarder Proxy'],
          summary: 'Forward POST request (REST / OpenAI / Anthropic / SSE Streaming)',
          description:
            'Forwards the request verbatim to the forwarder targetUrl + path suffix + query string. Supports real-time Server-Sent Events (SSE) with 300s idle timeout, automatic Round-Robin load balancing across healthy WireGuard tunnels, pre-header failover, and outbound client IP header stripping. Works for GET, POST, PUT, PATCH, DELETE, and OPTIONS.',
          parameters: [
            {
              name: 'userSlug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Your account publicSlug (shown in User → Forwarders)',
            },
            {
              name: 'forwarderSlug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Unique 20-character forwarder slug',
            },
            {
              name: 'path',
              in: 'path',
              required: false,
              schema: { type: 'string' },
              description:
                'Optional path appended to targetUrl when preservePath is true (e.g. v1/chat/completions or inference/go/openai/v1/chat/completions)',
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { type: 'object' },
                example: {
                  model: 'deepseek-v4.1-flash',
                  stream: true,
                  messages: [{ role: 'user', content: 'Hello from ProxyNet!' }],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Upstream response (JSON or text/event-stream SSE)',
              headers: {
                'x-proxynet-via-tunnel': {
                  description: 'Upstream WireGuard/SOCKS5 tunnel ID that served the request',
                  schema: { type: 'string' },
                },
                'x-proxynet-via-protocol': {
                  description: 'Protocol used (wireguard, amneziawg, socks5, http)',
                  schema: { type: 'string' },
                },
                'x-proxynet-via-country': {
                  description: 'Exit country ISO code (e.g. NL, DE)',
                  schema: { type: 'string' },
                },
                'x-accel-buffering': {
                  description: 'Always "no" to guarantee unbuffered SSE streaming',
                  schema: { type: 'string', example: 'no' },
                },
              },
            },
            '404': { description: 'Forwarder not found or disabled' },
            '413': { description: 'Request body exceeded 10 MB limit' },
            '502': { description: 'All upstream tunnels/nodes failed before response headers' },
            '503': { description: 'Selected pinned tunnel or country is currently unavailable' },
          },
        },
        get: {
          tags: ['Forwarder Proxy'],
          summary: 'Forward GET request through configured tunnel or country',
          parameters: [
            { name: 'userSlug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'forwarderSlug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'path', in: 'path', required: false, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Upstream response proxied verbatim' },
            '404': { description: 'Forwarder not found or disabled' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/forwarders': {
        get: {
          tags: ['Forwarders'],
          summary: 'List your forwarders and account publicSlug',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'User slug and list of forwarders',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      userSlug: { type: 'string' },
                      forwarders: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Forwarder' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Forwarders'],
          summary: 'Create a new HTTP/HTTPS & SSE forwarder',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateForwarderRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Forwarder created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Forwarder' },
                },
              },
            },
          },
        },
      },
      '/api/forwarders/{id}': {
        patch: {
          tags: ['Forwarders'],
          summary: 'Update forwarder routing mode, target URL, or pinned tunnel',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateForwarderRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Updated forwarder',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Forwarder' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Forwarders'],
          summary: 'Delete a forwarder',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': { description: 'Forwarder deleted' },
          },
        },
      },
      '/api/upstreams/available': {
        get: {
          tags: ['Upstreams'],
          summary: 'List healthy upstream tunnels available to your subscription plan',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'List of sanitized upstream tunnels (zero secrets exposed)',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/AvailableUpstreamTunnel' },
                  },
                },
              },
            },
          },
        },
      },
      '/api/gateway/fetch': {
        post: {
          tags: ['HTTP Gateway'],
          summary: 'Execute an outbound HTTP/HTTPS request via JSON envelope',
          security: [{ basicAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GatewayFetchRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Proxied HTTP response wrapped in JSON envelope' },
            '401': { description: 'Invalid Basic Auth proxy credential' },
          },
        },
        get: {
          tags: ['HTTP Gateway'],
          summary: 'Quick GET proxy via query parameter (?url=...)',
          security: [{ basicAuth: [] }],
          parameters: [
            {
              name: 'url',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uri' },
            },
          ],
          responses: {
            '200': { description: 'Proxied HTTP response' },
          },
        },
      },
      '/api/gateway/health': {
        get: {
          tags: ['HTTP Gateway'],
          summary: 'Check HTTP Gateway health',
          responses: { '200': { description: 'Gateway is operational' } },
        },
      },
      '/api/proxy-credentials': {
        get: {
          tags: ['Credentials & Projects'],
          summary: 'List your SOCKS5 / Gateway credentials',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of proxy credentials' } },
        },
        post: {
          tags: ['Credentials & Projects'],
          summary: 'Create a new SOCKS5 / Gateway credential',
          security: [{ bearerAuth: [] }],
          responses: { '201': { description: 'Created credential (secret shown once)' } },
        },
      },
      '/api/projects': {
        get: {
          tags: ['Credentials & Projects'],
          summary: 'List your projects',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of projects' } },
        },
        post: {
          tags: ['Credentials & Projects'],
          summary: 'Create a new project',
          security: [{ bearerAuth: [] }],
          responses: { '201': { description: 'Created project' } },
        },
      },
      '/api/health': {
        get: {
          tags: ['System'],
          summary: 'Control plane health check',
          responses: {
            '200': {
              description: 'Healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
