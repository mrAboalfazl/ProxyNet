# node-relay

Runs on every ProxyNet node alongside the Go platform-agent. When a user hits
`POST /api/gateway/fetch` on the central control-plane, the control-plane picks
a node matching the user's preferred country and forwards the request here.

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

## Endpoints

- `GET /health` — liveness check (no auth)
- `POST /fetch` — outbound relay (requires `X-Node-Secret` header)

## Firewall

Open TCP `9443` inbound from the control-plane server only. Do NOT expose to the
public internet — the relay is not rate-limited.
