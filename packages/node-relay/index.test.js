const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  return port;
}

function readChunk(socket) {
  return new Promise((resolve, reject) => {
    socket.once('data', resolve);
    socket.once('error', reject);
  });
}

test('SOCKS5 requires credentials and rejects private destinations', async (t) => {
  const control = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer node-secret');
    if (req.url === '/api/nodes/1/relay-register') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.url === '/api/nodes/1/usage-events') {
      res.statusCode = 202;
      res.end(JSON.stringify({ accepted: true }));
      return;
    }
    assert.equal(req.url, '/api/nodes/1/credential-verify');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      allowed: true,
      quotaToken: { userId: '7', bytesRemaining: '1024', connsRemaining: 1 },
    }));
  });
  control.listen(0, '127.0.0.1');
  await once(control, 'listening');
  const controlPort = control.address().port;
  const socksPort = await freePort();
  const relayPort = await freePort();
  const relay = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: {
      ...process.env,
      NODE_SECRET: 'node-secret',
      NODE_ID: '1',
      CONTROL_PLANE_URL: `http://127.0.0.1:${controlPort}`,
      SOCKS_HOST: '127.0.0.1',
      SOCKS_PORT: String(socksPort),
      RELAY_HOST: '127.0.0.1',
      RELAY_PORT: String(relayPort),
    },
  });
  t.after(() => {
    relay.kill('SIGTERM');
    control.close();
  });

  await new Promise((resolve, reject) => {
    relay.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('[socks5] listening')) resolve();
    });
    relay.once('error', reject);
    relay.once('exit', (code) => reject(new Error(`relay exited early: ${code}`)));
  });

  const client = net.createConnection({ host: '127.0.0.1', port: socksPort });
  t.after(() => client.destroy());
  await once(client, 'connect');

  client.write(Buffer.from([0x05, 0x01, 0x02]));
  assert.deepEqual(await readChunk(client), Buffer.from([0x05, 0x02]));

  const username = Buffer.from('credential-uuid');
  const password = Buffer.from('credential-secret');
  client.write(Buffer.concat([Buffer.from([0x01, username.length]), username, Buffer.from([password.length]), password]));
  assert.deepEqual(await readChunk(client), Buffer.from([0x01, 0x00]));

  // Connecting to localhost must be denied so a SOCKS user cannot reach node-local services.
  client.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0, 80]));
  const denied = await readChunk(client);
  assert.equal(denied[1], 0x02);
});

test('SOCKS5 reauthorizes new connections and closes an existing session after access withdrawal', { timeout: 30000 }, async (t) => {
  let allowed = true;
  let authChecks = 0;
  let quotaChecks = 0;
  const control = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer node-secret');
    if (req.url === '/api/nodes/1/relay-register') { res.writeHead(204).end(); return; }
    if (req.url === '/api/nodes/1/quota/credential-uuid') {
      assert.equal(req.method, 'GET');
      quotaChecks += 1;
      res.end(JSON.stringify({ hasQuota: allowed }));
      return;
    }
    assert.equal(req.url, '/api/nodes/1/credential-verify');
    authChecks += 1;
    res.end(JSON.stringify({ allowed, quotaToken: allowed ? { userId: '7', bytesRemaining: '1024', connsRemaining: 10 } : undefined }));
  });
  control.listen(0, '127.0.0.1');
  await once(control, 'listening');
  const socksPort = await freePort();
  const relayPort = await freePort();
  const relay = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: { ...process.env, NODE_SECRET: 'node-secret', NODE_ID: '1', CONTROL_PLANE_URL: `http://127.0.0.1:${control.address().port}`, SOCKS_HOST: '127.0.0.1', SOCKS_PORT: String(socksPort), RELAY_HOST: '127.0.0.1', RELAY_PORT: String(relayPort) },
  });
  const clients = [];
  t.after(() => { for (const client of clients) client.destroy(); relay.kill('SIGTERM'); control.closeAllConnections(); control.close(); });
  await new Promise((resolve, reject) => {
    relay.stdout.on('data', (chunk) => { if (chunk.toString().includes('[socks5] listening')) resolve(); });
    relay.once('error', reject);
    relay.once('exit', (code) => reject(new Error(`relay exited early: ${code}`)));
  });
  async function authenticate() {
    const client = net.createConnection({ host: '127.0.0.1', port: socksPort });
    clients.push(client);
    await once(client, 'connect');
    client.write(Buffer.from([5, 1, 2]));
    assert.deepEqual(await readChunk(client), Buffer.from([5, 2]));
    const username = Buffer.from('credential-uuid');
    const password = Buffer.from('credential-secret');
    client.write(Buffer.concat([Buffer.from([1, username.length]), username, Buffer.from([password.length]), password]));
    return { client, reply: await readChunk(client) };
  }
  const first = await authenticate();
  assert.deepEqual(first.reply, Buffer.from([1, 0]));
  allowed = false;
  const second = await authenticate();
  assert.deepEqual(second.reply, Buffer.from([1, 1]));
  assert.equal(authChecks, 2, 'a previous successful login must not bypass current node permissions');
  await once(first.client, 'close');
  assert.ok(quotaChecks > 0, 'an existing connection must recheck its node authorization');
});
