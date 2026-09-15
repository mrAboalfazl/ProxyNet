'use client';

import { useState } from 'react';
import { colors } from './ui';
import { t, Lang } from './i18n';

interface CopyableCodeBlockProps {
  code: string;
  language?: string;
}

function CopyableCodeBlock({ code, language }: CopyableCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <pre style={{
        background: '#0f172a', color: '#e2e8f0', borderRadius: 8, margin: 0,
        padding: '14px 16px', fontSize: 12.5, lineHeight: 1.6, overflowX: 'auto',
        direction: 'ltr', whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
      }}>
        <code>{code}</code>
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.2)',
          background: copied ? '#166534' : 'rgba(255,255,255,0.05)',
          color: copied ? '#dcfce7' : '#94a3b8',
          fontWeight: 500,
        }}
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
      {language && (
        <span style={{
          position: 'absolute', top: 8, left: 12,
          fontSize: 10, color: '#64748b', fontWeight: 600,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          {language}
        </span>
      )}
    </div>
  );
}

export type Snippet = { curl: string; python: string; js: string; node: string; php: string };

interface CodeExamplesPanelProps {
  lang: Lang;
  intro: string;
  snippets: Snippet;
}

const TABS: Array<{ key: keyof Snippet; labelKey: string; icon: string }> = [
  { key: 'curl',   labelKey: 'examples.tab.curl',   icon: '$' },
  { key: 'python', labelKey: 'examples.tab.python', icon: '🐍' },
  { key: 'js',     labelKey: 'examples.tab.js',     icon: 'JS' },
  { key: 'node',   labelKey: 'examples.tab.node',   icon: 'N' },
  { key: 'php',    labelKey: 'examples.tab.php',    icon: 'P' },
];

export function CodeExamplesPanel({ lang, intro, snippets }: CodeExamplesPanelProps) {
  const [active, setActive] = useState<keyof Snippet>('curl');
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '16px 22px 12px', borderBottom: `1px solid ${colors.border}`, background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: colors.navy }}>{t(lang, 'examples.title')}</span>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: '#e0f2fe', color: '#075985', fontWeight: 700, letterSpacing: '0.05em',
          }}>
            &lt;/&gt;
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: colors.textMuted, lineHeight: 1.6 }}>{intro}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${colors.border}`, background: '#f8fafc', padding: '0 12px' }}>
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                padding: '10px 16px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: isActive ? 700 : 500,
                color: isActive ? colors.primary : colors.textMuted,
                borderBottom: `2px solid ${isActive ? colors.primary : 'transparent'}`,
                marginBottom: -1, display: 'flex', gap: 6, alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, opacity: 0.6 }}>{tab.icon}</span>
              {t(lang, tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Code */}
      <div style={{ padding: 16 }}>
        <CopyableCodeBlock code={snippets[active]} />
      </div>
    </div>
  );
}

/**
 * Build the code snippets for a FORWARDER URL — user pastes URL into their code
 * and calls the target through it. No auth headers needed.
 */
export function buildForwarderSnippets(forwarderUrl: string): Snippet {
  const targetPath = '/optional/path?param=value';
  const jsonBody = `{"key":"value"}`;
  return {
    curl: `# Any HTTP method works. Path and query pass through to your target.
curl "${forwarderUrl}${targetPath}"

# POST with a body:
curl -X POST "${forwarderUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${jsonBody}'`,

    python: `import requests

# GET
r = requests.get("${forwarderUrl}${targetPath}")
print(r.status_code, r.text)

# POST with JSON body
r = requests.post("${forwarderUrl}", json={"key": "value"})
print(r.json())`,

    js: `// Browser or Deno / Bun
const r = await fetch("${forwarderUrl}${targetPath}");
const data = await r.json();
console.log(data);

// POST with JSON body:
await fetch("${forwarderUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "value" }),
});`,

    node: `// Node.js 18+ (built-in fetch) or install axios
const r = await fetch("${forwarderUrl}${targetPath}");
console.log(await r.text());

// Or with axios:
// const axios = require('axios');
// const { data } = await axios.get("${forwarderUrl}${targetPath}");`,

    php: `<?php
// GET
$response = file_get_contents("${forwarderUrl}${targetPath}");
echo $response;

// POST with JSON (with cURL for real projects):
$ch = curl_init("${forwarderUrl}");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(["key" => "value"]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
echo curl_exec($ch);`,
  };
}

/**
 * Build the code snippets for the HTTP Gateway (UUID + Secret + Basic auth).
 * Response is JSON-wrapped: { status, headers, body, bytesIn, bytesOut, viaNodeId }.
 */
export function buildGatewaySnippets(apiBase: string, uuid: string, secretPlaceholder = 'YOUR_SECRET'): Snippet {
  const basicRaw = `${uuid}:${secretPlaceholder}`;
  return {
    curl: `# Base64-encode UUID:SECRET for Basic auth
BASIC=$(echo -n "${basicRaw}" | base64)

curl -X POST "${apiBase}/gateway/fetch" \\
  -H "Authorization: Basic $BASIC" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/api/data"}'`,

    python: `import base64
import requests

UUID = "${uuid}"
SECRET = "${secretPlaceholder}"
creds = base64.b64encode(f"{UUID}:{SECRET}".encode()).decode()

r = requests.post(
    "${apiBase}/gateway/fetch",
    headers={"Authorization": f"Basic {creds}"},
    json={"url": "https://example.com/api/data"},
)
data = r.json()
print("status:", data["status"])
print("body:  ", data["body"])`,

    js: `const UUID = "${uuid}";
const SECRET = "${secretPlaceholder}";
const creds = btoa(\`\${UUID}:\${SECRET}\`);

const r = await fetch("${apiBase}/gateway/fetch", {
  method: "POST",
  headers: {
    "Authorization": \`Basic \${creds}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ url: "https://example.com/api/data" }),
});
const data = await r.json();
console.log(data.status, data.body);`,

    node: `// Node.js 18+
const UUID = "${uuid}";
const SECRET = "${secretPlaceholder}";
const creds = Buffer.from(\`\${UUID}:\${SECRET}\`).toString("base64");

const r = await fetch("${apiBase}/gateway/fetch", {
  method: "POST",
  headers: {
    "Authorization": \`Basic \${creds}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ url: "https://example.com/api/data" }),
});
const data = await r.json();
console.log(data);`,

    php: `<?php
$uuid   = "${uuid}";
$secret = "${secretPlaceholder}";
$creds  = base64_encode("$uuid:$secret");

$ch = curl_init("${apiBase}/gateway/fetch");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Basic $creds",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode(["url" => "https://example.com/api/data"]),
    CURLOPT_RETURNTRANSFER => true,
]);
$response = json_decode(curl_exec($ch), true);
echo "status: {$response['status']}\\n";
echo "body:   {$response['body']}\\n";`,
  };
}
