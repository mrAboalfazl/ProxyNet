#!/usr/bin/env node
/**
 * ProxyNet node-relay
 *
 * A tiny HTTP relay that runs on every proxy node alongside the platform-agent.
 * The central control-plane forwards user requests to this relay, which performs
 * the outbound fetch and returns the response. This is the mechanism that makes
 * "route my traffic through country X" actually happen for the HTTP Gateway path.
 *
 * Config (env vars):
 *   NODE_SECRET   required — same secret the platform-agent uses (from agent.yaml)
 *   RELAY_PORT    default 9443
 *   RELAY_HOST    default 0.0.0.0
 *
 * Install (on the node):
 *   NODE_SECRET=xxxxx pm2 start node-relay/index.js --name node-relay
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { timingSafeEqual } = require('crypto');

const NODE_SECRET = process.env.NODE_SECRET;
const PORT = parseInt(process.env.RELAY_PORT || '9443', 10);
const HOST = process.env.RELAY_HOST || '0.0.0.0';

if (!NODE_SECRET) {
  console.error('[node-relay] FATAL: NODE_SECRET env var is required');
  process.exit(1);
}

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

// SSRF: block the relay from being tricked into scanning its own private network.
const BLOCKED_HOSTS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./, /^169\.254\./,
  /^::1$/, /^fc[0-9a-f]{2}:/i, /^fd[0-9a-f]{2}:/i, /^fe80:/i,
];

function isBlockedHost(hostname) {
  return BLOCKED_HOSTS.some((re) => re.test(hostname));
}

function constantTimeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function doFetch(params) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(params.url); } catch { return reject(new Error('Invalid URL')); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return reject(new Error('Only http/https supported'));
    if (isBlockedHost(parsed.hostname)) return reject(new Error('Blocked destination host'));

    const method = (params.method || 'GET').toUpperCase();
    const requestBody = params.body ? Buffer.from(params.body, 'utf8') : undefined;
    const bytesOut = requestBody ? requestBody.length : 0;

    const safeHeaders = { 'User-Agent': 'ProxyNet-NodeRelay/1.0' };
    for (const [k, v] of Object.entries(params.headers || {})) {
      const lower = k.toLowerCase();
      if (['host', 'connection', 'content-length', 'transfer-encoding',
           'authorization', 'proxy-authorization'].includes(lower)) continue;
      safeHeaders[k] = v;
    }
    if (requestBody) safeHeaders['Content-Length'] = String(requestBody.length);

    const lib = parsed.protocol === 'https:' ? https : http;
    const defaultPort = parsed.protocol === 'https:' ? 443 : 80;

    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : defaultPort,
      path: parsed.pathname + parsed.search,
      method,
      headers: safeHeaders,
      timeout: REQUEST_TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`Response exceeds ${MAX_RESPONSE_BYTES} byte limit`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const outHeaders = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') outHeaders[k] = v;
          else if (Array.isArray(v)) outHeaders[k] = v.join(', ');
        }
        resolve({ status: res.statusCode || 200, headers: outHeaders, body, bytesIn: total, bytesOut });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out after 30s')));
    if (requestBody) req.write(requestBody);
    req.end();
  });
}

function readJsonBody(req, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) { req.destroy(); reject(new Error('Body too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Relay', 'proxynet-node');

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/fetch') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const provided = req.headers['x-node-secret'];
  if (!provided || typeof provided !== 'string' || !constantTimeEqual(provided, NODE_SECRET)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid node secret' }));
    return;
  }

  let payload;
  try { payload = await readJsonBody(req); }
  catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  if (!payload.url) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'url is required' }));
    return;
  }

  try {
    const result = await doFetch(payload);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message || 'fetch failed' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[node-relay] listening on ${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[node-relay] ${sig} — shutting down`);
    server.close(() => process.exit(0));
  });
}
