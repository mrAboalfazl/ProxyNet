import { Controller, All, Req, Res, Param, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { URL } from 'url';
import * as http from 'http';
import * as https from 'https';
import { ForwardersService } from './forwarders.service';
import {
  NodeSelectorService,
  SelectedNode,
} from '../routing/node-selector.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../wallet/pricing.service';

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

// SSRF: block internal networks. Same list as GatewayService.
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
const isBlocked = (host: string) => BLOCKED_HOSTS.some((re) => re.test(host));

// Hop-by-hop headers stripped before forwarding to target.
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-authenticate',
  'upgrade',
]);

interface OutboundResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  bytesIn: number;
  bytesOut: number;
}

/**
 * Reads up to maxBytes from the client request. We buffer to a byte cap and
 * respond 413 if exceeded. Streaming would be nicer but adds complexity — 10 MB
 * is enough for typical API payloads.
 */
function readBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('body_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

@Controller('f')
export class ForwarderProxyController {
  private readonly logger = new Logger(ForwarderProxyController.name);

  constructor(
    private readonly forwarders: ForwardersService,
    private readonly nodeSelector: NodeSelectorService,
    private readonly wallet: WalletService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * The public forwarding endpoint. URL structure:
   *   /api/f/:userSlug/:forwarderSlug[/optional/path/suffix][?query]
   *
   * Two routes so Express matches both bare `/api/f/a/b` and `/api/f/a/b/extra`.
   * The URL itself is the auth (both slugs are random 12-20 char base62 tokens).
   */
  @All(':userSlug/:forwarderSlug')
  proxyBare(
    @Param('userSlug') userSlug: string,
    @Param('forwarderSlug') forwarderSlug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handle(userSlug, forwarderSlug, req, res);
  }

  @All(':userSlug/:forwarderSlug/*')
  proxyWithSuffix(
    @Param('userSlug') userSlug: string,
    @Param('forwarderSlug') forwarderSlug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handle(userSlug, forwarderSlug, req, res);
  }

  private async handle(
    userSlug: string,
    forwarderSlug: string,
    req: Request,
    res: Response,
  ) {
    const fwd = await this.forwarders.findForProxy(userSlug, forwarderSlug);
    if (!fwd) {
      res.status(404).json({ error: 'forwarder_not_found' });
      return;
    }

    // Pre-flight wallet check. Reject BEFORE spending resources on the outbound call.
    const pricing = await this.pricing.get();
    const hasBalance = await this.wallet.hasMinBalance(
      fwd.userId,
      pricing.minBalanceToman,
    );
    if (!hasBalance) {
      res.status(402).json({
        error: 'insufficient_balance',
        message:
          'Wallet is below the minimum balance to make a call. Top up to continue.',
        minBalanceToman: pricing.minBalanceToman.toString(),
      });
      return;
    }

    // Parse the configured target
    let target: URL;
    try {
      target = new URL(fwd.targetUrl);
    } catch {
      res
        .status(500)
        .json({
          error: 'forwarder_misconfigured',
          detail: 'invalid target URL',
        });
      return;
    }
    if (isBlocked(target.hostname)) {
      res
        .status(500)
        .json({
          error: 'forwarder_misconfigured',
          detail: 'target host is blocked',
        });
      return;
    }

    // Optional path suffix — anything after /f/:userSlug/:forwarderSlug becomes appended to target path
    // Express captures the wildcard as `0` in params, or we can read from originalUrl.
    // We prefer parsing originalUrl because the wildcard param handling changed across express versions.
    const baseMatch = req.originalUrl.match(
      new RegExp(`/api/f/${userSlug}/${forwarderSlug}(/[^?]*)?(\\?.*)?$`),
    );
    const pathSuffix = baseMatch?.[1] ?? '';
    const clientQuery = baseMatch?.[2] ?? '';

    // Build final target URL according to preserve flags
    let finalUrl = target.origin + target.pathname.replace(/\/+$/, '');
    if (fwd.preservePath && pathSuffix) finalUrl += pathSuffix;
    if (fwd.preserveQuery && clientQuery) {
      // If the target already has a query, merge (client wins on conflicts)
      if (target.search) {
        finalUrl += target.search + '&' + clientQuery.slice(1);
      } else {
        finalUrl += clientQuery;
      }
    } else if (target.search) {
      finalUrl += target.search;
    }

    // Build outbound headers (strip hop-by-hop, respect forwardAuthHeader flag)
    const outHeaders: Record<string, string> = { host: target.host };
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (HOP_BY_HOP.has(lower)) continue;
      if (lower === 'authorization' && !fwd.forwardAuthHeader) continue;
      if (v === undefined) continue;
      outHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    outHeaders['x-forwarded-by'] = 'ProxyNet-Forwarder';

    // Read the client body. NestJS's body-parser has already consumed the stream, but
    // rawBody:true in main.ts means the original bytes are preserved on req.rawBody.
    // We use that if present; otherwise fall back to streaming (rare — e.g. content-type
    // that body-parser doesn't handle).
    let body: Buffer | undefined;
    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (hasBody) {
      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
      if (rawBody && rawBody.length > 0) {
        if (rawBody.length > MAX_BODY_BYTES) {
          res
            .status(413)
            .json({ error: 'request_body_too_large', limit: MAX_BODY_BYTES });
          return;
        }
        body = rawBody;
      } else {
        try {
          body = await readBody(req, MAX_BODY_BYTES);
        } catch (e: unknown) {
          const msg = (e as Error).message;
          if (msg === 'body_too_large') {
            res
              .status(413)
              .json({ error: 'request_body_too_large', limit: MAX_BODY_BYTES });
            return;
          }
          res.status(400).json({ error: 'body_read_failed', detail: msg });
          return;
        }
      }
      if (body && body.length > 0)
        outHeaders['content-length'] = String(body.length);
    }

    // Route through the user's selected exit node(s). An explicit country
    // choice must never silently fall back to local egress.
    const routingPreference = await this.nodeSelector.getPreference(fwd.userId);
    const countryOverride = fwd.countryCode ?? undefined;
    const effectiveCountry =
      countryOverride ??
      (routingPreference.mode === 'country'
        ? routingPreference.preferredCountry
        : null);

    const candidates = await this.nodeSelector.selectCandidatesForUser(
      fwd.userId,
      { country: countryOverride ?? null, limit: 3 },
    );

    if (effectiveCountry && !candidates.length) {
      res.status(503).json({
        error: 'selected_country_unavailable',
        message: `No healthy relay is currently available in ${effectiveCountry}`,
      });
      return;
    }

    // In auto mode prefer remote relays over the co-located edge.
    candidates.sort((a, b) => Number(a.isLocal) - Number(b.isLocal));

    let bytesIn = 0;
    let bytesOut = body?.length ?? 0;
    let result: OutboundResult | null = null;
    let usedNode: SelectedNode | null = null;
    let lastError: Error | null = null;

    try {
      for (const node of candidates) {
        try {
          result = node.isLocal
            ? await this.directFetch(finalUrl, req.method, outHeaders, body)
            : await this.relayFetch(node, finalUrl, req.method, outHeaders, body);
          usedNode = node;
          break;
        } catch (err) {
          lastError = err as Error;
          this.logger.warn(
            `forwarder ${fwd.id} (${fwd.slug}) node ${node.id} failed: ${lastError.message}`,
          );
        }
      }

      // No node matched (auto mode): keep the legacy direct/local fallback.
      if (!result && !candidates.length && !effectiveCountry) {
        try {
          result = await this.directFetch(finalUrl, req.method, outHeaders, body);
        } catch (err) {
          lastError = err as Error;
        }
      }

      if (!result) {
        res.status(502).json({
          error: 'all_nodes_failed',
          detail:
            lastError?.message ?? 'no relay node could complete the request',
        });
        return;
      }

      bytesIn = result.bytesIn;
      bytesOut = result.bytesOut;

      res.status(result.status);
      for (const [k, v] of Object.entries(result.headers)) {
        if (v === undefined) continue;
        if (HOP_BY_HOP.has(k.toLowerCase())) continue;
        try {
          res.setHeader(k, Array.isArray(v) ? v.join(', ') : v);
        } catch {
          /* ignore invalid header */
        }
      }
      if (usedNode) {
        res.setHeader('x-proxynet-via-node', String(usedNode.id));
        res.setHeader('x-proxynet-via-country', usedNode.countryCode);
      }
      res.end(result.body);
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`forwarder ${fwd.id} (${fwd.slug}) failed: ${msg}`);
      if (!res.headersSent) {
        res.status(502).json({ error: 'upstream_fetch_failed', detail: msg });
      } else {
        try {
          res.end();
        } catch {
          /* noop */
        }
      }
    } finally {
      // Non-blocking metering + wallet charge
      this.forwarders.recordCall(fwd.id, bytesIn, bytesOut).catch(() => {
        /* logged inside */
      });
      const cost = this.pricing.computeRequestCost(pricing);
      this.wallet.chargeSilently(
        fwd.userId,
        cost,
        'forwarder_call',
        `${req.method} ${finalUrl}`.slice(0, 200),
        {
          forwarderId: fwd.id.toString(),
          bytesIn,
          bytesOut,
          nodeId: usedNode?.id,
        },
      );
    }
  }

  private relayFetch(
    node: SelectedNode,
    finalUrl: string,
    method: string,
    headers: Record<string, string>,
    body?: Buffer,
  ): Promise<OutboundResult> {
    const relayPayload = Buffer.from(
      JSON.stringify({
        url: finalUrl,
        method,
        headers,
        body: body ? body.toString('base64') : undefined,
        isBase64: !!body,
      }),
      'utf8',
    );

    return new Promise<OutboundResult>((resolve, reject) => {
      const relayReq = http.request(
        {
          hostname: node.host,
          port: node.relayPort,
          path: '/fetch',
          method: 'POST',
          timeout: REQUEST_TIMEOUT_MS + 5000,
          headers: {
            'content-type': 'application/json',
            'content-length': String(relayPayload.length),
            'x-node-secret': node.relaySecret,
          },
        },
        (relayRes) => {
          const chunks: Buffer[] = [];
          relayRes.on('data', (c: Buffer) => chunks.push(c));
          relayRes.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (relayRes.statusCode !== 200) {
              reject(
                new Error(
                  `node relay returned HTTP ${relayRes.statusCode}: ${raw.slice(0, 200)}`,
                ),
              );
              return;
            }
            try {
              const envelope = JSON.parse(raw) as {
                status: number;
                headers: Record<string, string>;
                body: string;
                isBase64?: boolean;
                bytesIn: number;
                bytesOut: number;
              };
              resolve({
                status: envelope.status,
                headers: envelope.headers,
                body: Buffer.from(
                  envelope.body ?? '',
                  envelope.isBase64 ? 'base64' : 'utf8',
                ),
                bytesIn: envelope.bytesIn ?? 0,
                bytesOut: envelope.bytesOut ?? 0,
              });
            } catch {
              reject(new Error('node relay returned invalid JSON'));
            }
          });
          relayRes.on('error', reject);
        },
      );
      relayReq.on('error', reject);
      relayReq.on('timeout', () =>
        relayReq.destroy(new Error('relay_timeout')),
      );
      relayReq.write(relayPayload);
      relayReq.end();
    });
  }

  private directFetch(
    finalUrl: string,
    method: string,
    headers: Record<string, string>,
    body?: Buffer,
  ): Promise<OutboundResult> {
    const parsed = new URL(finalUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    return new Promise<OutboundResult>((resolve, reject) => {
      const outReq = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port
            ? parseInt(parsed.port, 10)
            : parsed.protocol === 'https:'
              ? 443
              : 80,
          path: parsed.pathname + parsed.search,
          method,
          headers,
          timeout: REQUEST_TIMEOUT_MS,
        },
        (targetRes) => {
          const chunks: Buffer[] = [];
          let total = 0;
          targetRes.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_BODY_BYTES) {
              outReq.destroy(new Error('response_too_large'));
              return;
            }
            chunks.push(chunk);
          });
          targetRes.on('end', () => {
            resolve({
              status: targetRes.statusCode ?? 502,
              headers: targetRes.headers,
              body: Buffer.concat(chunks),
              bytesIn: total,
              bytesOut: body?.length ?? 0,
            });
          });
          targetRes.on('error', reject);
        },
      );
      outReq.on('error', reject);
      outReq.on('timeout', () => outReq.destroy(new Error('target_timeout')));
      if (body) outReq.write(body);
      outReq.end();
    });
  }
}
