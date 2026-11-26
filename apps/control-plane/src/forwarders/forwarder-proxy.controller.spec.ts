import { ForwarderProxyController } from './forwarder-proxy.controller';

describe('Forwarding options', () => {
  async function forward(options: Record<string, boolean>) {
    const forwarders = {
      findForProxy: jest.fn().mockResolvedValue({
        id: 1n,
        userId: 2n,
        slug: 'link',
        targetUrl: 'https://example.com/api?fixed=1',
        preservePath: true,
        preserveQuery: true,
        forwardAuthHeader: true,
        countryCodes: [],
        ...options,
      }),
      recordCall: jest.fn().mockResolvedValue(undefined),
    };
    const selector = {
      getPreference: jest.fn().mockResolvedValue({ mode: 'auto' }),
      selectCandidatesForUser: jest.fn().mockResolvedValue([]),
    };
    const wallet = {
      hasMinBalance: jest.fn().mockResolvedValue(true),
      chargeSilently: jest.fn(),
    };
    const pricing = {
      get: jest.fn().mockResolvedValue({ minBalanceToman: 0n }),
      computeRequestCost: jest.fn().mockReturnValue(0n),
    };
    const controller = new ForwarderProxyController(
      forwarders as any,
      selector as any,
      wallet as any,
      pricing as any,
    );
    const outbound = jest
      .spyOn(controller as any, 'directFetch')
      .mockResolvedValue({
        status: 200,
        headers: {},
        body: Buffer.from('ok'),
        bytesIn: 2,
        bytesOut: 0,
      });
    const res = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
      json: jest.fn(),
    };
    await controller.proxyWithSuffix(
      'user',
      'link',
      {
        originalUrl: '/api/f/user/link/users?page=2',
        method: 'GET',
        headers: {
          authorization: 'Bearer api-token',
          connection: 'keep-alive',
          'x-custom': 'value',
        },
      } as any,
      res as any,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalledWith(Buffer.from('ok'));
    return outbound.mock.calls[0];
  }

  it('passes path, query, and API authorization with default options', async () => {
    const [url, method, headers] = await forward({});
    expect(url).toBe('https://example.com/api/users?fixed=1&page=2');
    expect(method).toBe('GET');
    expect(headers).toMatchObject({
      authorization: 'Bearer api-token',
      'x-custom': 'value',
    });
    expect(headers).not.toHaveProperty('connection');
  });

  it('omits the client path when path forwarding is disabled', async () => {
    expect((await forward({ preservePath: false }))[0]).toBe(
      'https://example.com/api?fixed=1&page=2',
    );
  });

  it('keeps configured target parameters when client query forwarding is disabled', async () => {
    expect((await forward({ preserveQuery: false }))[0]).toBe(
      'https://example.com/api/users?fixed=1',
    );
  });

  it('removes authorization but retains other end-to-end headers when disabled', async () => {
    const [, , headers] = await forward({ forwardAuthHeader: false });
    expect(headers).not.toHaveProperty('authorization');
    expect(headers).toHaveProperty('x-custom', 'value');
  });
  it('fails closed when a pinned node is not accessible instead of fetching directly', async () => {
    const forwarders = {
      findForProxy: jest
        .fn()
        .mockResolvedValue({
          id: 1n,
          userId: 2n,
          targetUrl: 'https://example.com',
          countryCodes: [],
          exitNodeId: 99n,
        }),
    };
    const selector = {
      getPreference: jest.fn().mockResolvedValue({ mode: 'auto' }),
      selectCandidatesForUser: jest.fn().mockResolvedValue([]),
    };
    const controller = new ForwarderProxyController(
      forwarders as any,
      selector as any,
      { hasMinBalance: jest.fn().mockResolvedValue(true) } as any,
      { get: jest.fn().mockResolvedValue({ minBalanceToman: 0n }) } as any,
    );
    const direct = jest.spyOn(controller as any, 'directFetch');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.proxyBare(
      'user',
      'link',
      { method: 'GET', originalUrl: '/api/f/user/link', headers: {} } as any,
      res as any,
    );
    expect(selector.selectCandidatesForUser).toHaveBeenCalledWith(
      2n,
      expect.objectContaining({ nodeId: '99' }),
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'selected_node_unavailable' }),
    );
    expect(direct).not.toHaveBeenCalled();
  });

  it('respects forwarder explicit country over profile routing preference', async () => {
    const forwarders = {
      findForProxy: jest.fn().mockResolvedValue({
        id: 1n,
        userId: 2n,
        targetUrl: 'https://example.com',
        countryCodes: ['DE'],
        exitNodeId: null,
      }),
    };
    const selector = {
      getPreference: jest.fn().mockResolvedValue({ mode: 'country', preferredCountry: 'NL' }),
      selectCandidatesForUser: jest.fn().mockResolvedValue([]),
    };
    const controller = new ForwarderProxyController(
      forwarders as any,
      selector as any,
      { hasMinBalance: jest.fn().mockResolvedValue(true) } as any,
      { get: jest.fn().mockResolvedValue({ minBalanceToman: 0n }) } as any,
    );
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.proxyBare(
      'user',
      'link',
      { method: 'GET', originalUrl: '/api/f/user/link', headers: {} } as any,
      res as any,
    );
    expect(selector.selectCandidatesForUser).toHaveBeenCalledWith(
      2n,
      expect.objectContaining({ countries: ['DE'] }),
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'selected_country_unavailable',
        message: expect.stringContaining('DE'),
      }),
    );
  });

  it('falls back to legacy profile routing preference when forwarder has no explicit country', async () => {
    const forwarders = {
      findForProxy: jest.fn().mockResolvedValue({
        id: 1n,
        userId: 2n,
        targetUrl: 'https://example.com',
        countryCodes: [],
        exitNodeId: null,
      }),
    };
    const selector = {
      getPreference: jest.fn().mockResolvedValue({ mode: 'country', preferredCountry: 'FR' }),
      selectCandidatesForUser: jest.fn().mockResolvedValue([]),
    };
    const controller = new ForwarderProxyController(
      forwarders as any,
      selector as any,
      { hasMinBalance: jest.fn().mockResolvedValue(true) } as any,
      { get: jest.fn().mockResolvedValue({ minBalanceToman: 0n }) } as any,
    );
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.proxyBare(
      'user',
      'link',
      { method: 'GET', originalUrl: '/api/f/user/link', headers: {} } as any,
      res as any,
    );
    expect(selector.selectCandidatesForUser).toHaveBeenCalledWith(
      2n,
      expect.objectContaining({ countries: null }),
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'selected_country_unavailable',
        message: expect.stringContaining('FR'),
      }),
    );
  });

  it('fails closed when a pinned upstream tunnel is unavailable', async () => {
    const forwarders = {
      findForProxy: jest.fn().mockResolvedValue({
        id: 1n,
        userId: 2n,
        slug: 'openai',
        targetUrl: 'https://api.openai.com',
        routingMode: 'tunnel',
        upstreamTunnelId: 77n,
        streamingEnabled: true,
        countryCodes: [],
        exitNodeId: null,
      }),
    };
    const selector = {
      getPreference: jest.fn().mockResolvedValue({ mode: 'auto' }),
      selectCandidatesForUser: jest.fn().mockResolvedValue([]),
    };
    const upstreams = {
      selectCandidatesForUser: jest.fn().mockResolvedValue([]),
      markFailed: jest.fn(),
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new ForwarderProxyController(
      forwarders as any,
      selector as any,
      { hasMinBalance: jest.fn().mockResolvedValue(true) } as any,
      { get: jest.fn().mockResolvedValue({ minBalanceToman: 0n }) } as any,
      upstreams as any,
    );
    const direct = jest.spyOn(controller as any, 'directStream');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.proxyBare(
      'user',
      'openai',
      {
        method: 'POST',
        originalUrl: '/api/f/user/openai',
        headers: {},
        rawBody: Buffer.from('{"stream":true}'),
      } as any,
      res as any,
    );
    expect(upstreams.selectCandidatesForUser).toHaveBeenCalledWith(
      2n,
      expect.objectContaining({ tunnelId: 77n }),
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'selected_tunnel_unavailable' }),
    );
    expect(direct).not.toHaveBeenCalled();
  });

  it('routes direct mode via directStream without consulting upstreams or relay nodes', async () => {
    const forwarders = {
      findForProxy: jest.fn().mockResolvedValue({
        id: 1n,
        userId: 2n,
        slug: 'local-ai',
        targetUrl: 'https://api.example.com',
        routingMode: 'direct',
        streamingEnabled: true,
        preservePath: true,
        preserveQuery: true,
        forwardAuthHeader: true,
        countryCodes: [],
        exitNodeId: null,
      }),
      recordCall: jest.fn().mockResolvedValue(undefined),
    };
    const selector = {
      getPreference: jest.fn(),
      selectCandidatesForUser: jest.fn(),
    };
    const upstreams = {
      selectCandidatesForUser: jest.fn(),
    };
    const wallet = {
      hasMinBalance: jest.fn().mockResolvedValue(true),
      chargeSilently: jest.fn(),
    };
    const pricing = {
      get: jest.fn().mockResolvedValue({ minBalanceToman: 0n }),
      computeRequestCost: jest.fn().mockReturnValue(0n),
    };
    const controller = new ForwarderProxyController(
      forwarders as any,
      selector as any,
      wallet as any,
      pricing as any,
      upstreams as any,
    );
    const directStreamSpy = jest
      .spyOn(controller as any, 'directStream')
      .mockResolvedValue({ status: 200, bytesIn: 42, bytesOut: 10 });
    const res = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
      json: jest.fn(),
    };

    await controller.proxyWithSuffix(
      'user',
      'local-ai',
      {
        originalUrl: '/api/f/user/local-ai/v1/chat/completions',
        method: 'POST',
        headers: { authorization: 'Bearer sk-test' },
        rawBody: Buffer.from('{"stream":true}'),
      } as any,
      res as any,
    );

    expect(upstreams.selectCandidatesForUser).not.toHaveBeenCalled();
    expect(selector.selectCandidatesForUser).not.toHaveBeenCalled();
    expect(directStreamSpy).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      'POST',
      expect.objectContaining({ authorization: 'Bearer sk-test' }),
      expect.any(Buffer),
      res,
    );
    expect(forwarders.recordCall).toHaveBeenCalledWith(1n, 42, 10);
  });

  it('fails over across upstream tunnel candidates when the first engine fails pre-header', async () => {
    const forwarders = {
      findForProxy: jest.fn().mockResolvedValue({
        id: 1n,
        userId: 2n,
        slug: 'openai',
        targetUrl: 'https://api.openai.com',
        routingMode: 'auto',
        streamingEnabled: true,
        preservePath: true,
        preserveQuery: true,
        forwardAuthHeader: true,
        countryCodes: [],
        exitNodeId: null,
      }),
      recordCall: jest.fn().mockResolvedValue(undefined),
    };
    const selector = {
      getPreference: jest.fn().mockResolvedValue({ mode: 'auto' }),
      selectCandidatesForUser: jest.fn().mockResolvedValue([]),
    };
    const upstreams = {
      selectCandidatesForUser: jest.fn().mockResolvedValue([
        {
          tunnelId: 10,
          label: 'WG DE #1',
          protocol: 'wireguard',
          countryCode: 'DE',
          hostNodeId: 1,
          proxyHost: '127.0.0.1',
          proxyPort: 9444,
          proxySecret: 'sec',
          isLocal: true,
        },
        {
          tunnelId: 11,
          label: 'WG NL #2',
          protocol: 'wireguard',
          countryCode: 'NL',
          hostNodeId: 1,
          proxyHost: '127.0.0.1',
          proxyPort: 9444,
          proxySecret: 'sec',
          isLocal: true,
        },
      ]),
      markFailed: jest.fn(),
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };
    const wallet = {
      hasMinBalance: jest.fn().mockResolvedValue(true),
      chargeSilently: jest.fn(),
    };
    const pricing = {
      get: jest.fn().mockResolvedValue({ minBalanceToman: 0n }),
      computeRequestCost: jest.fn().mockReturnValue(0n),
    };
    const controller = new ForwarderProxyController(
      forwarders as any,
      selector as any,
      wallet as any,
      pricing as any,
      upstreams as any,
    );

    const streamSpy = jest
      .spyOn(controller as any, 'streamViaUpstream')
      .mockRejectedValueOnce(new Error('tunnel 10 dial timeout'))
      .mockResolvedValueOnce({ status: 200, bytesIn: 128, bytesOut: 32 });

    const res = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
      json: jest.fn(),
      headersSent: false,
    };

    await controller.proxyWithSuffix(
      'user',
      'openai',
      {
        originalUrl: '/api/f/user/openai/v1/chat/completions',
        method: 'POST',
        headers: { authorization: 'Bearer sk-openai' },
        rawBody: Buffer.from('{"stream":true}'),
      } as any,
      res as any,
    );

    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(upstreams.markFailed).toHaveBeenCalledWith(10);
    expect(upstreams.recordUsage).toHaveBeenCalledWith(11, 128, 32);
    expect(forwarders.recordCall).toHaveBeenCalledWith(1n, 128, 32);
  });
});
