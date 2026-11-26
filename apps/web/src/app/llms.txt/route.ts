import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function resolveOrigin(req: NextRequest): string {
  const envBase = process.env.NEXT_PUBLIC_PUBLIC_API_BASE?.trim();
  if (envBase) {
    try {
      return new URL(envBase).origin;
    } catch {
      return envBase.replace(/\/+$/, '').replace(/\/api$/i, '');
    }
  }
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    req.headers.get('host') ||
    'panel.civonex.ir';
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const origin = resolveOrigin(req);

  const body = `# ProxyNet (Civonex) — Developer & AI Gateway Guide

> High-speed, zero-buffer SSE & HTTP/HTTPS Forwarder + WireGuard/AmneziaWG Upstream Pool + SOCKS5 Proxy.

- Web Panel & Public Docs: ${origin}/docs
- Public OpenAPI 3.0.3 JSON: ${origin}/api/openapi.json
- Interactive Swagger UI: ${origin}/api/docs
- Control Plane Health: ${origin}/api/health

## 1. Forwarder Proxy (Recommended for AI Gateways, SSE Streaming & REST APIs)

Create a forwarder in \`${origin}/user/forwarders\` pointing at any HTTPS target (for example \`https://api.openai.com\`, \`https://opencode.ai\`, \`https://openrouter.ai\`, \`https://api.anthropic.com\`, or \`https://api.telegram.org\`).

URL format (authentication is embedded in the two unguessable slugs):
\`\`\`
${origin}/api/f/{userSlug}/{forwarderSlug}[/optional/path/suffix][?query]
\`\`\`

Key behaviors:
- **Zero-buffer SSE streaming:** \`text/event-stream\` responses flush chunk-by-chunk with a 300s idle timeout (\`x-accel-buffering: no\`).
- **Privacy header sanitization:** Strips \`X-Forwarded-For\`, \`X-Real-IP\`, \`Forwarded\`, \`CF-Connecting-IP\`, and similar origin headers outbound so upstream APIs only see the clean exit IP.
- **Authorization passthrough:** Your upstream \`Authorization\` / \`x-api-key\` header is forwarded verbatim to the target (controlled by \`forwardAuthHeader\`).
- **Routing modes:**
  - \`auto\` (recommended): Round-Robin load balancing + instant pre-header failover across healthy WireGuard/AmneziaWG/SOCKS5 upstream tunnels.
  - \`country\`: Ordered exit country preference (e.g. \`["NL", "DE"]\`).
  - \`tunnel\`: Pinned to a single specific \`upstreamTunnelId\` (fail-closed; never leaks local IP).
  - \`direct\`: Direct edge egress without upstream tunnel.
- **Response diagnostic headers:** \`x-proxynet-via-tunnel\`, \`x-proxynet-via-protocol\`, \`x-proxynet-via-country\`.
- **Body limit:** 10 MB per request (\`HTTP 413\` if exceeded).

### OpenAI SDK (Python)
\`\`\`python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_OPENAI_API_KEY",
    base_url="${origin}/api/f/{userSlug}/{forwarderSlug}/v1",
)
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    stream=True,
    messages=[{"role": "user", "content": "Hello!"}],
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
\`\`\`

### OpenAI SDK (Node.js / TypeScript)
\`\`\`ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: '${origin}/api/f/{userSlug}/{forwarderSlug}/v1',
});
\`\`\`

### OpenCode / T3 Code (\`~/.config/opencode/opencode.jsonc\`)
Point a forwarder at \`https://opencode.ai\`:
\`\`\`json
{
  "provider": {
    "civonex": {
      "name": "Civonex OpenCode Go",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "${origin}/api/f/{userSlug}/{forwarderSlug}/inference/go/openai/v1",
        "apiKey": "oc_sk_YOUR_KEY"
      },
      "models": {
        "deepseek-v4.1-flash": { "name": "DeepSeek V4.1 Flash" },
        "mimo-v2.6-flash": { "name": "MiMo-V2.6-Flash" }
      }
    }
  }
}
\`\`\`

### Claude Code (\`~/.claude/settings.json\`)
Point a forwarder at \`https://api.anthropic.com\` (or \`https://opencode.ai\` with \`/inference/go/anthropic\`):
\`\`\`json
{
  "env": {
    "ANTHROPIC_BASE_URL": "${origin}/api/f/{userSlug}/{forwarderSlug}",
    "ANTHROPIC_AUTH_TOKEN": "YOUR_ANTHROPIC_OR_OPENCODE_KEY"
  }
}
\`\`\`

### Telegram Bot API
Point a forwarder at \`https://api.telegram.org\`:
\`\`\`bash
curl "${origin}/api/f/{userSlug}/{forwarderSlug}/bot<BOT_TOKEN>/getMe"
\`\`\`

## 2. HTTP Gateway API (Basic Auth JSON Envelope)

Endpoint: \`POST ${origin}/api/gateway/fetch\`
Auth: \`Authorization: Basic base64(credential_uuid:credential_secret)\`

\`\`\`bash
curl -X POST "${origin}/api/gateway/fetch" \\
  -u "CREDENTIAL_UUID:CREDENTIAL_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://api.ipify.org?format=json","method":"GET"}'
\`\`\`

## 3. SOCKS5 Proxy

Generate credentials in \`${origin}/user/credentials\`:
\`\`\`bash
curl --socks5-hostname "CREDENTIAL_UUID:CREDENTIAL_SECRET@<NODE_IP>:1080" https://api.ipify.org
\`\`\`

## 4. Management API (JWT Bearer)

See full schema at ${origin}/api/openapi.json:
- \`GET /api/forwarders\` — list forwarders & get your \`userSlug\`
- \`POST /api/forwarders\` — create forwarder (\`label\`, \`targetUrl\`, \`routingMode\`, \`upstreamTunnelId\`, \`countryCodes\`, \`streamingEnabled\`)
- \`PATCH /api/forwarders/{id}\` — switch routing mode / tunnel / countries
- \`DELETE /api/forwarders/{id}\` — delete forwarder
- \`GET /api/upstreams/available\` — list healthy upstream tunnels available in your plan
- \`GET /api/proxy-credentials\` / \`POST /api/proxy-credentials\` — manage SOCKS5 credentials
- \`GET /api/projects\` / \`POST /api/projects\` — organize forwarders & credentials by project
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
