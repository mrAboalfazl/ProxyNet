import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { RoutingController } from '../routing/routing.controller';
import { AdminGuard } from '../admin/guards/admin.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';

jest.mock('./relay-secret.crypto', () => ({ encryptRelaySecret: jest.fn() }));

describe('Node onboarding boundaries', () => {
  function setup(node: any) {
    const prisma = {
      node: {
        findUnique: jest.fn().mockResolvedValue(node),
        findUniqueOrThrow: jest.fn().mockResolvedValue(node),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(node),
        findMany: jest.fn().mockResolvedValue([node]),
      },
    };
    const snapshot = { compileSnapshot: jest.fn().mockResolvedValue({}) };
    return {
      service: new NodesService(prisma as any, snapshot as any),
      prisma,
      snapshot,
    };
  }

  it.each([
    { status: 'pending', nodeSecretHash: null },
    { status: 'disabled', nodeSecretHash: 'hash' },
  ])(
    'rejects approval for an uninstalled or disabled server',
    async (node: any) => {
      const { service, prisma, snapshot } = setup(node);
      await expect(service.approveNode(1n, 9n)).rejects.toThrow(
        'Only enrolled nodes',
      );
      expect(prisma.node.update).not.toHaveBeenCalled();
      expect(snapshot.compileSnapshot).not.toHaveBeenCalled();
    },
  );

  it('activates an enrolled pending node and rebuilds routing', async () => {
    const { service, prisma, snapshot } = setup({
      status: 'pending',
      nodeSecretHash: 'hash',
    });
    await service.approveNode(1n, 9n);
    expect(prisma.node.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active', approvedById: 9n }),
      }),
    );
    expect(snapshot.compileSnapshot).toHaveBeenCalledTimes(1);
  });

  it('returns enrollment state without node credentials to the submitting user', async () => {
    const { service, prisma } = setup({
      id: 1n,
      label: 'server',
      nodeSecretHash: 'hash',
      relaySecretEncrypted: 'encrypted',
      enrollmentToken: 'token',
      enrollmentTokenExpiry: new Date(),
    });
    expect(await service.findUserNodes(42n)).toEqual([
      { id: 1n, label: 'server', enrolled: true, httpReady: false },
    ]);
    expect(prisma.node.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { submittedById: 42n } }),
    );
  });

  it('requires administrator access for node inventory, details, and routing management', () => {
    for (const handler of [
      NodesController.prototype.findAll,
      NodesController.prototype.findOne,
      RoutingController,
    ]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        AdminGuard,
      );
    }
  });
});
