import {
  Injectable,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
  NodeSelectorService,
  SelectedNode,
} from '../routing/node-selector.service';

const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;

export interface GatewayAttempt {
  nodeId?: number;
  country?: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  isBase64?: boolean;
  bytesIn: number;
  bytesOut: number;
  viaNodeId?: number;
  viaCountry?: string;
  attempts?: GatewayAttempt[];
  redirectsFollowed?: number;
}

export interface FetchParams {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  isBase64?: boolean;
  responseEncoding?: 'utf8' | 'base64' | 'auto';
  followRedirects?: boolean;
  maxRedirects?: number;
  insecure?: boolean;
  timeoutMs?: number;
  failover?: boolean;
  maxAttempts?: number;
  country?: string | null;
  allowLocalFallback?: boolean;
}

function isBinaryContentType(contentType?: string): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase().split(';')[0].trim();
  if (
    ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct === 'application/javascript' ||
    ct === 'application/xml' ||
    ct === 'application/xhtml+xml' ||
    ct === 'application/x-yaml' ||
    ct === 'application/csv' ||
    ct === 'application/x-www-form-urlencoded' ||
    ct.endsWith('+json') ||
    ct.endsWith('+xml')
  ) {
    return false;
  }
  return true;
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(private readonly nodeSelector: NodeSelectorService) {}

  private isBlockedHost(hostname: string): boolean {
    return BLOCKED_HOSTS.some((re) => re.test(hostname));
  }

  private readonly failedUntil = new Map<number, number>();
  private readonly failureCooldownMs = 60_000;

  private isCoolingDown(nodeId: number): boolean {
    return (this.failedUntil.get(nodeId) ?? 0) > Date.now();
  }

  private markFailed(nodeId: number): void {
    this.failedUntil.set(nodeId, Date.now() + this.failureCooldownMs);
  }

  async listNodes(userId: bigint, country?: string | null) {
    const nodes = await this.nodeSelector.listAvailableNodes(userId, country);
    return { nodes, generatedAt: new Date().toISOString() };
  }

  async fetch(params: FetchParams & { userId?: bigint }): Promise<FetchResult> {
    if (params.userId === undefined) {
      return this.fetchLocal(params);
    }

    const preference = await this.nodeSelector.getPreference(params.userId);
    const overrideCountry = params.country?.trim().toUpperCase() || null;
    const effectiveMode = overrideCountry ? 'country' : preference.mode;
    const preferredCountry = overrideCountry ?? preference.preferredCountry;

    if (effectiveMode === 'local') {
      const result = await this.fetchLocal(params);
      return { ...result, attempts: [] };
    }

    const maxAttempts = Math.max(1, Math.min(params.maxAttempts ?? 3, 5));
    const failover = params.failover !== false;
    const requested = failover ? Math.min(maxAttempts * 2, 10) : 1;

    let nodes = await this.nodeSelector.selectCandidatesForUser(
      params.userId,
      {
        country: effectiveMode === 'country' ? preferredCountry : null,
        limit: requested,
      },
    );

    // Skip nodes that recently failed, but keep them as a last resort if all
    // candidates are cooling down.
    const fresh = nodes.filter((node) => !this.isCoolingDown(node.id));
    if (fresh.length) nodes = fresh;
    // In automatic mode prefer real remote relays over the co-located edge so
    // the panel's own IP is only used as a last resort.
    nodes.sort((a, b) => Number(a.isLocal) - Number(b.isLocal));
    nodes = nodes.slice(0, failover ? maxAttempts : 1);

    if (!nodes.length) {
      if (effectiveMode === 'country') {
        throw new ServiceUnavailableException(
          `No healthy relay is currently available in ${preferredCountry ?? 'the selected country'}`,
        );
      }
      if (params.allowLocalFallback) {
        const result = await this.fetchLocal(params);
        return { ...result, attempts: [] };
      }
      throw new ServiceUnavailableException(
        'No healthy relay nodes are currently available',
      );
    }

    const attempts: GatewayAttempt[] = [];

    for (const node of nodes) {
      const started = Date.now();
      try {
        const result = node.isLocal
          ? await this.fetchLocal(params)
          : await this.fetchViaNode(node, params);
        attempts.push({
          nodeId: node.id,
          country: node.countryCode,
          ok: true,
          ms: Date.now() - started,
        });
        return {
          ...result,
          viaNodeId: node.id,
          viaCountry: node.countryCode,
          attempts,
        };
      } catch (err) {
        attempts.push({
          nodeId: node.id,
          country: node.countryCode,
          ok: false,
          ms: Date.now() - started,
          error: (err as Error).message,
        });
        this.markFailed(node.id);
        this.logger.warn(
          `gateway node ${node.id} (${node.label}) failed: ${(err as Error).message}`,
        );
        if (!failover) break;
      }
    }

    // Explicit country choices must never silently fall back to the panel's IP.
    if (effectiveMode !== 'country' && params.allowLocalFallback) {
      const result = await this.fetchLocal(params);
      return { ...result, attempts };
    }

    if (effectiveMode === 'country') {
      throw new ServiceUnavailableException(
        `The selected ${preferredCountry} relay is temporarily unavailable`,
      );
    }

    throw new ServiceUnavailableException({
      error: 'all_nodes_failed',
      message: 'No relay node could complete the request',
      attempts,
    });
  }

  private async fetchViaNode(
    node: SelectedNode,
    params: FetchParams,
  ): Promise<FetchResult> {
    const clientTimeout = Math.min(
      Math.max(params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, 1_000),
      MAX_REQUEST_TIMEOUT_MS,
    );
    const hopTimeoutMs = clientTimeout + 5_000;

    const payload = Buffer.from(
      JSON.stringify({
        url: params.url,
        method: params.method,
        headers: params.headers,
        body: params.body,
        isBase64: params.isBase64,
        responseEncoding: params.responseEncoding,
        followRedirects: params.followRedirects,
        maxRedirects: params.maxRedirects,
        insecure: params.insecure,
        timeoutMs: clientTimeout,
      }),
      'utf8',
    );

    return new Promise<FetchResult>((resolve, reject) => {
      const req = http.request(
        {
          hostname: node.host,
          port: node.relayPort,
          path: '/fetch',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(payload.length),
            'X-Node-Secret': node.relaySecret,
          },
          timeout: hopTimeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode !== 200) {
              reject(
                new Error(
                  `node relay returned HTTP ${res.statusCode}: ${raw.slice(0, 200)}`,
                ),
              );
              return;
            }
            try {
              const parsed = JSON.parse(raw) as FetchResult;
              resolve(parsed);
            } catch {
              reject(new Error('node relay returned invalid JSON'));
            }
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.on('timeout', () =>
        req.destroy(
          new Error(`node relay timed out after ${hopTimeoutMs}ms`),
        ),
      );
      req.write(payload);
      req.end();
    });
  }

  private async fetchLocal(params: FetchParams): Promise<FetchResult> {
    const shouldFollowRedirects = params.followRedirects !== false;
    const maxRedirects = Math.min(Math.max(params.maxRedirects ?? 5, 0), 10);
    const effectiveTimeoutMs = Math.min(
      Math.max(params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, 1_000),
      MAX_REQUEST_TIMEOUT_MS,
    );

    let currentUrl = params.url;
    let currentMethod = (params.method ?? 'GET').toUpperCase();
    let currentBodyStr = params.body;
    let currentIsBase64 = params.isBase64;
    let redirectsCount = 0;
    let totalBytesIn = 0;
    let totalBytesOut = 0;

    while (true) {
      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        throw new BadRequestException(`Invalid URL: ${currentUrl}`);
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException('Only http and https URLs are supported');
      }
      if (this.isBlockedHost(parsed.hostname)) {
        throw new BadRequestException(
          'Requests to private/internal addresses are not allowed',
        );
      }

      let requestBody: Buffer | undefined;
      if (currentBodyStr) {
        requestBody = currentIsBase64
          ? Buffer.from(currentBodyStr, 'base64')
          : Buffer.from(currentBodyStr, 'utf8');
      }
      const bytesOut = requestBody?.length ?? 0;
      totalBytesOut += bytesOut;

      const safeHeaders: Record<string, string> = {
        'User-Agent': 'ProxyNet-Gateway/1.0',
      };

      for (const [k, v] of Object.entries(params.headers ?? {})) {
        const lower = k.toLowerCase();
        // Drop hop-by-hop headers and proxy-authorization.
        // Crucially, KEEP 'authorization' so target upstream APIs succeed!
        if (
          [
            'host',
            'connection',
            'content-length',
            'transfer-encoding',
            'proxy-authorization',
            'keep-alive',
            'upgrade',
          ].includes(lower)
        ) {
          continue;
        }
        safeHeaders[k] = v;
      }
      if (requestBody) {
        safeHeaders['Content-Length'] = String(requestBody.length);
      }

      const singleHopResult = await this.executeSingleHttp({
        parsed,
        method: currentMethod,
        headers: safeHeaders,
        body: requestBody,
        timeoutMs: effectiveTimeoutMs,
        insecure: params.insecure,
        responseEncoding: params.responseEncoding,
      });

      totalBytesIn += singleHopResult.bytesIn;

      // Handle redirect
      const isRedirect = [301, 302, 303, 307, 308].includes(singleHopResult.status);
      const location = singleHopResult.headers['location'];
      if (shouldFollowRedirects && isRedirect && location && redirectsCount < maxRedirects) {
        redirectsCount++;
        currentUrl = new URL(location, currentUrl).toString();

        // 303 See Other: Always switch to GET and drop body
        if (singleHopResult.status === 303) {
          currentMethod = 'GET';
          currentBodyStr = undefined;
          currentIsBase64 = false;
        } else if (
          (singleHopResult.status === 301 || singleHopResult.status === 302) &&
          currentMethod === 'POST'
        ) {
          // Standard browser & curl behavior: 301/302 POST redirects switch to GET
          currentMethod = 'GET';
          currentBodyStr = undefined;
          currentIsBase64 = false;
        }
        continue;
      }

      return {
        ...singleHopResult,
        bytesIn: totalBytesIn,
        bytesOut: totalBytesOut,
        redirectsFollowed: redirectsCount,
      };
    }
  }

  private executeSingleHttp(options: {
    parsed: URL;
    method: string;
    headers: Record<string, string>;
    body?: Buffer;
    timeoutMs: number;
    insecure?: boolean;
    responseEncoding?: 'utf8' | 'base64' | 'auto';
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
    isBase64: boolean;
    bytesIn: number;
  }> {
    return new Promise((resolve, reject) => {
      const isHttps = options.parsed.protocol === 'https:';
      const lib = isHttps ? https : http;
      const defaultPort = isHttps ? 443 : 80;

      const reqOptions: https.RequestOptions = {
        hostname: options.parsed.hostname,
        port: options.parsed.port ? parseInt(options.parsed.port, 10) : defaultPort,
        path: options.parsed.pathname + options.parsed.search,
        method: options.method,
        headers: options.headers,
        timeout: options.timeoutMs,
      };

      if (isHttps && options.insecure) {
        reqOptions.rejectUnauthorized = false;
      }

      const req = lib.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            req.destroy(
              new Error(`Response exceeds ${MAX_RESPONSE_BYTES} byte limit`),
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const outHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') outHeaders[k] = v;
            else if (Array.isArray(v)) outHeaders[k] = v.join(', ');
          }

          const contentType = outHeaders['content-type'];
          const shouldBase64 =
            options.responseEncoding === 'base64' ||
            (options.responseEncoding !== 'utf8' && isBinaryContentType(contentType));

          resolve({
            status: res.statusCode ?? 200,
            headers: outHeaders,
            body: shouldBase64 ? buffer.toString('base64') : buffer.toString('utf8'),
            isBase64: shouldBase64,
            bytesIn: totalBytes,
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () =>
        req.destroy(
          new Error(`Request timed out after ${options.timeoutMs}ms`),
        ),
      );

      if (options.body) req.write(options.body);
      req.end();
    });
  }
}
