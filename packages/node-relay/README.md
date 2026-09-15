# node-relay

Runs on every ProxyNet node alongside the Go platform-agent. When a user hits
`POST /api/gateway/fetch` on the central control-plane, the control-plane picks
a node matching the user's preferred country and forwards the request here. The
same service also exposes an authenticated SOCKS5 listener for platform users.

## Install (on the node)

Requires Node.js 18+.

```bash
# 1. Copy this directory to the node (or clone the repo)
scp -r packages/node-relay/ root@your-node:/opt/proxynet/

# 2. Start it with the same secret that's in your agent.yaml
NODE_SECRET=$(python3 -c "import json;print(json.load(open('/root/agent.yaml'))['node_secret'])") \
  pm2 start /opt/proxynet/node-relay/index.js --name node-relay
pm2 save
```

## Config

| Env var       | Default   | Notes                                            |
|---------------|-----------|--------------------------------------------------|
| `NODE_SECRET` | *required*| Same secret from agent.yaml — used for auth      |
| `RELAY_PORT`  | `9443`    | Port the relay listens on                        |
| `RELAY_HOST`  | `0.0.0.0` | Bind address                                     |
| `NODE_ID` | agent config | Node ID used to authorize SOCKS5 sessions |
| `CONTROL_PLANE_URL` | agent config | Control-plane URL used by SOCKS5 |
| `SOCKS_HOST` | `0.0.0.0` | SOCKS5 bind address |
| `SOCKS_PORT` | `1080` | Public SOCKS5 TCP port |

## Endpoints

- `GET /health` — liveness check (no auth)
- `POST /fetch` — outbound relay (requires `X-Node-Secret` header)

## SOCKS5 access

SOCKS5 accepts only RFC 1929 username/password authentication. The username is
the user's ProxyNet credential UUID and the password is its one-time secret.
Each session is authorized against the control plane, limited by the user's
plan quota, and reported for metering/billing. Private, loopback, and link-local
destinations are blocked.

SOCKS5 credentials are sent in cleartext by the SOCKS5 protocol. Operators and
users should use this port only from trusted networks or behind a trusted tunnel.

## Firewall

Open TCP `1080` for SOCKS5 users after installing the current node release.
Open TCP `9443` inbound from the control-plane server only. Do NOT expose to the
public internet — the relay is not rate-limited.
