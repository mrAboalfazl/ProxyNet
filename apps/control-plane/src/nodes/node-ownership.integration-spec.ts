import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { NodesService } from './nodes.service';
import { usableNodeWhere, resolveExitNode } from './node-access';
import { NodeSelectorService } from '../routing/node-selector.service';
import { ProxyCredentialsService } from '../proxy-credentials/proxy-credentials.service';
import { ForwardersService } from '../forwarders/forwarders.service';

jest.mock('./relay-secret.crypto', () => ({
  encryptRelaySecret: jest.fn(() => 'encrypted'),
  decryptRelaySecret: jest.fn(() => 'relay-secret'),
}));

// Explicit opt-in: never use DATABASE_URL or the developer's application DB.
const databaseUrl = process.env.NODE_OWNERSHIP_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration('Node ownership against PostgreSQL', () => {
  let db: PrismaClient;
  let nodes: NodesService;
  let credentials: ProxyCredentialsService;
  let forwarders: ForwardersService;
  let selector: NodeSelectorService;
  let snapshot: any;
  let owner: any,
    other: any,
    admin: any,
    privateNode: any,
    publicNode: any,
    project: any;
  let hash: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/proxynet_test'
    )
      throw new Error('Use a disposable local proxynet_test database');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.country.upsert({
      where: { code: 'DE' },
      update: { enabled: true },
      create: { code: 'DE', name: 'Germany' },
    });
    hash = await bcrypt.hash('test-secret', 4);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    const makeUser = (name: string) =>
      db.user.create({ data: { displayName: name, publicSlug: randomUUID() } });
    [owner, other, admin] = await Promise.all([
      makeUser('owner'),
      makeUser('other'),
      makeUser('admin'),
    ]);
    project = await db.project.create({
      data: { userId: owner.id, name: 'test', slug: randomUUID() },
    });
    privateNode = await db.node.create({
      data: {
        label: 'private',
        countryCode: 'DE',
        roles: ['exit'],
        status: 'healthy',
        submittedById: owner.id,
        nodeSecretHash: hash,
        relaySecretEncrypted: 'encrypted',
        ipv4Address: '203.0.113.10',
      },
    });
    publicNode = await db.node.create({
      data: {
        label: 'public',
        countryCode: 'DE',
        roles: ['exit'],
        status: 'healthy',
        visibility: 'public',
        nodeSecretHash: hash,
        relaySecretEncrypted: 'encrypted',
        ipv4Address: '203.0.113.20',
      },
    });
    await db.nodeHeartbeat.createMany({
      data: [privateNode, publicNode].map((node) => ({
        nodeId: node.id,
        agentVersion: '1.1.0',
      })),
    });
    const plan = await db.plan.create({
      data: {
        name: 'test',
        monthlyBandwidthGb: 1,
        allowedProtocols: ['socks5'],
        allowedCountries: ['DE'],
      },
    });
    await db.subscription.createMany({
      data: [owner, other].map((user) => ({
        userId: user.id,
        planId: plan.id,
        periodStart: new Date(Date.now() - 60_000),
        periodEnd: new Date(Date.now() + 3600_000),
      })),
    });
    snapshot = {
      compileSnapshot: jest.fn().mockResolvedValue({}),
      getCurrentSnapshot: jest.fn(async () => ({
        version: '1',
        policies: [],
        nodes: (
          await db.node.findMany({
            where: { id: { in: [privateNode.id, publicNode.id] } },
          })
        ).map((node) => ({ ...node, id: node.id.toString() })),
      })),
    };
    nodes = new NodesService(db as any, snapshot);
    credentials = new ProxyCredentialsService(
      db as any,
      { addClient: jest.fn(), removeClient: jest.fn() } as any,
    );
    forwarders = new ForwardersService(db as any);
    selector = new NodeSelectorService(db as any, snapshot);
  });

  it('keeps private nodes out of another account inventory, endpoint list and HTTP routing', async () => {
    expect(
      await resolveExitNode(db as any, owner.id, privateNode.id.toString()),
    ).toBe(privateNode.id);
    await expect(
      resolveExitNode(db as any, other.id, privateNode.id.toString()),
    ).rejects.toThrow('not accessible');
    expect(
      (await nodes.availableForUser(other.id)).map((node) => node.id),
    ).not.toContain(privateNode.id);
    expect(
      (await credentials.getSocks5Endpoints(other.id)).endpoints.map(
        (node) => node.nodeId,
      ),
    ).not.toContain(privateNode.id.toString());
    const choices = await selector.selectCandidatesForUser(other.id, {
      limit: 10,
    });
    expect(choices.map((node) => node.id)).toEqual([Number(publicNode.id)]);
  });

  it('does not trust a stale snapshot after a pause or sharing withdrawal', async () => {
    const stale = await snapshot.getCurrentSnapshot();
    snapshot.getCurrentSnapshot.mockResolvedValue(stale);
    await nodes.updateUserNode(owner.id, privateNode.id.toString(), {
      userPaused: true,
    });
    expect(
      await selector.selectCandidatesForUser(owner.id, {
        nodeId: privateNode.id.toString(),
      }),
    ).toEqual([]);
    await db.node.update({
      where: { id: publicNode.id },
      data: { visibility: 'private' },
    });
    expect(
      await selector.selectCandidatesForUser(other.id, {
        nodeId: publicNode.id.toString(),
      }),
    ).toEqual([]);
  });

  it('requires owner consent followed by admin approval and permits withdrawal', async () => {
    await nodes.updateUserNode(owner.id, privateNode.id.toString(), {
      sharing: 'request-public',
    });
    expect(
      await db.node.findUnique({ where: { id: privateNode.id } }),
    ).toMatchObject({ visibility: 'private', sharingRequested: true });
    await nodes.approveNode(privateNode.id, admin.id);
    expect(
      await resolveExitNode(db as any, other.id, privateNode.id.toString()),
    ).toBe(privateNode.id);
    await nodes.updateUserNode(owner.id, privateNode.id.toString(), {
      sharing: 'private',
    });
    await expect(
      resolveExitNode(db as any, other.id, privateNode.id.toString()),
    ).rejects.toThrow();
  });

  it('rejects cross-account management, renewal and binding a foreign private node', async () => {
    await expect(
      nodes.updateUserNode(other.id, privateNode.id.toString(), {
        userPaused: true,
      }),
    ).rejects.toThrow('do not own');
    await expect(
      nodes.renewUserEnrollment(other.id, privateNode.id.toString()),
    ).rejects.toThrow('do not own');
    await expect(
      forwarders.create(other.id, {
        label: 'bad',
        targetUrl: 'https://example.com',
        exitNodeId: privateNode.id.toString(),
      }),
    ).rejects.toThrow('not accessible');
    await expect(
      credentials.create(other.id, { exitNodeId: privateNode.id.toString() }),
    ).rejects.toThrow('not accessible');
  });

  it('persists node bindings for both kinds of project record', async () => {
    const fwd = await forwarders.create(owner.id, {
      label: 'fwd',
      targetUrl: 'https://example.com',
      projectId: project.id.toString(),
      exitNodeId: privateNode.id.toString(),
    });
    const credential = await credentials.create(owner.id, {
      label: 'socks',
      projectId: project.id.toString(),
      exitNodeId: privateNode.id.toString(),
    });
    expect(fwd.exitNodeId).toBe(privateNode.id);
    expect(credential.exitNodeId).toBe(privateNode.id);
  });

  it('enforces credential node bindings and private access during SOCKS authorization and rechecks', async () => {
    const credential = await db.proxyCredential.create({
      data: { userId: owner.id, secretHash: hash, exitNodeId: privateNode.id },
    });
    expect(
      await credentials.verify(credential.uuid, 'test-secret', privateNode.id),
    ).toMatchObject({ valid: true });
    expect(
      await credentials.verify(credential.uuid, 'test-secret', publicNode.id),
    ).toEqual({ valid: false });
    expect(await credentials.verify(credential.uuid, 'test-secret')).toEqual({
      valid: false,
    });
    const foreign = await db.proxyCredential.create({
      data: { userId: other.id, secretHash: hash },
    });
    expect(
      await credentials.verify(foreign.uuid, 'test-secret', privateNode.id),
    ).toEqual({ valid: false });
    await nodes.updateUserNode(owner.id, privateNode.id.toString(), {
      userPaused: true,
    });
    expect(
      await credentials.canUseCredentialOnNode(credential.uuid, privateNode.id),
    ).toBe(false);
  });

  it('does not let resuming a node override administrator disablement', async () => {
    await db.node.update({
      where: { id: privateNode.id },
      data: { status: 'disabled', userPaused: true },
    });
    await nodes.updateUserNode(owner.id, privateNode.id.toString(), {
      userPaused: false,
    });
    expect(
      await db.node.findFirst({
        where: { AND: [usableNodeWhere(owner.id), { id: privateNode.id }] },
      }),
    ).toBeNull();
  });

  it('rotates an uninstalled node token and atomically rejects a concurrent enrollment replay', async () => {
    const created = await nodes.createUserNode(owner.id, {
      label: 'new node',
      countryCode: 'de',
      roles: ['edge'],
      sharing: 'private',
    });
    const fresh = await nodes.renewUserEnrollment(
      owner.id,
      created.node.id.toString(),
    );
    expect(await nodes.consumeEnrollmentToken(created.token, {})).toBeNull();
    const results = await Promise.all([
      nodes.consumeEnrollmentToken(fresh.token, {
        ipv4Address: '203.0.113.30',
      }),
      nodes.consumeEnrollmentToken(fresh.token, {
        ipv4Address: '203.0.113.30',
      }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const enrolled = await db.node.findUniqueOrThrow({
      where: { id: created.node.id },
    });
    expect(enrolled).toMatchObject({
      status: 'pending',
      visibility: 'private',
      roles: ['exit'],
      enrollmentToken: null,
    });
    await expect(
      nodes.renewUserEnrollment(owner.id, enrolled.id.toString()),
    ).rejects.toThrow('uninstalled');
    await nodes.approveNode(enrolled.id, admin.id);
    expect(
      await db.node.findUnique({ where: { id: enrolled.id } }),
    ).toMatchObject({ status: 'active', visibility: 'private' });
  });

  it('omits foreign private nodes from the snapshot delivered to an agent', async () => {
    expect(
      (await nodes.snapshotForNode(publicNode.id)).nodes.map((node) => node.id),
    ).not.toContain(privateNode.id.toString());
  });

  it('denies direct SOCKS access when the subscription country is not permitted', async () => {
    await db.country.upsert({
      where: { code: 'NL' },
      update: {},
      create: { code: 'NL', name: 'Netherlands' },
    });
    await db.node.update({
      where: { id: privateNode.id },
      data: { countryCode: 'NL' },
    });
    const credential = await db.proxyCredential.create({
      data: { userId: owner.id, secretHash: hash },
    });
    expect(
      await credentials.canUseCredentialOnNode(credential.uuid, privateNode.id),
    ).toBe(false);
  });
  it('refuses a publication if the owner withdraws consent during admin approval', async () => {
    await nodes.updateUserNode(owner.id, privateNode.id.toString(), {
      sharing: 'request-public',
    });
    const original = db.node.findUnique.bind(db.node);
    const read = jest
      .spyOn(db.node, 'findUnique')
      .mockImplementationOnce(async (args: any) => {
        const previous = await original(args);
        await db.node.update({
          where: { id: privateNode.id },
          data: { sharingRequested: false },
        });
        return previous;
      });
    try {
      await expect(nodes.approveNode(privateNode.id, admin.id)).rejects.toThrow(
        'changed',
      );
    } finally {
      read.mockRestore();
    }
    expect(
      await db.node.findUnique({ where: { id: privateNode.id } }),
    ).toMatchObject({ visibility: 'private', sharingRequested: false });
  });

  it('rejecting sharing preserves the already approved private node', async () => {
    await nodes.updateUserNode(owner.id, privateNode.id.toString(), {
      sharing: 'request-public',
    });
    await nodes.rejectNode(privateNode.id);
    expect(
      await db.node.findUnique({ where: { id: privateNode.id } }),
    ).toMatchObject({
      visibility: 'private',
      sharingRequested: false,
      status: 'healthy',
    });
  });

  it('applies plan country restrictions to HTTP bindings and automatic candidate selection', async () => {
    await db.country.upsert({
      where: { code: 'NL' },
      update: {},
      create: { code: 'NL', name: 'Netherlands' },
    });
    await db.node.update({
      where: { id: privateNode.id },
      data: { countryCode: 'NL' },
    });
    await expect(
      forwarders.create(owner.id, {
        label: 'restricted',
        targetUrl: 'https://example.com',
        exitNodeId: privateNode.id.toString(),
      }),
    ).rejects.toThrow('not accessible');
    expect(
      await selector.selectCandidatesForUser(owner.id, {
        nodeId: privateNode.id.toString(),
      }),
    ).toEqual([]);
  });
  it('lets only the owner queue a relay update and returns no node credentials', async () => {
    await expect(nodes.requestUserNodeUpdate(other.id, privateNode.id.toString())).rejects.toThrow('do not own');
    expect(await nodes.requestUserNodeUpdate(owner.id, privateNode.id.toString())).toEqual({ requested: true });
    expect(await db.node.findUnique({ where: { id: privateNode.id } })).toMatchObject({ updateStatus: 'requested' });
    await db.node.update({ where: { id: privateNode.id }, data: { status: 'disabled' } });
    await expect(nodes.requestUserNodeUpdate(owner.id, privateNode.id.toString())).rejects.toThrow('cannot receive');
  });

});
