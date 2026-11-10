import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import { encryptRelaySecret } from '../apps/control-plane/src/nodes/relay-secret.crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Setting up local edge node on 91.223.61.106 ===');

  // 1. Ensure IR country exists
  const country = await prisma.country.upsert({
    where: { code: 'IR' },
    create: {
      code: 'IR',
      name: 'Iran',
      enabled: true,
      autoModeEligible: true,
    },
    update: {
      enabled: true,
      autoModeEligible: true,
    },
  });
  console.log(`✓ Country ${country.code} (${country.name}) is enabled`);

  // 2. Generate node secret
  const nodeSecret = randomBytes(32).toString('hex');
  const nodeSecretHash = await bcrypt.hash(nodeSecret, 10);
  const relaySecretEncrypted = encryptRelaySecret(nodeSecret);

  // 3. Find or create node
  let node = await prisma.node.findFirst({
    where: { ipv4Address: '91.223.61.106' },
  });

  if (!node) {
    node = await prisma.node.create({
      data: {
        countryCode: 'IR',
        label: 'Tehran-01 (Local Edge)',
        ipv4Address: '91.223.61.106',
        status: 'active',
        roles: ['relay', 'socks5'],
        nodeSecretHash,
        relaySecretEncrypted,
        configVersion: 1n,
      },
    });
    console.log(`✓ Created new node #${node.id} (${node.label})`);
  } else {
    node = await prisma.node.update({
      where: { id: node.id },
      data: {
        countryCode: 'IR',
        label: 'Tehran-01 (Local Edge)',
        status: 'active',
        roles: ['relay', 'socks5'],
        nodeSecretHash,
        relaySecretEncrypted,
      },
    });
    console.log(`✓ Updated existing node #${node.id} (${node.label})`);
  }

  // 4. Create /etc/proxynet directory if needed
  fs.mkdirSync('/etc/proxynet', { recursive: true });

  // 5. Write agent.json
  const agentJson = {
    node_id: String(node.id),
    control_endpoint: 'https://panel.civonex.ir',
    node_secret: nodeSecret,
  };
  fs.writeFileSync('/etc/proxynet/agent.json', JSON.stringify(agentJson, null, 2), { mode: 0o600 });
  console.log('✓ Wrote /etc/proxynet/agent.json');

  // 6. Write relay.env
  const relayEnv = [
    `NODE_SECRET=${nodeSecret}`,
    `NODE_ID=${node.id}`,
    `CONTROL_PLANE_URL=https://panel.civonex.ir`,
    `RELAY_HOST=0.0.0.0`,
    `RELAY_PORT=9443`,
    `SOCKS_HOST=0.0.0.0`,
    `SOCKS_PORT=1080`,
  ].join('\n') + '\n';
  fs.writeFileSync('/etc/proxynet/relay.env', relayEnv, { mode: 0o600 });
  console.log('✓ Wrote /etc/proxynet/relay.env');

  // 7. Write systemd services
  const relayService = `[Unit]
Description=ProxyNet node relay (HTTP fetch forwarder & SOCKS5)
After=network-online.target civonex-api.service
Wants=network-online.target

[Service]
Type=simple
User=root
EnvironmentFile=/etc/proxynet/relay.env
ExecStart=/usr/bin/node /usr/local/lib/proxynet/node-relay.js
Restart=always
RestartSec=3s

[Install]
WantedBy=multi-user.target
`;
  fs.writeFileSync('/etc/systemd/system/proxynet-relay.service', relayService);
  console.log('✓ Wrote /etc/systemd/system/proxynet-relay.service');

  const agentService = `[Unit]
Description=ProxyNet agent (heartbeat + telemetry)
After=network-online.target civonex-api.service
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/lib/proxynet/platform-agent -config /etc/proxynet/agent.json
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
`;
  fs.writeFileSync('/etc/systemd/system/proxynet-agent.service', agentService);
  console.log('✓ Wrote /etc/systemd/system/proxynet-agent.service');

  console.log('\nNode setup complete!');
  console.log(`Node ID: ${node.id}`);
  console.log(`Node Label: ${node.label}`);
  console.log(`Country: ${node.countryCode}`);
  console.log(`IPv4: ${node.ipv4Address}`);
}

main()
  .catch((e) => {
    console.error('Error setting up node:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
