#!/usr/bin/env node
// Root-owned, fixed-purpose updater. The unprivileged relay never writes code
// or executes a privileged shell script. Only the configured panel supplies it.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const TARGET = '/usr/local/lib/proxynet/node-relay.js';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function loadConfig(env = process.env, agentFile = '/etc/proxynet/agent.json') {
  let agent = {};
  if (fs.existsSync(agentFile)) {
    try { agent = JSON.parse(fs.readFileSync(agentFile, 'utf8')); }
    catch { throw new Error('Invalid agent configuration'); }
  }
  return { nodeId: String(env.NODE_ID || agent.node_id || ''), nodeSecret: env.NODE_SECRET || agent.node_secret || '', controlPlaneUrl: env.CONTROL_PLANE_URL || agent.control_endpoint || '' };
}

function createRequest(config) {
  const url = new URL(config.controlPlaneUrl);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid control-plane origin');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Updater requires HTTPS');
  if (!/^[1-9][0-9]*$/.test(config.nodeId) || !config.nodeSecret) throw new Error('Missing node credentials');
  return async (path, body, binary = false) => {
    const response = await fetch(`${url.origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${config.nodeSecret}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Panel returned HTTP ${response.status}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.status === 204 ? null : response.json();
  };
}

async function runUpdate({ config, target = TARGET, request = createRequest(config), restart = () => execFileSync('/bin/systemctl', ['restart', 'proxynet-relay.service'], { timeout: 30000 }), check = (file) => execFileSync(process.execPath, ['--check', file], { timeout: 15000 }) }) {
  const prefix = `/api/nodes/${config.nodeId}`;
  if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Relay target must be a regular file');
  const current = fs.readFileSync(target);
  const version = current.toString('utf8').match(/process\.env\.RELAY_VERSION\s*\|\|\s*'([^']+)'/)?.[1] || 'unknown';
  const registered = await request(`${prefix}/relay-register`, { relayVersion: version, relaySha256: hash(current) });
  const artifact = registered?.update?.relay;
  if (!artifact || artifact.sha256 === hash(current)) return { updated: false };
  const next = `${target}.update-${process.pid}.js`;
  const previous = `${target}.previous`;
  let replaced = false;
  try {
    if (artifact.url !== `${prefix}/artifact/relay` || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid relay artifact');
    const content = await request(artifact.url, undefined, true);
    if (hash(content) !== artifact.sha256) throw new Error('Relay checksum mismatch');
    fs.writeFileSync(next, content, { flag: 'wx', mode: 0o600 });
    await check(next);
    fs.chmodSync(next, 0o644);
    fs.copyFileSync(target, previous);
    await request(`${prefix}/update-result`, { status: 'restarting', message: `Verified relay ${artifact.version || artifact.sha256.slice(0, 12)}` });
    fs.renameSync(next, target);
    replaced = true;
    await restart();
    await request(`${prefix}/update-result`, { status: 'success', message: `Relay ${artifact.version || artifact.sha256.slice(0, 12)} installed` }).catch(() => {});
    return { updated: true, sha256: artifact.sha256 };
  } catch (error) {
    if (replaced) {
      fs.copyFileSync(previous, target);
      fs.chmodSync(target, 0o644);
      try { await restart(); } catch {}
    }
    await request(`${prefix}/update-result`, { status: 'failed', message: error.message }).catch(() => {});
    throw error;
  } finally {
    if (fs.existsSync(next)) fs.unlinkSync(next);
  }
}

if (require.main === module) {
  if (process.getuid?.() !== 0) { console.error('Relay updater must run as root'); process.exit(1); }
  for (const file of ['/etc/proxynet', '/etc/proxynet/relay.env', ...(fs.existsSync('/etc/proxynet/agent.json') ? ['/etc/proxynet/agent.json'] : [])]) {
    const stat = fs.lstatSync(file);
    if (stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.isSymbolicLink()) throw new Error('Updater configuration must be root-owned and not writable by other users');
  }
  const config = loadConfig();
  runUpdate({ config }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { runUpdate, createRequest, loadConfig };
