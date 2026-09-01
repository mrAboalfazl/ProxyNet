# Node ↔ Control-plane wire protocol

The node agent and node-relay in this repo talk to a ProxyNet control-plane
over HTTPS. The control-plane is closed-source, but this document specifies
the contract so:

- Operators can trust and audit what the agent sends
- Third parties can build alternative agents (Go, Rust, whatever)
- Regressions in the control-plane are detectable from the outside

Base URL is set at install time (`--panel` flag). Default: `https://api.civonex.ir`.

---

## 1. Enrollment (one-time, at install)

**Endpoint:** `POST /api/nodes/enroll`
**Auth:** none — the token *is* the auth
**Request body:**

```json
{
  "token": "hex-encoded enrollment token from the admin panel",
  "agentVersion": "v1.0.0",
  "ipv4Address": "203.0.113.5",   // optional; auto-detected by installer
  "ipv6Address": "2001:db8::1"    // optional
}
```

**Success (200):**

```json
{
  "id": "42",                         // stringified bigint
  "label": "frankfurt-01",
  "countryCode": "DE",
  "status": "pending" | "active",
  "nodeSecret": "hex string (32 bytes)"  // returned ONCE — installer stores it
}
```

**Notes:**
- Tokens are single-use. Reusing returns `null` / 4xx.
- The `nodeSecret` is stored bcrypt-hashed server-side; only the plaintext
  returned here can be used for future authentication.
- `status: "pending"` means the node was self-submitted by a user and needs
  admin approval before it receives traffic.

## 2. Heartbeat (every 15 seconds)

**Endpoint:** `POST /api/nodes/:id/heartbeat`
**Auth:** `Authorization: Bearer <nodeSecret>`
**Request body:**

```json
{
  "configVersion": 68,        // optional; current snapshot version the agent has
  "activeSessions": 0,        // optional
  "agentVersion": "v1.0.0",   // optional
  "cpuPct": 12,               // optional
  "memPct": 34                // optional
}
```

**Success (200):**

```json
{
  "receivedAt": "2026-09-01T09:00:00.000Z",
  "configVersion": 68
}
```

## 3. Snapshot fetch (on config version change)

**Endpoint:** `GET /api/nodes/:id/snapshot`
**Auth:** `Authorization: Bearer <nodeSecret>`

Returns the current routing snapshot (list of active nodes, policies, weights).
Used by the agent to know about peer nodes for internal routing.

## 4. Credential verification (per client session)

**Endpoint:** `POST /api/nodes/:id/credential-verify`
**Auth:** `Authorization: Bearer <nodeSecret>`
**Request body:**

```json
{ "uuid": "user-credential-uuid", "secret": "user-credential-secret" }
```

**Success (200):**

```json
{ "allowed": true, "quotaToken": { "bytesRemaining": "...", "connsRemaining": 5, ... } }
```

**Denied (200):**

```json
{ "allowed": false, "reason": "invalid_credential" | "no_quota_token" | "quota_exhausted" }
```

## 5. Usage reporting (session end)

**Endpoint:** `POST /api/nodes/:id/usage-events`
**Auth:** `Authorization: Bearer <nodeSecret>`
**Request body:**

```json
{
  "userId": "123",
  "sessionId": "opaque-string",
  "eventType": "session_end" | "session_start" | "quota_hit",
  "protocol": "http" | "socks5" | "tcp" | "udp",
  "bytesIn": "1048576",       // stringified bigint
  "bytesOut": "524288",
  "sessionSeconds": 42,
  "exitCountry": "DE",
  "exitNodeId": "42",
  "destination": "example.com:443"    // opt-in — some deployments disable
}
```

**Success (202):** `{ "accepted": true }`

## 6. Node-relay incoming (from the control-plane)

The relay listens on `:9443` (configurable) and accepts requests **from the
control-plane only**. Operators should firewall this port to the control-plane
IP.

**Endpoint:** `POST /fetch`
**Auth:** `X-Node-Secret: <nodeSecret>` (the same secret used for outbound auth)
**Request body:**

```json
{
  "url": "https://target-site.com/path",
  "method": "GET",                  // optional
  "headers": { "X-Foo": "bar" },    // optional
  "body": "..."                     // optional string
}
```

**Success (200):**

```json
{
  "status": 200,
  "headers": { "content-type": "application/json", ... },
  "body": "response body as utf-8 string",
  "bytesIn": 1234,
  "bytesOut": 0
}
```

**Health check:** `GET /health` returns `{"status":"ok","ts":"..."}` with no auth.

---

## Security properties

- All node-to-control-plane traffic uses HTTPS
- Node secrets are 32-byte random tokens, bcrypt-hashed server-side
- SSRF: the relay refuses to fetch RFC1918 / loopback / link-local / IPv6 ULA / fe80 addresses
- Request/response bodies capped at 10 MB, timeout at 30 s
- Hop-by-hop headers (`Host`, `Connection`, `Content-Length`, `Transfer-Encoding`, `Authorization`, `Proxy-Authorization`) are stripped from client-supplied headers before the outbound fetch
- The relay's `User-Agent` is rewritten to `ProxyNet-NodeRelay/1.0`

## Versioning

The protocol version is implicit in the agent's `agentVersion` string. Any
breaking change to a request/response shape gets a new endpoint (e.g.
`/api/v2/...`) — old agents keep working against the old endpoint until
formally deprecated in the release notes.
