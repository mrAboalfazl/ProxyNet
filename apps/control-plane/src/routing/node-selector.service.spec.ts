import { NodeSelectorService } from './node-selector.service';

jest.mock('../nodes/relay-secret.crypto', () => ({
  decryptRelaySecret: jest.fn(() => 'relay-secret'),
}));

describe('NodeSelectorService', () => {
  function setup() {
    const prisma = {
      userRoutingPreference: { findUnique: jest.fn() },
      node: { findUnique: jest.fn() },
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
        { id: '1', countryCode: 'NL', status: 'healthy' },
        { id: '2', countryCode: 'DE', status: 'healthy' },
      ],
    });
    prisma.node.findUnique.mockResolvedValue({
      id: 2n,
      countryCode: 'DE',
      label: 'DE-01',
      ipv4Address: '203.0.113.10',
      ipv6Address: null,
      relaySecretEncrypted: 'encrypted',
    });

    const selected = await service.selectForUser(42n);

    expect(selected).toMatchObject({ id: 2, countryCode: 'DE', host: '203.0.113.10' });
    expect(prisma.node.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2n } }));
  });

  it('returns no route when the requested country has no eligible node', async () => {
    const { service, prisma, snapshot } = setup();
    prisma.userRoutingPreference.findUnique.mockResolvedValue({
      routingMode: 'country',
      preferredCountry: 'US',
    });
    snapshot.getCurrentSnapshot.mockResolvedValue({
      nodes: [{ id: '1', countryCode: 'DE', status: 'healthy' }],
    });

    await expect(service.selectForUser(42n)).resolves.toBeNull();
    expect(prisma.node.findUnique).not.toHaveBeenCalled();
  });
});
