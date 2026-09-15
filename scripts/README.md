# ProxyNet node install

One command installs the platform agent + node relay on any Linux box and
registers it with the control plane.

## Prerequisites

- Ubuntu 20.04+ / Debian 11+ / RHEL 9+ / AlmaLinux 9+ / Rocky 9+
- x86_64 or arm64
- root or sudo
- An enrollment token from the admin panel (Admin → Nodes → your node → *Generate enrollment token*)
- Outbound HTTPS to the control-plane URL
- Port `9443/tcp` reachable from the control-plane server

## Install

Interactive (prompts for the token):

```bash
curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh | sudo bash
```

Non-interactive (CI, provisioning tools):

```bash
curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh \
  | sudo bash -s -- --panel https://api.civonex.ir --token YOUR_TOKEN_HERE
```

The installer:

1. Detects your OS + CPU arch and installs prerequisites (`curl`, `jq`, Node.js 20)
2. Creates a dedicated system user `proxynet` (nologin, no home)
3. Calls the control-plane `/api/nodes/enroll` with your token → gets back your node ID and secret
4. Downloads the platform-agent binary and node-relay
5. Writes hardened systemd units (`NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, private devices, restricted address families)
6. Opens `9443/tcp` in `ufw` or `firewalld` if either is active
7. Enables the SELinux `nis_enabled` boolean on RHEL-family systems (needed for the service to reach the control-plane)
8. Starts both services and verifies they're healthy
9. Installs the `proxynetctl` management CLI

Total time: ~30 seconds on a warm box.

## Manage

```
proxynetctl status              # service + connectivity check
proxynetctl logs [agent|relay]  # follow journalctl (default: agent)
proxynetctl restart             # restart both services
proxynetctl upgrade [VERSION]   # pull latest binaries and restart
proxynetctl uninstall           # remove everything
```

## Layout

```
/usr/local/lib/proxynet/     binaries (platform-agent, node-relay.js)
/etc/proxynet/               config (agent.json, relay.env) — mode 0640, group proxynet
/var/lib/proxynet/           state (writable by the service, nothing else)
/var/log/proxynet-install.log
/etc/systemd/system/         proxynet-agent.service, proxynet-relay.service
/usr/local/bin/proxynetctl   management CLI
```

Logs go to the systemd journal — use `journalctl -u proxynet-agent -f` or
`proxynetctl logs`.

## Uninstall

```bash
sudo proxynetctl uninstall
# or, without proxynetctl:
curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh | sudo bash -s -- --uninstall
```

Removes services, binaries, config, state directory, and the `proxynet` user.
Firewall rules are left alone — remove them by hand if you no longer need
`9443/tcp` open.

## Troubleshooting

**Agent won't start / heartbeat fails**

```
proxynetctl status
journalctl -u proxynet-agent -n 50
```

Common causes:
- Token expired or already used → get a fresh one from the admin panel
- Control-plane URL wrong → check `/etc/proxynet/agent.json`
- SELinux blocking the connect syscall → the installer sets `nis_enabled=1`;
  if you disabled it, re-run `sudo setsebool -P nis_enabled 1`

**Relay not reachable from the control-plane**

```
curl http://<node-public-ip>:9443/health   # from the control-plane box
```

If this times out, port `9443/tcp` is blocked at your firewall or cloud
provider security group. Open it inbound from the control-plane IP only.

**Force a fresh enrollment**

```
sudo proxynetctl uninstall
# then re-run the installer with a fresh token
```
