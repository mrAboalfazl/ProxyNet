const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { runUpdate, createRequest, loadConfig } = require('./updater');
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-updater-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('relay-updater-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const target = path.join(dir, 'relay.js');
  const previous = Buffer.from("const RELAY_VERSION = process.env.RELAY_VERSION || 'old';\n");
  const next = Buffer.from("const RELAY_VERSION = process.env.RELAY_VERSION || 'new';\n");
  fs.writeFileSync(target, previous);
  const requests = []; let restarts = 0;
  const artifact = { url: '/api/nodes/1/artifact/relay', sha256: digest(next), version: 'new', ...options.artifact };
  const config = { nodeId: '1', nodeSecret: 'test-secret', controlPlaneUrl: 'https://panel.example' };
  const request = async (url, body, binary) => {
    requests.push({ url, body, binary });
    if (url.endsWith('/relay-register')) return options.noUpdate ? {} : { update: { relay: artifact } };
    if (binary) return next;
    if (options.reportFailure && body?.status === 'success') throw new Error('Panel temporarily unreachable');
    return {};
  };
  const restart = () => { restarts++; if (options.restartFailure && restarts === 1) throw new Error('Restart failed'); };
  return { target, previous, next, requests, get restarts() { return restarts; }, run: () => runUpdate({ config, target, request, restart }) };
}
test('installs only checksum-verified JavaScript, reports the running hash and restarts the fixed service', async (t) => {
  const f = setup(t); const result = await f.run();
  assert.equal(result.updated, true); assert.deepEqual(fs.readFileSync(f.target), f.next); assert.equal(f.restarts, 1);
  assert.equal(f.requests[0].body.relayVersion, 'old'); assert.equal(f.requests[0].body.relaySha256, digest(f.previous));
  assert.equal(f.requests.at(-1).body.status, 'success');
});
test('does not write or restart when the downloaded checksum is wrong', async (t) => {
  const f = setup(t, { artifact: { sha256: '0'.repeat(64) } });
  await assert.rejects(f.run, /checksum/); assert.deepEqual(fs.readFileSync(f.target), f.previous); assert.equal(f.restarts, 0);
});
test('rejects external artifact URLs even when their checksum is valid', async (t) => {
  const f = setup(t, { artifact: { url: 'https://another.example/payload' } });
  await assert.rejects(f.run, /Invalid relay artifact/); assert.equal(f.restarts, 0);
});
test('rolls back the code and restarts the previous version if restart fails', async (t) => {
  const f = setup(t, { restartFailure: true });
  await assert.rejects(f.run, /Restart failed/); assert.deepEqual(fs.readFileSync(f.target), f.previous); assert.equal(f.restarts, 2);
});
test('does not roll back a healthy update just because the final status report fails', async (t) => {
  const f = setup(t, { reportFailure: true }); assert.equal((await f.run()).updated, true); assert.deepEqual(fs.readFileSync(f.target), f.next);
});
test('leaves the relay running when no update is requested', async (t) => {
  const f = setup(t, { noUpdate: true }); assert.equal((await f.run()).updated, false); assert.equal(f.restarts, 0);
});
test('requires a trusted HTTPS origin and valid node configuration', () => {
  assert.throws(() => createRequest({ controlPlaneUrl: 'http://untrusted.example', nodeId: '1', nodeSecret: 'test' }), /HTTPS/);
  assert.throws(() => createRequest({ controlPlaneUrl: 'https://example.com?redirect=bad', nodeId: '1', nodeSecret: 'test' }), /origin/);
  assert.throws(() => createRequest({ controlPlaneUrl: 'https://example.com', nodeId: '../2', nodeSecret: 'test' }), /credentials/);
});

test('supports legacy nodes that keep their control-plane settings in agent.json', (t) => {
  const f = setup(t);
  const file = path.join(path.dirname(f.target), 'agent.json');
  fs.writeFileSync(file, JSON.stringify({ node_id: '1', node_secret: 'legacy-secret', control_endpoint: 'https://panel.example' }));
  assert.deepEqual(loadConfig({}, file), { nodeId: '1', nodeSecret: 'legacy-secret', controlPlaneUrl: 'https://panel.example' });
  assert.equal(loadConfig({ NODE_ID: '2' }, file).nodeId, '2');
});
