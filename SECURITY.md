# Security policy

## Reporting a vulnerability

If you find a security issue in the ProxyNet node installer, agent, or relay,
please **do not open a public issue**. Instead, email:

**security@civonex.ir**

Include:
- A description of the issue
- Steps to reproduce (or a proof-of-concept)
- Affected version(s)
- Your assessment of impact

We will acknowledge receipt within 3 business days and aim to publish a fix
and coordinated disclosure within 30 days.

## Scope

This repository covers:
- `scripts/install.sh` — the installer
- `scripts/proxynetctl` — the management CLI
- `packages/node-relay/` — the HTTP relay
- Systemd units and configuration templates
- Published binary releases

Issues in the **control-plane** (the panel + API at api.civonex.ir) or the
**web dashboard** are handled separately; use the same email address.

## Out of scope

- Reports from automated scanners without demonstrated impact
- Issues in old versions where the fix is "upgrade to the latest release"
- Denial-of-service against a specific ProxyNet node (that's the operator's
  responsibility to firewall)

## Bug bounty

We don't currently offer a paid bounty, but we credit reporters in the release
notes for the fix if they wish.
