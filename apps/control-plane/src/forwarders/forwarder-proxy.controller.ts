import {
  Controller,
  All,
  Req,
  Res,
  Param,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { URL } from 'url';
import * as http from 'http';
import * as https from 'https';
import { ForwardersService } from './forwarders.service';
import {
  NodeSelectorService,
  SelectedNode,
} from '../routing/node-selector.service';
import { UpstreamsService } from '../upstreams/upstreams.service';
import type { SelectedUpstreamCandidate } from '../upstreams/upstreams.types';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../wallet/pricing.service';
import { redactUrl } from '../common/redact';

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 45_000;
const STREAM_IDLE_TIMEOUT_MS = 300_000; // 5 min for long AI reasoning streams

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

// Client-identifying proxy headers stripped outbound so targets (e.g. OpenAI,
// Cloudflare, api.ipify.org) only see the WireGuard/relay exit IP and never the
// caller's origin IP.
const STRIPPED_OUTBOUND_HEADERS = new Set([
  'x-forwarded-for',
  'x-real-ip',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-by',
  'forwarded',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'true-client-ip',
  'x-client-ip',
  'x-cluster-client-ip',
  'via',
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
    @Optional() private readonly upstreams?: UpstreamsService,
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

    // Build outbound headers (strip hop-by-hop + client-identifying proxy headers, respect forwardAuthHeader flag)
    const outHeaders: Record<string, string> = { host: target.host };
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (HOP_BY_HOP.has(lower) || STRIPPED_OUTBOUND_HEADERS.has(lower)) continue;
      if (lower === 'authorization' && !fwd.forwardAuthHeader) continue;
      if (v === undefined) continue;
      outHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }

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

    const fwdRoutingMode = (fwd as { routingMode?: string }).routingMode ?? 'auto';
    const fwdTunnelId = (fwd as { upstreamTunnelId?: bigint | null }).upstreamTunnelId ?? null;
    const fwdStreaming = (fwd as { streamingEnabled?: boolean }).streamingEnabled ?? true;

    let bytesIn = 0;
    let bytesOut = body?.length ?? 0;
    let usedNode: SelectedNode | null = null;
    let usedTunnel: SelectedUpstreamCandidate | null = null;

    // ── Mode 1: Direct / Local egress (no tunnel, no relay) ──────────────────
    if (fwdRoutingMode === 'direct') {
      try {
        if (fwdStreaming) {
          const streamed = await this.directStream(
            finalUrl,
            req.method,
            outHeaders,
            body,
            res,
          );
          bytesIn = streamed.bytesIn;
          bytesOut = streamed.bytesOut;
        } else {
          const directRes = await this.directFetch(
            finalUrl,
            req.method,
            outHeaders,
            body,
          );
          bytesIn = directRes.bytesIn;
          bytesOut = directRes.bytesOut;
          this.writeBufferedResponse(res, directRes);
        }
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.warn(`forwarder ${fwd.id} (${fwd.slug}) direct failed: ${msg}`);
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
        this.recordBillingAndStats(
          fwd,
          pricing,
          req.method,
          finalUrl,
          bytesIn,
          bytesOut,
          undefined,
          undefined,
        );
      }
      return;
    }

    // Route through the user's selected upstream tunnel(s) or exit node(s).
    // An explicit country/node/tunnel choice must never silently fall back to local egress.
    const routingPreference = await this.nodeSelector.getPreference(fwd.userId);
    const countryCodes = fwd.countryCodes?.length
      ? fwd.countryCodes
      : fwd.countryCode
        ? [fwd.countryCode]
        : [];
    const effectiveCountries = countryCodes.length
      ? countryCodes
      : routingPreference.mode === 'country' &&
          routingPreference.preferredCountry
        ? [routingPreference.preferredCountry]
        : [];

    // ── Mode 2: Streaming Upstream Tunnels (WireGuard / AmneziaWG / SOCKS5) ──
    if (this.upstreams && !fwd.exitNodeId) {
      const upstreamCandidates = await this.upstreams.selectCandidatesForUser(
        fwd.userId,
        {
          tunnelId: fwdTunnelId,
          countries: fwdTunnelId
            ? null
            : effectiveCountries.length
              ? effectiveCountries
              : null,
          limit: 3,
        },
      );

      if ((fwdTunnelId || fwdRoutingMode === 'tunnel') && !upstreamCandidates.length) {
        res.status(503).json({
          error: 'selected_tunnel_unavailable',
          message:
            'The selected upstream WireGuard/SOCKS5 tunnel is unavailable or disabled',
        });
        return;
      }

      if (upstreamCandidates.length > 0) {
        let streamedOk = false;
        let lastStreamError: Error | null = null;

        for (const candidate of upstreamCandidates) {
          try {
            const stats = await this.streamViaUpstream(
              candidate,
              finalUrl,
              req.method,
              outHeaders,
              body,
              res,
            );
            bytesIn = stats.bytesIn;
            bytesOut = stats.bytesOut;
            usedTunnel = candidate;
            streamedOk = true;
            break;
          } catch (err) {
            lastStreamError = err as Error;
            this.upstreams.markFailed(candidate.tunnelId);
            this.logger.warn(
              `forwarder ${fwd.id} (${fwd.slug}) upstream tunnel ${candidate.tunnelId} (${candidate.label}) failed: ${lastStreamError.message}`,
            );
            // If response headers were already flushed to client, cannot fail over cleanly.
            if (res.headersSent) {
              break;
            }
          }
        }

        if (streamedOk || res.headersSent) {
          if (usedTunnel) {
            this.upstreams
              .recordUsage(usedTunnel.tunnelId, bytesIn, bytesOut)
              .catch(() => {
                /* best-effort */
              });
          }
          if (!streamedOk && res.headersSent) {
            try {
              res.end();
            } catch {
              /* noop */
            }
          }
          this.recordBillingAndStats(
            fwd,
            pricing,
            req.method,
            finalUrl,
            bytesIn,
            bytesOut,
            usedTunnel?.hostNodeId ?? undefined,
            usedTunnel?.tunnelId,
          );
          return;
        }

        // If user explicitly pinned a tunnel, fail closed (do not fall back to legacy relay).
        if (fwdTunnelId || fwdRoutingMode === 'tunnel') {
          res.status(502).json({
            error: 'all_upstreams_failed',
            detail:
              lastStreamError?.message ??
              'no upstream tunnel could complete the request',
          });
          this.recordBillingAndStats(
            fwd,
            pricing,
            req.method,
            finalUrl,
            0,
            bytesOut,
            undefined,
            undefined,
          );
          return;
        }

        // Otherwise (auto / country mode), seamlessly fall through to Mode 3 (node-relay)
        // so existing forwarders (e.g. Telegram) remain unaffected if upstream tunnels fail.
        this.logger.warn(
          `forwarder ${fwd.id} (${fwd.slug}) all upstream tunnels failed pre-header; falling back to node-relay`,
        );
      }
    }

    // ── Mode 3: Legacy Exit Node Relay path (backward compatibility) ─────────
    const candidates = await this.nodeSelector.selectCandidatesForUser(
      fwd.userId,
      {
        nodeId: fwd.exitNodeId?.toString(),
        countries: fwd.exitNodeId ? null : countryCodes.length ? countryCodes : null,
        limit: 3,
      },
    );

    if ((fwd.exitNodeId || effectiveCountries.length) && !candidates.length) {
      res.status(503).json({
        error: fwd.exitNodeId ? 'selected_node_unavailable' : 'selected_country_unavailable',
        message: fwd.exitNodeId ? 'The selected node is unavailable or no longer accessible' : `No healthy relay is currently available in ${effectiveCountries.join(', ')}`,
      });
      return;
    }

    // In auto mode prefer remote relays over the co-located edge.
    candidates.sort((a, b) => Number(a.isLocal) - Number(b.isLocal));

    let result: OutboundResult | null = null;
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
      if (!result && !candidates.length && !effectiveCountries.length && !fwd.exitNodeId) {
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
      this.writeBufferedResponse(res, result, usedNode);
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
      this.recordBillingAndStats(
        fwd,
        pricing,
        req.method,
        finalUrl,
        bytesIn,
        bytesOut,
        usedNode?.id,
        undefined,
      );
    }
  }

  private writeBufferedResponse(
    res: Response,
    result: OutboundResult,
    usedNode?: SelectedNode | null,
  ) {
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
  }

  private recordBillingAndStats(
    fwd: { id: bigint; userId: bigint },
    pricing: Awaited<ReturnType<PricingService['get']>>,
    method: string,
    finalUrl: string,
    bytesIn: number,
    bytesOut: number,
    nodeId?: number,
    tunnelId?: number,
  ) {
    this.forwarders.recordCall(fwd.id, bytesIn, bytesOut).catch(() => {
      /* logged inside */
    });
    const cost = this.pricing.computeRequestCost(pricing);
    this.wallet.chargeSilently(
      fwd.userId,
      cost,
      'forwarder_call',
      `${method} ${redactUrl(finalUrl)}`.slice(0, 200),
      {
        forwarderId: fwd.id.toString(),
        bytesIn,
        bytesOut,
        ...(nodeId !== undefined ? { nodeId } : {}),
        ...(tunnelId !== undefined ? { tunnelId } : {}),
      },
    );
  }

  /**
   * Zero-buffer HTTP/SSE streaming through a host node's Go amneziawg-go/SOCKS5 engine.
   * Rejects BEFORE writing response headers if the tunnel engine fails to reach target,
   * enabling seamless automatic failover to the next candidate tunnel.
   */
  private streamViaUpstream(
    candidate: SelectedUpstreamCandidate,
    finalUrl: string,
    method: string,
    headers: Record<string, string>,
    body: Buffer | undefined,
    clientRes: Response,
  ): Promise<{ bytesIn: number; bytesOut: number }> {
    const useHttps =
      process.env.TUNNEL_PROXY_TLS === 'true' && !candidate.isLocal;
    const lib = useHttps ? https : http;
    const bytesOut = body?.length ?? 0;

    return new Promise((resolve, reject) => {
      let settled = false;
      let bytesIn = 0;

      const engineHeaders: Record<string, string> = {
        'x-node-secret': candidate.proxySecret,
        'x-proxynet-tunnel-id': String(candidate.tunnelId),
        'x-proxynet-target-url': finalUrl,
        'x-proxynet-target-method': method,
        'x-proxynet-target-headers': JSON.stringify(headers),
      };
      if (body && body.length > 0) {
        engineHeaders['content-length'] = String(body.length);
      }

      const engineReq = lib.request(
        {
          hostname: candidate.proxyHost,
          port: candidate.proxyPort,
          path: '/stream',
          method: 'POST',
          headers: engineHeaders,
          timeout: STREAM_IDLE_TIMEOUT_MS,
        },
        (engineRes) => {
          // If the Go tunnel engine itself errored before getting a response from target,
          // read the brief error message and reject so caller can fail over to the next tunnel.
          if (engineRes.headers['x-proxynet-engine-error'] === '1') {
            const errChunks: Buffer[] = [];
            engineRes.on('data', (c: Buffer) => errChunks.push(c));
            engineRes.on('end', () => {
              if (!settled) {
                settled = true;
                const detail =
                  Buffer.concat(errChunks).toString('utf8').slice(0, 250) ||
                  `engine HTTP ${engineRes.statusCode}`;
                reject(new Error(detail));
              }
            });
            engineRes.on('error', (err) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            });
            return;
          }

          clientRes.status(engineRes.statusCode ?? 502);
          for (const [k, v] of Object.entries(engineRes.headers)) {
            if (v === undefined) continue;
            const lower = k.toLowerCase();
            if (
              HOP_BY_HOP.has(lower) ||
              lower.startsWith('x-proxynet-engine-')
            ) {
              continue;
            }
            try {
              clientRes.setHeader(k, Array.isArray(v) ? v.join(', ') : v);
            } catch {
              /* ignore invalid header */
            }
          }
          clientRes.setHeader('x-accel-buffering', 'no');
          clientRes.setHeader('x-proxynet-via-tunnel', String(candidate.tunnelId));
          clientRes.setHeader('x-proxynet-via-protocol', candidate.protocol);
          clientRes.setHeader('x-proxynet-via-country', candidate.countryCode);
          if (typeof clientRes.flushHeaders === 'function') {
            clientRes.flushHeaders();
          }

          const onClientClose = () => {
            engineReq.destroy();
          };
          clientRes.once?.('close', onClientClose);

          engineRes.on('data', (chunk: Buffer) => {
            bytesIn += chunk.length;
            clientRes.write(chunk);
          });
          engineRes.on('end', () => {
            clientRes.off?.('close', onClientClose);
            if (!clientRes.writableEnded) {
              clientRes.end();
            }
            if (!settled) {
              settled = true;
              resolve({ bytesIn, bytesOut });
            }
          });
          engineRes.on('error', (err) => {
            clientRes.off?.('close', onClientClose);
            if (!settled) {
              settled = true;
              reject(err);
            }
          });
        },
      );

      engineReq.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      engineReq.on('timeout', () => {
        engineReq.destroy(new Error('upstream_stream_timeout'));
      });

      if (body && body.length > 0) {
        engineReq.write(body);
      }
      engineReq.end();
    });
  }

  /**
   * Direct zero-buffer HTTP/SSE streaming from the local server (routingMode = 'direct').
   */
  private directStream(
    finalUrl: string,
    method: string,
    headers: Record<string, string>,
    body: Buffer | undefined,
    clientRes: Response,
  ): Promise<{ bytesIn: number; bytesOut: number }> {
    const parsed = new URL(finalUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const bytesOut = body?.length ?? 0;

    return new Promise((resolve, reject) => {
      let settled = false;
      let bytesIn = 0;

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
          timeout: STREAM_IDLE_TIMEOUT_MS,
        },
        (targetRes) => {
          clientRes.status(targetRes.statusCode ?? 502);
          for (const [k, v] of Object.entries(targetRes.headers)) {
            if (v === undefined) continue;
            if (HOP_BY_HOP.has(k.toLowerCase())) continue;
            try {
              clientRes.setHeader(k, Array.isArray(v) ? v.join(', ') : v);
            } catch {
              /* ignore */
            }
          }
          clientRes.setHeader('x-accel-buffering', 'no');
          clientRes.setHeader('x-proxynet-via-mode', 'direct');
          if (typeof clientRes.flushHeaders === 'function') {
            clientRes.flushHeaders();
          }

          const onClientClose = () => outReq.destroy();
          clientRes.once?.('close', onClientClose);

          targetRes.on('data', (chunk: Buffer) => {
            bytesIn += chunk.length;
            clientRes.write(chunk);
          });
          targetRes.on('end', () => {
            clientRes.off?.('close', onClientClose);
            if (!clientRes.writableEnded) {
              clientRes.end();
            }
            if (!settled) {
              settled = true;
              resolve({ bytesIn, bytesOut });
            }
          });
          targetRes.on('error', (err) => {
            clientRes.off?.('close', onClientClose);
            if (!settled) {
              settled = true;
              reject(err);
            }
          });
        },
      );

      outReq.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      outReq.on('timeout', () => outReq.destroy(new Error('target_timeout')));
      if (body && body.length > 0) outReq.write(body);
      outReq.end();
    });
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
        timeoutMs: 40_000,
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
