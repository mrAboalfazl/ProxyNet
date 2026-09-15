# ProxyNet — node installer & agent

Runs a ProxyNet edge/exit node on a Linux box. Single-command install,
systemd-managed, hardened by default.

```bash
curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh \
  | sudo bash
```

Or non-interactive with an enrollment token from your admin panel:

```bash
curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh \
  | sudo bash -s -- --panel https://api.civonex.ir --token YOUR_TOKEN
```

## What this repo contains

| Path | What it is |
|---|---|
| `scripts/install.sh` | The one-liner installer |
| `scripts/proxynetctl` | Node management CLI (status / logs / restart / upgrade / uninstall) |
| `scripts/README.md` | Full operator docs |
| `packages/node-relay/` | HTTP fetch relay (Node.js, no dependencies) |
| `docs/wire-protocol.md` | Node ↔ control-plane API contract |
| `SECURITY.md` | Vulnerability reporting |
| `CONTRIBUTING.md` | How to contribute |

The control-plane (panel, API, database) is closed-source. The wire protocol
between your node and the control-plane is fully documented — you can audit
exactly what the agent sends, and you can build alternative agents if you want.

## Supported platforms

- Debian 11+, Ubuntu 20.04+, RHEL 9+, AlmaLinux 9+, Rocky 9+
- x86_64 (arm64 in progress)
- Node.js 18+ (installed by the script if missing)

## After install

```
proxynetctl status              # health check
proxynetctl logs [agent|relay]  # follow journalctl
proxynetctl restart
proxynetctl upgrade [VERSION]
proxynetctl uninstall
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md) for the disclosure process. Do not open a
public issue for vulnerabilities.

## License

[MIT](./LICENSE).
