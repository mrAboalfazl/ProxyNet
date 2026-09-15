import {
  Controller,
  All,
  Req,
  Res,
  Param,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { URL } from 'url';
import * as http from 'http';
import * as https from 'https';
import { ForwardersService } from './forwarders.service';
import { NodeSelectorService } from '../routing/node-selector.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../wallet/pricing.service';

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

// SSRF: block internal networks. Same list as GatewayService.
const BLOCKED_HOSTS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./, /^169\.254\./,
  /^::1$/, /^fc[0-9a-f]{2}:/i, /^fd[0-9a-f]{2}:/i, /^fe80:/i,
];
const isBlocked = (host: string) => BLOCKED_HOSTS.some((re) => re.test(host));

// Hop-by-hop headers stripped before forwarding to target.
const HOP_BY_HOP = new Set([
  'host', 'connection', 'content-length', 'transfer-encoding',
  'keep-alive', 'te', 'trailer', 'proxy-authorization', 'proxy-authenticate',
  'upgrade',
]);

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
    const hasBalance = await this.wallet.hasMinBalance(fwd.userId, pricing.minBalanceToman);
    if (!hasBalance) {
      res.status(402).json({
        error: 'insufficient_balance',
        message: 'Wallet is below the minimum balance to make a call. Top up to continue.',
        minBalanceToman: pricing.minBalanceToman.toString(),
      });
      return;
    }

    // Parse the configured target
    let target: URL;
    try {
      target = new URL(fwd.targetUrl);
    } catch {
      res.status(500).json({ error: 'forwarder_misconfigured', detail: 'invalid target URL' });
      return;
    }
    if (isBlocked(target.hostname)) {
      res.status(500).json({ error: 'forwarder_misconfigured', detail: 'target host is blocked' });
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
          res.status(413).json({ error: 'request_body_too_large', limit: MAX_BODY_BYTES });
          return;
        }
        body = rawBody;
      } else {
        try {
          body = await readBody(req, MAX_BODY_BYTES);
        } catch (e: unknown) {
          const msg = (e as Error).message;
          if (msg === 'body_too_large') {
            res.status(413).json({ error: 'request_body_too_large', limit: MAX_BODY_BYTES });
            return;
          }
          res.status(400).json({ error: 'body_read_failed', detail: msg });
          return;
        }
      }
      if (body && body.length > 0) outHeaders['content-length'] = String(body.length);
    }

    // Route through the user's selected exit node, if any (reuses NodeSelector)
    const node = await this.nodeSelector.selectForUser(fwd.userId);

    // Decide the actual outbound call: local direct, or hop through a node's relay
    let bytesIn = 0;
    let bytesOut = body?.length ?? 0;

    try {
      if (node && !node.isLocal) {
        // Hop through the node relay. The relay's /fetch endpoint returns a JSON envelope,
        // so we translate back to a raw response.
        const relayPayload = Buffer.from(JSON.stringify({
          url: finalUrl,
          method: req.method,
          headers: outHeaders,
          body: body?.toString('utf8'),
        }), 'utf8');

        await new Promise<void>((resolve, reject) => {
          const relayReq = http.request({
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
          }, (relayRes) => {
            const chunks: Buffer[] = [];
            relayRes.on('data', (c) => chunks.push(c));
            relayRes.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf8');
              if (relayRes.statusCode !== 200) {
                res.status(502).json({ error: 'upstream_relay_error', status: relayRes.statusCode, detail: raw.slice(0, 200) });
                resolve();
                return;
              }
              try {
                const envelope = JSON.parse(raw) as {
                  status: number;
                  headers: Record<string, string>;
                  body: string;
                  bytesIn: number;
                  bytesOut: number;
                };
                bytesIn = envelope.bytesIn;
                bytesOut = envelope.bytesOut;
                // Forward status + headers + body raw
                res.status(envelope.status);
                for (const [k, v] of Object.entries(envelope.headers)) {
                  if (HOP_BY_HOP.has(k.toLowerCase())) continue;
                  try { res.setHeader(k, v); } catch { /* ignore invalid header */ }
                }
                res.setHeader('x-proxynet-via-node', String(node.id));
                res.setHeader('x-proxynet-via-country', node.countryCode);
                res.end(envelope.body);
              } catch (parseErr) {
                res.status(502).json({ error: 'invalid_relay_response' });
              }
              resolve();
            });
            relayRes.on('error', reject);
          });
          relayReq.on('error', reject);
          relayReq.on('timeout', () => relayReq.destroy(new Error('relay_timeout')));
          relayReq.write(relayPayload);
          relayReq.end();
        });
      } else {
        // Direct fetch (co-located node or no preferred node)
        await new Promise<void>((resolve, reject) => {
          const lib = target.protocol === 'https:' ? https : http;
          const outReq = lib.request({
            hostname: target.hostname,
            port: target.port ? parseInt(target.port, 10) : (target.protocol === 'https:' ? 443 : 80),
            path: new URL(finalUrl).pathname + new URL(finalUrl).search,
            method: req.method,
            headers: outHeaders,
            timeout: REQUEST_TIMEOUT_MS,
          }, (targetRes) => {
            res.status(targetRes.statusCode ?? 502);
            for (const [k, v] of Object.entries(targetRes.headers)) {
              if (HOP_BY_HOP.has(k.toLowerCase())) continue;
              if (v === undefined) continue;
              try { res.setHeader(k, Array.isArray(v) ? v.join(', ') : v); } catch { /* invalid */ }
            }
            if (node?.isLocal) {
              res.setHeader('x-proxynet-via-node', String(node.id));
              res.setHeader('x-proxynet-via-country', node.countryCode);
            }
            targetRes.on('data', (chunk: Buffer) => {
              bytesIn += chunk.length;
              if (bytesIn > MAX_BODY_BYTES) {
                outReq.destroy(new Error('response_too_large'));
                return;
              }
              res.write(chunk);
            });
            targetRes.on('end', () => { res.end(); resolve(); });
            targetRes.on('error', reject);
          });
          outReq.on('error', reject);
          outReq.on('timeout', () => outReq.destroy(new Error('target_timeout')));
          if (body) outReq.write(body);
          outReq.end();
        });
      }
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`forwarder ${fwd.id} (${fwd.slug}) failed: ${msg}`);
      if (!res.headersSent) {
        res.status(502).json({ error: 'upstream_fetch_failed', detail: msg });
      } else {
        // response headers already sent — best effort abort
        try { res.end(); } catch { /* noop */ }
      }
    } finally {
      // Non-blocking metering + wallet charge
      this.forwarders.recordCall(fwd.id, bytesIn, bytesOut).catch(() => { /* logged inside */ });
      const cost = this.pricing.computeCost(bytesIn, bytesOut, pricing);
      this.wallet.chargeSilently(fwd.userId, cost, 'forwarder_call', `${req.method} ${finalUrl}`.slice(0, 200), {
        forwarderId: fwd.id.toString(),
        bytesIn,
        bytesOut,
        nodeId: node?.id,
      });
    }
  }
}
