import { GatewayService } from '../apps/control-plane/src/gateway/gateway.service';
import { NodeSelectorService } from '../apps/control-plane/src/routing/node-selector.service';

async function runTests() {
  console.log('--- STARTING GATEWAY SERVICE UPGRADE TESTS ---');

  const mockNodeSelector: any = {
    getPreference: async () => ({ mode: 'any', preferredCountry: null }),
    selectForUser: async () => null, // routes locally
  };

  const gateway = new GatewayService(mockNodeSelector as NodeSelectorService);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    passed++;
    console.log(`✅ PASS: ${msg}`);
  }

  // 1. Authorization header pass-through
  try {
    console.log('\n[Test 1] Testing Upstream Authorization Header Pass-Through...');
    const result = await gateway.fetch({
      url: 'https://httpbin.org/headers',
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token-wgmgr-telegram-xyz',
        'X-Custom-Client': 'ProxyNet-Test',
      },
    });

    assert(result.status === 200, `Status code is 200 (got ${result.status})`);
    const parsedBody = JSON.parse(result.body);
    const authHeaderReceived =
      parsedBody.headers['Authorization'] || parsedBody.headers['authorization'];
    assert(
      authHeaderReceived === 'Bearer test-token-wgmgr-telegram-xyz',
      `Target received upstream Authorization header (${authHeaderReceived})`,
    );
  } catch (err: any) {
    console.error('Test 1 error:', err.message);
  }

  // 2. HTTP Redirect Following
  try {
    console.log('\n[Test 2] Testing HTTP 302 Redirect Following...');
    const result = await gateway.fetch({
      url: 'https://httpbin.org/redirect/2',
      method: 'GET',
      followRedirects: true,
      maxRedirects: 5,
    });

    assert(result.status === 200, `Status code is 200 after redirects (got ${result.status})`);
    assert(
      (result.redirectsFollowed ?? 0) >= 2,
      `Followed redirects correctly (count: ${result.redirectsFollowed})`,
    );
  } catch (err: any) {
    console.error('Test 2 error:', err.message);
  }

  // 3. Binary Content Detection & Base64 Encoding
  try {
    console.log('\n[Test 3] Testing Binary Content Detection & Base64 Encoding...');
    const result = await gateway.fetch({
      url: 'https://httpbin.org/image/png',
      method: 'GET',
    });

    assert(result.status === 200, `Status code is 200 (got ${result.status})`);
    assert(result.isBase64 === true, `isBase64 is marked true for image/png`);
    const buf = Buffer.from(result.body, 'base64');
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const isPng =
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    assert(isPng, `Decoded buffer has valid PNG binary magic header`);
  } catch (err: any) {
    console.error('Test 3 error:', err.message);
  }

  // 4. Insecure flag and timeout options
  try {
    console.log('\n[Test 4] Testing Parameter Options (insecure, timeoutMs, base64 request body)...');
    const binaryData = Buffer.from('binary-payload-data');
    const result = await gateway.fetch({
      url: 'https://httpbin.org/post',
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: binaryData.toString('base64'),
      isBase64: true,
      timeoutMs: 15000,
      insecure: true,
    });

    assert(result.status === 200, `POST binary status is 200 (got ${result.status})`);
    const parsedBody = JSON.parse(result.body);
    assert(
      parsedBody.data.includes('binary-payload-data'),
      `Target received binary payload intact`,
    );
  } catch (err: any) {
    console.error('Test 4 error:', err.message);
  }

  // 5. Test node-relay doFetch
  try {
    console.log('\n[Test 5] Testing Node-Relay doFetch Implementation...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { doFetch } = require('../packages/node-relay/index.js');
    const relayResult = await doFetch({
      url: 'https://httpbin.org/headers',
      method: 'GET',
      headers: {
        Authorization: 'Bearer node-relay-auth-check',
      },
    });

    assert(relayResult.status === 200, `Node-relay status is 200 (got ${relayResult.status})`);
    const parsedBody = JSON.parse(relayResult.body);
    const authHeaderReceived =
      parsedBody.headers['Authorization'] || parsedBody.headers['authorization'];
    assert(
      authHeaderReceived === 'Bearer node-relay-auth-check',
      `Node-relay passed Authorization header (${authHeaderReceived})`,
    );
  } catch (err: any) {
    console.error('Test 5 error:', err.message);
  }

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed}/${total} passed`);
  console.log(`========================================`);
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
