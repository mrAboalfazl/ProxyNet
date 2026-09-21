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
const net = require('net');
const dgram = require('dgram');
const dns = require('dns').promises;
const fs = require('fs');
const { URL } = require('url');
const { timingSafeEqual, randomUUID } = require('crypto');

function readAgentConfig() {
  try {
    return JSON.parse(fs.readFileSync(process.env.AGENT_CONFIG_PATH || '/etc/proxynet/agent.json', 'utf8'));
  } catch {
    return {};
  }
}

const agentConfig = readAgentConfig();
const NODE_SECRET = process.env.NODE_SECRET || agentConfig.node_secret;
const NODE_ID = process.env.NODE_ID || agentConfig.node_id;
const CONTROL_PLANE_URL = (process.env.CONTROL_PLANE_URL || agentConfig.control_endpoint || '').replace(/\/$/, '');
const PORT = parseInt(process.env.RELAY_PORT || '9443', 10);
const HOST = process.env.RELAY_HOST || '0.0.0.0';
const SOCKS_PORT = parseInt(process.env.SOCKS_PORT || '1080', 10);
const SOCKS_HOST = process.env.SOCKS_HOST || '0.0.0.0';

if (!NODE_SECRET) {
  console.error('[node-relay] FATAL: NODE_SECRET env var is required');
  process.exit(1);
}

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const SOCKS_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

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

// SOCKS5 is deliberately a separate listener from the private HTTP relay. It
// accepts only username/password authentication, verifies every new connection
// with the control plane, blocks private destinations, and reports byte usage.
const SOCKS_VERSION = 0x05;
const SOCKS_AUTH_VERSION = 0x01;
const SOCKS_METHOD_USERPASS = 0x02;
const activeSocksConnections = new Map();

function isBlockedAddress(address) {
  const value = address.toLowerCase();
  return BLOCKED_HOSTS.some((re) => re.test(value)) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(value) ||
    /^(19[2-9]|2[0-5]\d)\./.test(value) ||
    /^2(2[4-9]|3\d|4\d|5[0-5])\./.test(value) ||
    value === '::' || value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') || value.startsWith('::ffff:192.168.') ||
    value.startsWith('::ffff:172.');
}

async function resolveDestinations(host) {
  if (isBlockedHost(host)) throw new Error('blocked destination host');
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error('blocked destination address');
    return [{ address: host, family: net.isIP(host) }];
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  const publicAddresses = addresses.filter((entry) => !isBlockedAddress(entry.address));
  if (publicAddresses.length === 0) throw new Error('destination resolves only to private addresses');

  // Prefer IPv4 when both families are available. Some nodes have an AAAA
  // record but no working IPv6 route; the TCP connector still falls back to
  // the remaining addresses if the preferred family is unavailable.
  return publicAddresses.sort((a, b) => a.family - b.family);
}

async function resolveDestination(host) {
  return (await resolveDestinations(host))[0];
}

