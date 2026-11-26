import { parseProxyUrl, parseWireguardConf } from './upstreams.parser';

const SAMPLE_PRIV_KEY = Buffer.alloc(32, 1).toString('base64');
const SAMPLE_PUB_KEY = Buffer.alloc(32, 2).toString('base64');

const SAMPLE_WG_CONF = `
[Interface]
PrivateKey = ${SAMPLE_PRIV_KEY}
Address = 10.66.0.2/32
DNS = 1.1.1.1, 8.8.8.8
MTU = 1360

[Peer]
PublicKey = ${SAMPLE_PUB_KEY}
Endpoint = 198.51.100.10:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
`;

describe('upstreams.parser', () => {
  it('parses a standard WireGuard .conf file', () => {
    const res = parseWireguardConf(SAMPLE_WG_CONF, { protocol: 'wireguard' });
    expect(res.endpointPreview).toBe('198.51.100.10:51820');
    expect(res.mtu).toBe(1360);
    expect(res.hasJunkObfuscation).toBe(false);
    expect(res.config.privateKey).toBe(SAMPLE_PRIV_KEY);
    expect(res.config.publicKey).toBe(SAMPLE_PUB_KEY);
    expect(res.config.addresses).toEqual(['10.66.0.2/32']);
  });

  it('enforces safe S1=0, S2=0, H1..H4=1..4 when adding client-side junk to standard WireGuard', () => {
    const res = parseWireguardConf(SAMPLE_WG_CONF, {
      protocol: 'wireguard',
      junkOverride: {
        jc: 4,
        jmin: 50,
        jmax: 900,
        s1: 42, // must be forced to 0 for standard WG
        s2: 99, // must be forced to 0 for standard WG
        h1: 99999, // must be forced to 1
      },
    });
    expect(res.hasJunkObfuscation).toBe(true);
    expect(res.config.junk).toMatchObject({
      jc: 4,
      jmin: 50,
      jmax: 900,
      s1: 0,
      s2: 0,
      h1: 1,
      h2: 2,
      h3: 3,
      h4: 4,
    });
  });

  it('preserves full AmneziaWG S1/S2/H1..H4 when protocol is amneziawg', () => {
    const awgConf = SAMPLE_WG_CONF.replace(
      'MTU = 1360',
      'MTU = 1360\nJc = 5\nJmin = 40\nJmax = 800\nS1 = 30\nS2 = 50\nH1 = 1001\nH2 = 1002\nH3 = 1003\nH4 = 1004',
    );
    const res = parseWireguardConf(awgConf, { protocol: 'amneziawg' });
    expect(res.hasJunkObfuscation).toBe(true);
    expect(res.config.junk).toMatchObject({
      jc: 5,
      jmin: 40,
      jmax: 800,
      s1: 30,
      s2: 50,
      h1: 1001,
      h2: 1002,
      h3: 1003,
      h4: 1004,
    });
  });

  it('rejects Jmax >= MTU to prevent UDP fragmentation', () => {
    expect(() =>
      parseWireguardConf(SAMPLE_WG_CONF, {
        protocol: 'wireguard',
        mtuOverride: 1280,
        junkOverride: { jc: 4, jmin: 50, jmax: 1280 },
      }),
    ).toThrow(/Jmax/);
  });

  it('parses socks5 URL and host:port:user:pass shorthand', () => {
    const urlParsed = parseProxyUrl('socks5://alice:s3cr3t@203.0.113.5:1080');
    expect(urlParsed.endpointPreview).toBe('203.0.113.5:1080');
    expect(urlParsed.config).toEqual({
      scheme: 'socks5',
      host: '203.0.113.5',
      port: 1080,
      username: 'alice',
      password: 's3cr3t',
    });

    const shortParsed = parseProxyUrl('203.0.113.6:1080:bob:pw123', 'socks5');
    expect(shortParsed.config).toEqual({
      scheme: 'socks5',
      host: '203.0.113.6',
      port: 1080,
      username: 'bob',
      password: 'pw123',
    });
  });
});
