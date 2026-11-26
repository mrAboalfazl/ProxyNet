// Local UI fixtures only. This server never connects to application databases.
const http = require('node:http');
const now = new Date().toISOString();
const base = {
  countryCode: 'DE',
  roles: ['exit'],
  visibility: 'private',
  sharingRequested: false,
  userPaused: false,
  submittedById: '7',
  createdAt: now,
  country: { code: 'DE', name: 'Germany', enabled: true },
  heartbeats: [{ reportedAt: now, agentVersion: '1.1.0' }],
};
let nodes = [
  {
    ...base,
    id: '1',
    label: 'Awaiting install',
    status: 'pending',
    enrolled: false,
    httpReady: false,
  },
  {
    ...base,
    id: '2',
    label: 'Awaiting review',
    status: 'pending',
    enrolled: true,
    httpReady: false,
    ipv4Address: '203.0.113.12',
  },
  {
    ...base,
    id: '3',
    label: 'Private Frankfurt',
    status: 'healthy',
    enrolled: true,
    httpReady: true,
    ipv4Address: '203.0.113.13',
    hostname: 'frankfurt',
    osName: 'Ubuntu',
    cpuCores: 2,
    uptimeSeconds: '3600',
  },
];
let projects = [
  {
    id: '1',
    name: 'QA project',
    slug: 'qa',
    defaultMode: 'auto',
    createdAt: now,
  },
];
let records = [];
let failNext = false;
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (value, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(value));
  };
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/qa/empty-projects') {
    projects = [];
    return send({ ok: true });
  }
  if (path === '/qa/fail-next') {
    failNext = true;
    return send({ ok: true });
  }
  if (path === '/api/health/me')
    return send({
      status: 'ok',
      wallet: { balanceToman: '100000', aboveMinBalance: true },
      plan: { name: 'QA plan' },
      usage: {
        activeCredentials: 1,
        enabledForwarders: 0,
        totalForwarders: 0,
        totalCallsAllTime: '0',
        totalBytesIn: '0',
      },
    });
  if (path === '/api/countries')
    return send([{ code: 'DE', name: 'Germany', enabled: true }]);
  if (path === '/api/nodes/my/available')
    return send(nodes.filter((n) => n.httpReady && !n.userPaused));
  if (path === '/api/proxy-credentials/socks5/endpoints')
    return send({
      requiresActivePlan: false,
      endpoints: nodes
        .filter((n) => n.httpReady && !n.userPaused)
        .map((n) => ({
          nodeId: n.id,
          label: n.label,
          countryCode: 'DE',
          countryName: 'Germany',
          host: n.ipv4Address,
          port: 1080,
        })),
    });
  if (path === '/api/nodes/my' && req.method === 'GET') return send(nodes);
  if (path === '/api/nodes/my' && req.method === 'POST') {
    if (failNext) {
      failNext = false;
      return send({ message: 'QA: could not register node; try again.' }, 503);
    }
    const node = {
      ...base,
      id: String(nodes.length + 1),
      label: body.label,
      status: 'pending',
      enrolled: false,
      httpReady: false,
      sharingRequested: body.sharing === 'request-public',
    };
    nodes.push(node);
    return send({
      node,
      token: 'qa-installation-token-not-a-real-secret',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  }
  const own = path.match(/^\/api\/nodes\/my\/(\d+)(?:\/(.+))?$/);
  if (own) {
    const node = nodes.find((n) => n.id === own[1]);
    if (!node) return send({ message: 'Not found' }, 404);
    if (own[2] === 'enrollment-token')
      return send({
        token: 'qa-renewed-installation-token',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    if (own[2] === 'update') {
      node.updateStatus = 'requested';
      return send({ requested: true });
    }
    if (body.label) node.label = body.label;
    if (body.userPaused !== undefined) {
      node.userPaused = body.userPaused;
      node.httpReady = node.status === 'healthy' && !node.userPaused;
    }
    if (body.sharing === 'request-public') node.sharingRequested = true;
    if (body.sharing === 'private') {
      node.sharingRequested = false;
      node.visibility = 'private';
    }
    return send({ success: true });
  }
  if (path === '/api/projects' && req.method === 'GET') return send(projects);
  if (path === '/api/projects' && req.method === 'POST') {
    const project = {
      id: String(projects.length + 1),
      name: body.name,
      slug: 'qa',
      defaultMode: 'auto',
      createdAt: now,
    };
    projects.push(project);
    return send(project);
  }
  const project = path.match(/^\/api\/projects\/(\d+)$/);
  if (project)
    return send({
      project: projects.find((p) => p.id === project[1]),
      records,
    });
  if (path === '/api/forwarders' && req.method === 'GET')
    return send({ userSlug: 'qa', forwarders: [] });
  if (
    (path === '/api/forwarders' || path === '/api/proxy-credentials') &&
    req.method === 'POST'
  ) {
    const record = {
      ...body,
      id: `qa-record-${records.length + 1}`,
      rawId: String(records.length + 1),
      type: path.endsWith('forwarders') ? 'forwarder' : 'socks5',
      uuid: 'qa-credential',
      slug: 'forwarder',
      routingMode: 'auto',
      countryCode: null,
      countryCodes: [],
      enabled: true,
      callCount: '0',
      bytesIn: '0',
      bytesOut: '0',
      lastUsedAt: null,
      createdAt: now,
    };
    records.push(record);
    return send({ ...record, secret: 'qa-secret-not-a-real-secret' });
  }
  if (path === '/api/admin/nodes')
    return send(
      nodes.map((n) => ({
        ...n,
        nodeSecretHash: n.enrolled ? 'qa-hash' : null,
        submittedBy: { id: '7', displayName: 'QA user' },
      })),
    );
  const approve = path.match(/^\/api\/admin\/nodes\/(\d+)\/(approve|reject)$/);
  if (approve) {
    const node = nodes.find((n) => n.id === approve[1]);
    if (approve[2] === 'approve') {
      node.status = 'healthy';
      node.httpReady = true;
      if (node.sharingRequested) node.visibility = 'public';
    }
    node.sharingRequested = false;
    return send(node);
  }
  return send({ message: `Missing UI fixture: ${req.method} ${path}` }, 404);
});
server.listen(3218, '127.0.0.1', () =>
  console.log('UI fixture API on 127.0.0.1:3218'),
);