function socksReply(socket, code) {
  socket.write(Buffer.from([SOCKS_VERSION, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
}

function parseUdpPacket(packet) {
  if (packet.length < 4 || packet.readUInt16BE(0) !== 0 || packet.readUInt8(2) !== 0) return null;
  const type = packet[3]; let offset = 4; let host;
  if (type === 1) { if (packet.length < offset + 4) return null; host = Array.from(packet.subarray(offset, offset + 4)).join('.'); offset += 4; }
  else if (type === 3) { const length = packet[offset]; if (!length || packet.length < offset + 1 + length) return null; host = packet.subarray(offset + 1, offset + 1 + length).toString('utf8'); offset += 1 + length; }
  else if (type === 4) { if (packet.length < offset + 16) return null; host = ipv6FromBuffer(packet.subarray(offset, offset + 16)); offset += 16; }
  else return null;
  if (packet.length < offset + 2) return null;
  return { host, port: packet.readUInt16BE(offset), payload: packet.subarray(offset + 2) };
}

function udpEnvelope(host, port, payload) {
  const ip = net.isIP(host);
  if (ip === 4) return Buffer.concat([Buffer.from([0, 0, 0, 1]), Buffer.from(host.split('.').map(Number)), Buffer.from([(port >> 8) & 255, port & 255]), payload]);
  return Buffer.concat([Buffer.from([0, 0, 0, 3, host.length]), Buffer.from(host), Buffer.from([(port >> 8) & 255, port & 255]), payload]);
}

function startUdpAssociate(controlSocket, context) {
  const udp = dgram.createSocket('udp4');
  const upstream = dgram.createSocket('udp4');
  let clientAddress = controlSocket.remoteAddress?.replace(/^::ffff:/, '');
  let clientPort = null; let bytesIn = 0; let bytesOut = 0; let closed = false;
  const startedAt = Date.now();
  const close = () => { if (closed) return; closed = true; try { udp.close(); } catch {} try { upstream.close(); } catch {} void reportSocksUsage(context, 'udp-associate', bytesIn, bytesOut, startedAt, 'udp_flow'); };
  const enforce = (size, inbound) => { context.bytesRemaining -= BigInt(size); if (inbound) bytesIn += size; else bytesOut += size; return context.bytesRemaining >= 0n; };
  udp.on('message', async (packet, peer) => {
    if (clientAddress && peer.address !== clientAddress) return;
    if (!clientPort) clientPort = peer.port;
    if (peer.port !== clientPort) return;
    const request = parseUdpPacket(packet); if (!request || request.payload.length === 0) return;
    try {
      const resolved = await resolveDestination(request.host);
      if (!enforce(request.payload.length, false)) return close();
      upstream.send(request.payload, request.port, resolved.address);
    } catch { /* malformed/private destinations are silently dropped for UDP */ }
  });
  upstream.on('message', (payload, peer) => {
    if (!clientAddress || !clientPort || closed || !enforce(payload.length, true)) return;
    udp.send(udpEnvelope(peer.address, peer.port, payload), clientPort, clientAddress);
  });
  udp.once('error', close); controlSocket.once('close', close); controlSocket.once('error', close);
  udp.bind(0, SOCKS_HOST, () => { const address = udp.address(); controlSocket.write(Buffer.from([SOCKS_VERSION, 0, 0, 1, 0, 0, 0, 0, (address.port >> 8) & 255, address.port & 255])); });
  udp.unref();
}

async function controlRequest(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${CONTROL_PLANE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NODE_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`control plane returned ${response.status}`);
    if (response.status === 204) return undefined;
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function registerRelayCredential() {
  if (!CONTROL_PLANE_URL || !NODE_ID) return;
  try {
    await controlRequest(`/api/nodes/${encodeURIComponent(NODE_ID)}/relay-register`, {});
    console.log('[node-relay] relay credential registered');
  } catch (error) {
    console.warn(`[node-relay] relay credential registration failed: ${error.message}`);
  }
}

void registerRelayCredential();
setInterval(() => void registerRelayCredential(), 5 * 60 * 1000).unref();

async function authorizeSocksCredential(username, password) {
  if (!CONTROL_PLANE_URL || !NODE_ID) throw new Error('SOCKS5 is not configured with a control plane endpoint');
  const result = await controlRequest(`/api/nodes/${encodeURIComponent(NODE_ID)}/credential-verify`, {
    uuid: username,
    secret: password,
  });
  if (!result.allowed || !result.quotaToken) throw new Error(result.reason || 'credential rejected');
  return result.quotaToken;
}

function reportSocksUsage(context, destination, bytesIn, bytesOut, startedAt, eventType = 'tcp_session') {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  return controlRequest(`/api/nodes/${encodeURIComponent(NODE_ID)}/usage-events`, {
    userId: context.userId,
    sessionId: context.sessionId,
    eventType,
    protocol: 'socks5',
    credentialUuid: context.credentialUuid,
    bytesIn: String(bytesIn),
    bytesOut: String(bytesOut),
    sessionSeconds: seconds,
    destination,
  }).catch((error) => console.warn(`[socks5] usage report failed: ${error.message}`));
}

function ipv6FromBuffer(value) {
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(value.readUInt16BE(i).toString(16));
  return groups.join(':');
}

function createSocksConnection(socket) {
  let buffer = Buffer.alloc(0);
  let stage = 'greeting';
  let authorizing = false;
  let context = null;

  socket.setNoDelay(true);
  socket.setTimeout(SOCKS_IDLE_TIMEOUT_MS, () => socket.destroy());
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    // Once CONNECT has succeeded, the socket is piped directly to the
    // destination. Do not append application bytes to the SOCKS parser buffer.
    if (stage === 'streaming') return;
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  });

  function closeWithAuthFailure() {
    socket.write(Buffer.from([SOCKS_AUTH_VERSION, 0x01]));
    socket.end();
  }

  function processBuffer() {
    if (authorizing || socket.destroyed) return;

    if (stage === 'greeting') {
      if (buffer.length < 2) return;
      const version = buffer[0];
      const methodCount = buffer[1];
      if (buffer.length < 2 + methodCount) return;
      const methods = buffer.subarray(2, 2 + methodCount);
      buffer = buffer.subarray(2 + methodCount);
      if (version !== SOCKS_VERSION || methods.includes(SOCKS_METHOD_USERPASS) === false) {
        socket.write(Buffer.from([SOCKS_VERSION, 0xff]));
        socket.end();
        return;
      }
      socket.write(Buffer.from([SOCKS_VERSION, SOCKS_METHOD_USERPASS]));
      stage = 'authentication';
    }

    if (stage === 'authentication') {
      if (buffer.length < 2) return;
      const usernameLength = buffer[1];
      if (buffer.length < 3 + usernameLength) return;
      const passwordLengthIndex = 2 + usernameLength;
      const passwordLength = buffer[passwordLengthIndex];
      if (buffer.length < passwordLengthIndex + 1 + passwordLength) return;
      if (buffer[0] !== SOCKS_AUTH_VERSION || usernameLength === 0 || passwordLength === 0) {
        closeWithAuthFailure();
        return;
      }
      const username = buffer.subarray(2, 2 + usernameLength).toString('utf8');
      const password = buffer.subarray(passwordLengthIndex + 1, passwordLengthIndex + 1 + passwordLength).toString('utf8');
      buffer = buffer.subarray(passwordLengthIndex + 1 + passwordLength);
      authorizing = true;
      authorizeSocksCredential(username, password)
        .then((quotaToken) => {
          context = {
            userId: quotaToken.userId,
            sessionId: randomUUID(),
            bytesRemaining: BigInt(quotaToken.bytesRemaining),
            credentialUuid: username,
          };
          const active = activeSocksConnections.get(username) || 0;
          if (active >= quotaToken.connsRemaining) {
            closeWithAuthFailure();
            return;
          }
          activeSocksConnections.set(username, active + 1);
          socket.once('close', () => {
            const remaining = (activeSocksConnections.get(username) || 1) - 1;
            if (remaining > 0) activeSocksConnections.set(username, remaining);
            else activeSocksConnections.delete(username);
          });
          socket.write(Buffer.from([SOCKS_AUTH_VERSION, 0x00]));
          stage = 'request';
          authorizing = false;
          processBuffer();
        })
        .catch(() => closeWithAuthFailure());
      return;
    }

    if (stage !== 'request') return;
    if (buffer.length < 4) return;
    const [version, command, reserved, addressType] = buffer;
    if (version !== SOCKS_VERSION || reserved !== 0x00 || ![0x01, 0x03].includes(command)) {
      socksReply(socket, command === 0x01 || command === 0x03 ? 0x01 : 0x07);
      socket.end();
      return;
    }

    let host;
    let offset = 4;
    if (addressType === 0x01) {
      if (buffer.length < offset + 4 + 2) return;
      host = Array.from(buffer.subarray(offset, offset + 4)).join('.');
      offset += 4;
    } else if (addressType === 0x03) {
      if (buffer.length < offset + 1) return;
      const length = buffer[offset];
      if (buffer.length < offset + 1 + length + 2 || length === 0) return;
      host = buffer.subarray(offset + 1, offset + 1 + length).toString('utf8');
      offset += 1 + length;
    } else if (addressType === 0x04) {
      if (buffer.length < offset + 16 + 2) return;
      host = ipv6FromBuffer(buffer.subarray(offset, offset + 16));
      offset += 16;
    } else {
      socksReply(socket, 0x08);
      socket.end();
      return;
    }
    const port = buffer.readUInt16BE(offset);
    buffer = buffer.subarray(offset + 2);
    if (command === 0x03) { startUdpAssociate(socket, context); stage = 'udp'; return; }
    stage = 'connecting';
    connectSocksDestination(socket, context, host, port, () => {
      // A client is allowed to pipeline bytes after the CONNECT request. Keep
      // those bytes until the upstream TCP connection is ready instead of
      // silently dropping the beginning of an SSH handshake.
      const pending = buffer;
      buffer = Buffer.alloc(0);
      stage = 'streaming';
      return pending;
    });
  }
}

async function connectSocksDestination(client, context, host, port, takePendingData) {
  const destination = `${host}:${port}`;
  let resolvedAddresses;
  try {
    resolvedAddresses = await resolveDestinations(host);
  } catch (error) {
    console.warn(`[socks5] blocked destination ${destination}: ${error.message}`);
    socksReply(client, 0x02);
    client.end();
    return;
  }

  let bytesIn = 0;
  let bytesOut = 0;
  let completed = false;
  let upstream;
  let connected = false;
  let startedAt = Date.now();

  function finish() {
    if (completed) return;
    completed = true;
    void reportSocksUsage(context, destination, bytesIn, bytesOut, startedAt);
  }

  function enforceQuota(size, inbound) {
    context.bytesRemaining -= BigInt(size);
    if (inbound) bytesIn += size;
    else bytesOut += size;
    if (context.bytesRemaining < 0n) {
      client.destroy();
      upstream?.destroy();
      return false;
    }
    return true;
  }

  function failBeforeConnect() {
    if (!client.destroyed) {
      socksReply(client, 0x05);
      client.end();
    }
  }

  function connectNext(index) {
    if (index >= resolvedAddresses.length) {
      failBeforeConnect();
      return;
    }

    const resolved = resolvedAddresses[index];
    const candidate = net.createConnection({ host: resolved.address, port, family: resolved.family });
    let attemptFinished = false;

    const retry = () => {
      if (attemptFinished || connected) return;
      attemptFinished = true;
      candidate.destroy();
      connectNext(index + 1);
    };

    candidate.setTimeout(REQUEST_TIMEOUT_MS, () => retry());
    candidate.once('connect', () => {
      if (attemptFinished) return;
      attemptFinished = true;
      connected = true;
      upstream = candidate;
      candidate.setNoDelay(true);
      startedAt = Date.now();
      candidate.setTimeout(SOCKS_IDLE_TIMEOUT_MS, () => candidate.destroy());

      if (client.destroyed) {
        candidate.destroy();
        return;
      }

      const pending = takePendingData();
      if (pending.length > 0 && !enforceQuota(pending.length, false)) return;

      socksReply(client, 0x00);
      client.on('data', (chunk) => enforceQuota(chunk.length, false));
      candidate.on('data', (chunk) => enforceQuota(chunk.length, true));

      // Write pipelined bytes before attaching the pipe so the beginning of
      // an SSH protocol exchange keeps its original order.
      if (pending.length > 0) candidate.write(pending);
      client.pipe(candidate);
      candidate.pipe(client);
    });
    candidate.once('error', (error) => {
      if (!connected) {
        console.warn(`[socks5] connect failed ${destination} via ${resolved.address}: ${error.code || error.message}`);
        retry();
      } else {
        candidate.destroy();
      }
    });
    candidate.once('close', () => {
      if (!connected) retry();
      else {
        client.destroy();
        finish();
      }
    });
  }

  client.once('close', () => { upstream?.destroy(); finish(); });
  connectNext(0);
}

if (CONTROL_PLANE_URL && NODE_ID && Number.isInteger(SOCKS_PORT) && SOCKS_PORT > 0 && SOCKS_PORT < 65536) {
  const socksServer = net.createServer(createSocksConnection);
  socksServer.on('error', (error) => console.error(`[socks5] server error: ${error.message}`));
  socksServer.listen(SOCKS_PORT, SOCKS_HOST, () => {
    console.log(`[socks5] listening on ${SOCKS_HOST}:${SOCKS_PORT}`);
  });
} else {
  console.warn('[socks5] disabled: missing node ID/control-plane URL or invalid SOCKS_PORT');
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[node-relay] ${sig} — shutting down`);
    server.close(() => process.exit(0));
  });
}
