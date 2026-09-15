import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { NodeSelectorService, SelectedNode } from '../routing/node-selector.service';

const BLOCKED_HOSTS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./, /^169\.254\./,
  /^::1$/, /^fc[0-9a-f]{2}:/i, /^fd[0-9a-f]{2}:/i, /^fe80:/i,
];

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const NODE_HOP_TIMEOUT_MS = 35_000;

export interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  bytesIn: number;
  bytesOut: number;
  viaNodeId?: number;
  viaCountry?: string;
}

interface FetchParams {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(private readonly nodeSelector: NodeSelectorService) {}

  private isBlockedHost(hostname: string): boolean {
    return BLOCKED_HOSTS.some((re) => re.test(hostname));
  }

  async fetch(params: FetchParams & { userId?: bigint }): Promise<FetchResult> {
    if (params.userId !== undefined) {
      const node = await this.nodeSelector.selectForUser(params.userId);
      if (node && !node.isLocal) {
        try {
          const result = await this.fetchViaNode(node, params);
          return { ...result, viaNodeId: node.id, viaCountry: node.countryCode };
        } catch (err) {
          this.logger.warn(
            `node ${node.id} (${node.label}) failed: ${(err as Error).message} — falling back to local egress`,
          );
        }
      } else if (node?.isLocal) {
        const result = await this.fetchLocal(params);
        return { ...result, viaNodeId: node.id, viaCountry: node.countryCode };
      }
    }
    return this.fetchLocal(params);
  }

  private async fetchViaNode(node: SelectedNode, params: FetchParams): Promise<FetchResult> {
    const payload = Buffer.from(JSON.stringify({
      url: params.url,
      method: params.method,
      headers: params.headers,
      body: params.body,
    }), 'utf8');

    return new Promise<FetchResult>((resolve, reject) => {
      const req = http.request({
        hostname: node.host,
        port: node.relayPort,
        path: '/fetch',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(payload.length),
          'X-Node-Secret': node.relaySecret,
        },
        timeout: NODE_HOP_TIMEOUT_MS,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error(`node relay returned HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
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
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error(`node relay timed out after ${NODE_HOP_TIMEOUT_MS}ms`)));
      req.write(payload);
      req.end();
    });
  }

  private async fetchLocal(params: FetchParams): Promise<FetchResult> {
    let parsed: URL;
    try { parsed = new URL(params.url); } catch { throw new BadRequestException('Invalid URL'); }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only http and https URLs are supported');
    }
    if (this.isBlockedHost(parsed.hostname)) {
      throw new BadRequestException('Requests to private/internal addresses are not allowed');
    }

    const method = (params.method ?? 'GET').toUpperCase();
    const requestBody = params.body ? Buffer.from(params.body, 'utf8') : undefined;
    const bytesOut = requestBody?.length ?? 0;

    const safeHeaders: Record<string, string> = {
      'User-Agent': 'ProxyNet-Gateway/1.0',
    };
    for (const [k, v] of Object.entries(params.headers ?? {})) {
      const lower = k.toLowerCase();
      if (['host', 'connection', 'content-length', 'transfer-encoding',
           'authorization', 'proxy-authorization'].includes(lower)) continue;
      safeHeaders[k] = v;
    }
    if (requestBody) safeHeaders['Content-Length'] = String(requestBody.length);

    return new Promise((resolve, reject) => {
      const lib = parsed.protocol === 'https:' ? https : http;
      const defaultPort = parsed.protocol === 'https:' ? 443 : 80;

      const req = lib.request({
        hostname: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port) : defaultPort,
        path: parsed.pathname + parsed.search,
        method,
        headers: safeHeaders,
        timeout: REQUEST_TIMEOUT_MS,
      }, (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            req.destroy(new Error(`Response exceeds ${MAX_RESPONSE_BYTES} byte limit`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const outHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') outHeaders[k] = v;
            else if (Array.isArray(v)) outHeaders[k] = v.join(', ');
          }
          resolve({ status: res.statusCode ?? 200, headers: outHeaders, body, bytesIn: totalBytes, bytesOut });
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Request timed out after 30s')));

      if (requestBody) req.write(requestBody);
      req.end();
    });
  }
}
