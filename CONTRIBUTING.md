# Contributing

Thanks for your interest. This repo contains the node-facing pieces of
ProxyNet — the installer, management CLI, HTTP relay, and systemd unit
templates. The control-plane and web panel live in a separate, private repo.

## What's welcome

- Bug reports (open an issue with reproduction steps)
- Documentation improvements
- Portability fixes (new distros, arm builds, edge cases)
- Installer hardening (shellcheck fixes, better error messages)
- Improved test coverage for the relay
- Wire-protocol client implementations in other languages

## What's not accepted

- Changes to the control-plane API contract (open an issue to discuss first —
  the private repo needs to change in lockstep)
- Additions that assume a specific hosting provider or region
- Features that require new panel-side endpoints without prior agreement

## Development

The relay has no runtime dependencies — Node.js 18+ built-ins only:

```bash
NODE_SECRET=test node packages/node-relay/index.js
curl http://127.0.0.1:9443/health
```

The installer can be tested in a fresh Docker container:

```bash
docker run --rm -it debian:12 bash
apt-get update && apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh \
  | bash -s -- --panel https://your-test-panel --token TESTING_TOKEN
```

## Commit style

- Present-tense, imperative subject: `add ipv6 fallback` (not `added` / `adds`)
- Reference issues in the body if applicable
- Keep the diff focused — split unrelated changes into separate commits

## Signing off

By opening a pull request you certify the [Developer Certificate of Origin](https://developercertificate.org/):
your contribution is your own or you have the right to submit it under the
MIT license.
