'use client';

import { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { t, Lang } from './i18n';
import { toast } from 'sonner';
import { CodeTerminal, type CodeTerminalTab } from '@/components/code-terminal';

export type Snippet = { curl: string; python: string; js: string; node: string; php: string };

interface CodeExamplesPanelProps {
  lang: Lang;
  intro: string;
  snippets: Snippet;
}

const TABS: Array<{ key: keyof Snippet; labelKey: string }> = [
  { key: 'curl',   labelKey: 'examples.tab.curl' },
  { key: 'php',    labelKey: 'examples.tab.php' },
  { key: 'python', labelKey: 'examples.tab.python' },
  { key: 'node',   labelKey: 'examples.tab.node' },
  { key: 'js',     labelKey: 'examples.tab.js' },
];

const FILE_MAP: Record<keyof Snippet, { filename: string; tag: string }> = {
  curl: { filename: 'request.sh', tag: 'cURL' },
  python: { filename: 'proxynet_client.py', tag: 'Python' },
  js: { filename: 'client.js', tag: 'JavaScript' },
  node: { filename: 'server.js', tag: 'Node.js' },
  php: { filename: 'gateway.php', tag: 'PHP' },
};

export function CopyableCodeBlock({
  code,
  language,
  filename,
  isRTL = false,
}: {
  code: string;
  language?: string;
  filename?: string;
  isRTL?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(isRTL ? 'کپی شد' : 'Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-[#0d1117] text-zinc-100 overflow-hidden shadow-md text-left"
      dir="ltr"
    >
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-zinc-900/95 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="text-zinc-300 font-sans font-medium text-xs truncate">
            {filename || language || 'terminal — bash'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all active:scale-95 ${
            copied
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 hover:text-white'
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">{isRTL ? 'کپی شد!' : 'Copied!'}</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>{isRTL ? 'کپی کد' : 'Copy'}</span>
            </>
          )}
        </button>
      </div>

      <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto text-zinc-200 selection:bg-primary/30">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CodeExamplesPanel({ lang, intro, snippets }: CodeExamplesPanelProps) {
  const isRTL = lang === 'fa';
  const tabs: CodeTerminalTab[] = TABS.map((tab) => ({
    key: tab.key,
    label: t(lang, tab.labelKey),
    filename: FILE_MAP[tab.key].filename,
    code: snippets[tab.key],
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="font-bold text-sm text-foreground">{t(lang, 'examples.title')}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{intro}</p>
      <CodeTerminal tabs={tabs} isRTL={isRTL} />
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
 * Response is JSON-wrapped: { status, headers, body, isBase64, bytesIn, bytesOut, viaNodeId }.
 */
export function buildGatewaySnippets(apiBase: string, uuid: string, secretPlaceholder = 'YOUR_SECRET'): Snippet {
  const basicRaw = `${uuid}:${secretPlaceholder}`;
  return {
    curl: `# Base64-encode UUID:SECRET for Basic auth
BASIC=$(echo -n "${basicRaw}" | base64)

# 1. Standard Request
curl -X POST "${apiBase}/gateway/fetch" \\
  -H "Authorization: Basic $BASIC" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://api.ipify.org?format=json"}'

# 2. Advanced: Upstream Auth, Redirects & Insecure SSL
curl -X POST "${apiBase}/gateway/fetch" \\
  -H "Authorization: Basic $BASIC" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://api.example.com/v1/secure-endpoint",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer YOUR_UPSTREAM_TOKEN",
      "Content-Type": "application/json"
    },
    "body": "{\\"action\\":\\"execute\\"}",
    "followRedirects": true,
    "insecure": false,
    "timeoutMs": 30000
  }'`,

    python: `import base64
import requests

UUID = "${uuid}"
SECRET = "${secretPlaceholder}"
creds = base64.b64encode(f"{UUID}:{SECRET}".encode()).decode()

# Outbound request via ProxyNet Gateway
payload = {
    "url": "https://api.example.com/v1/data",
    "method": "GET",
    "headers": {
        "Authorization": "Bearer YOUR_UPSTREAM_TOKEN"  # Passed to destination intact
    },
    "followRedirects": True,
    "insecure": False,  # Set True for Self-Signed SSL
    "timeoutMs": 30000
}

r = requests.post(
    "${apiBase}/gateway/fetch",
    headers={"Authorization": f"Basic {creds}"},
    json=payload,
)
data = r.json()
print("HTTP Status:", data.get("status"))
print("Exit Country:", data.get("viaCountry"))
print("Body:", data.get("body"))`,

    js: `const UUID = "${uuid}";
const SECRET = "${secretPlaceholder}";
const creds = btoa(\`\${UUID}:\${SECRET}\`);

const r = await fetch("${apiBase}/gateway/fetch", {
  method: "POST",
  headers: {
    "Authorization": \`Basic \${creds}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: "https://api.example.com/v1/data",
    method: "GET",
    headers: {
      "Authorization": "Bearer YOUR_UPSTREAM_TOKEN",
    },
    followRedirects: true,
    insecure: false, // Set true if destination uses Self-Signed SSL
    timeoutMs: 30000,
  }),
});
const data = await r.json();
console.log(data.status, data.viaCountry, data.body);`,

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
  body: JSON.stringify({
    url: "https://api.example.com/v1/data",
    method: "POST",
    headers: {
      "Authorization": "Bearer YOUR_UPSTREAM_TOKEN",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ping: "pong" }),
    followRedirects: true,
    insecure: false,
    timeoutMs: 30000,
  }),
});
const data = await r.json();
console.log(data);`,

    php: `<?php
$uuid   = "${uuid}";
$secret = "${secretPlaceholder}";
$creds  = base64_encode("$uuid:$secret");

$payload = [
    'url' => 'https://api.example.com/v1/data',
    'method' => 'POST',
    'headers' => [
        'Authorization' => 'Bearer YOUR_UPSTREAM_TOKEN',
        'Content-Type' => 'application/json',
    ],
    'body' => json_encode(['action' => 'sync']),
    'followRedirects' => true,
    'insecure' => false, // Set true for self-signed certificates
    'timeoutMs' => 30000,
];

$ch = curl_init("${apiBase}/gateway/fetch");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Basic $creds",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
]);
$response = json_decode(curl_exec($ch), true);
curl_close($ch);

echo "Status: {$response['status']}\\n";
echo "Exit Node: {$response['viaCountry']}\\n";
echo "Response Body: {$response['body']}\\n";`,
  };
}
