import { NodeSelectorService } from './node-selector.service';

jest.mock('../nodes/relay-secret.crypto', () => ({
  decryptRelaySecret: jest.fn(() => 'relay-secret'),
}));

describe('NodeSelectorService', () => {
  function setup() {
    const prisma = {
      subscription: { findFirst: jest.fn().mockResolvedValue(null) },
      userRoutingPreference: { findUnique: jest.fn() },
      node: { findFirst: jest.fn(), findMany: jest.fn() },
    } as any;
    const snapshot = { getCurrentSnapshot: jest.fn() } as any;
    return { service: new NodeSelectorService(prisma, snapshot), prisma, snapshot };
  }

  it('filters manual routing to the requested country', async () => {
    const { service, prisma, snapshot } = setup();
    prisma.userRoutingPreference.findUnique.mockResolvedValue({
      routingMode: 'country',
      preferredCountry: 'de',
    });
    snapshot.getCurrentSnapshot.mockResolvedValue({
      nodes: [
        { id: '1', countryCode: 'NL', status: 'healthy', roles: ['exit'] },
        { id: '2', countryCode: 'DE', status: 'healthy', roles: ['exit'] },
      ],
    });
    prisma.node.findFirst.mockResolvedValue({
      id: 2n,
      countryCode: 'DE',
      label: 'DE-01',
      ipv4Address: '203.0.113.10',
      ipv6Address: null,
      relaySecretEncrypted: 'encrypted',
    });

    const selected = await service.selectForUser(42n);

    expect(selected).toMatchObject({ id: 2, countryCode: 'DE', host: '203.0.113.10' });
    expect(prisma.node.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [expect.objectContaining({ userPaused: false, OR: [{ submittedById: 42n }, { visibility: 'public' }] }), {}, { id: 2n }] } }));
  });

  it('returns no route when the requested country has no eligible node', async () => {
    const { service, prisma, snapshot } = setup();
    prisma.userRoutingPreference.findUnique.mockResolvedValue({
      routingMode: 'country',
      preferredCountry: 'US',
    });
    snapshot.getCurrentSnapshot.mockResolvedValue({
      nodes: [{ id: '1', countryCode: 'DE', status: 'healthy', roles: ['exit'] }],
    });

    await expect(service.selectForUser(42n)).resolves.toBeNull();
    expect(prisma.node.findFirst).not.toHaveBeenCalled();
  });
  it('excludes edge-only nodes from HTTP egress and advertised routes', async () => {
    const { service, prisma, snapshot } = setup();
    prisma.userRoutingPreference.findUnique.mockResolvedValue(null);
    snapshot.getCurrentSnapshot.mockResolvedValue({ nodes: [
      { id: '1', countryCode: 'DE', status: 'healthy', roles: ['edge'] },
      { id: '2', countryCode: 'NL', status: 'healthy', roles: ['exit'] },
    ] });
    prisma.node.findFirst.mockResolvedValue({ id: 2n, countryCode: 'NL', label: 'exit', ipv4Address: '203.0.113.10', relaySecretEncrypted: 'encrypted' });
    expect(await service.selectForUser(42n)).toMatchObject({ id: 2 });
    prisma.node.findMany.mockResolvedValue([{ id: 2n, countryCode: 'NL', label: 'exit', status: 'healthy' }]);
    expect(await service.listAvailableNodes(42n)).toEqual([expect.objectContaining({ id: 2 })]);
    expect(prisma.node.findFirst).toHaveBeenCalledTimes(1);
  });

});
