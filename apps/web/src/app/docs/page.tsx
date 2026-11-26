'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLang } from '../../lib/lang-context';
import { t } from '../../lib/i18n';
import { CopyableCodeBlock } from '../../lib/code-examples';
import {
  Shield,
  BookOpen,
  Code2,
  Cpu,
  Globe2,
  Zap,
  Lock,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  FileJson,
  Bot,
  Network,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Sliders,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
}

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
}

const METHOD_COLORS: Record<string, string> = {
  get: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  post: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  patch: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  put: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  delete: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
};

export default function PublicDocsPage() {
  const { lang, setLang } = useLang();
  const isRTL = lang === 'fa';
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [origin, setOrigin] = useState('https://panel.civonex.ir');
  const [userSlug, setUserSlug] = useState('YOUR_USER_SLUG');
  const [fwdSlug, setFwdSlug] = useState('YOUR_FORWARDER_SLUG');
  const [apiKey, setApiKey] = useState('YOUR_UPSTREAM_API_KEY');

  const [aiTab, setAiTab] = useState<'opencode' | 'claude' | 'openai-py' | 'openai-js' | 'curl-sse'>('opencode');
  const [generalTab, setGeneralTab] = useState<'telegram' | 'python' | 'node' | 'go' | 'php'>('telegram');
  const [socksTab, setSocksTab] = useState<'curl' | 'python' | 'node' | 'gateway'>('curl');

  const [openApi, setOpenApi] = useState<OpenApiSpec | null>(null);
  const [openApiError, setOpenApiError] = useState<string | null>(null);
  const [copiedLlms, setCopiedLlms] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      setOrigin(window.location.origin);
    }
    fetch('/api/openapi.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: OpenApiSpec) => setOpenApi(data))
      .catch((err) => setOpenApiError((err as Error).message));
  }, []);

  const cleanUserSlug = userSlug.trim() || 'YOUR_USER_SLUG';
  const cleanFwdSlug = fwdSlug.trim() || 'YOUR_FORWARDER_SLUG';
  const cleanKey = apiKey.trim() || 'YOUR_UPSTREAM_API_KEY';
  const fwdBase = `${origin}/api/f/${cleanUserSlug}/${cleanFwdSlug}`;

  const copyText = (value: string, label: string, onDone?: () => void) => {
    navigator.clipboard.writeText(value);
    toast.success(isRTL ? `${label} کپی شد` : `${label} copied`);
    onDone?.();
  };

  const aiSnippets = useMemo(
    () => ({
      opencode: {
        filename: '~/.config/opencode/opencode.jsonc',
        lang: 'json',
        note: tx(
          'Create a forwarder pointing at https://opencode.ai (mode: auto for Round-Robin load balancing across all healthy WireGuard tunnels).',
          'یک فورواردر با مقصد https://opencode.ai و حالت «خودکار (Auto)» بسازید تا ترافیک بین همه تانل‌های سالم وایرگارد بالانس شود.'
        ),
        code: `{
  "provider": {
    "civonex-go": {
      "name": "Civonex OpenCode Go (WireGuard)",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "${fwdBase}/inference/go/openai/v1",
        "apiKey": "${cleanKey}"
      },
      "models": {
        "deepseek-v4.1-flash": { "name": "DeepSeek V4.1 Flash" },
        "mimo-v2.6-flash": { "name": "MiMo-V2.6-Flash" },
        "glm-5.3-flash": { "name": "GLM-5.3-Flash" },
        "kimi-k3.1-pro": { "name": "Kimi K3.1 Pro" }
      }
    }
  }
}`,
      },
      claude: {
        filename: '~/.claude/settings.json',
        lang: 'json',
        note: tx(
          'Point your forwarder at https://api.anthropic.com (or https://opencode.ai and append /inference/go/anthropic for OpenCode Go Anthropic models).',
          'مقصد فورواردر را روی https://api.anthropic.com بگذارید (یا برای مدل‌های Anthropic در OpenCode Go مقصد را https://opencode.ai گذاشته و انتهای URL عبارت /inference/go/anthropic را اضافه کنید).'
        ),
        code: `{
  "env": {
    "ANTHROPIC_BASE_URL": "${fwdBase}",
    "ANTHROPIC_AUTH_TOKEN": "${cleanKey}"
  }
}`,
      },
      'openai-py': {
        filename: 'openai_stream.py',
        lang: 'python',
        note: tx(
          'Works with OpenAI, OpenRouter, DeepSeek, or any OpenAI-compatible API. Zero-buffer SSE streaming works out of the box.',
          'برای OpenAI، OpenRouter، DeepSeek و هر API سازگار با OpenAI قابل استفاده است. استریم SSE بدون بافر و تاخیر اجرا می‌شود.'
        ),
        code: `from openai import OpenAI

client = OpenAI(
    api_key="${cleanKey}",
    base_url="${fwdBase}/v1",
)

stream = client.chat.completions.create(
    model="gpt-4o-mini",
    stream=True,
    messages=[
        {"role": "user", "content": "Write a concise hello in Python."}
    ],
)

for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)`,
      },
      'openai-js': {
        filename: 'openai-stream.ts',
        lang: 'typescript',
        note: tx(
          'Drop-in replacement for the official openai npm package or Vercel AI SDK.',
          'جایگزین مستقیم در پکیج رسمی openai یا Vercel AI SDK بدون تغییر در کد پروژه.'
        ),
        code: `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: '${cleanKey}',
  baseURL: '${fwdBase}/v1',
});

const stream = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  stream: true,
  messages: [{ role: 'user', content: 'Hello via ProxyNet WireGuard!' }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}`,
      },
      'curl-sse': {
        filename: 'stream-test.sh',
        lang: 'bash',
        note: tx(
          'Pass -N (--no-buffer) in cURL to observe tokens arriving live chunk-by-chunk.',
          'برای مشاهده استریم زنده توکن‌ها در ترمینال، سوئیچ -N را در curl قرار دهید.'
        ),
        code: `curl -N -i "${fwdBase}/v1/chat/completions" \\
  -H "Authorization: Bearer ${cleanKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role": "user", "content": "Say hello in one line"}]
  }'`,
      },
    }),
    [fwdBase, cleanKey, lang]
  );

  const generalSnippets = useMemo(
    () => ({
      telegram: {
        filename: 'telegram-bot.sh',
        lang: 'bash',
        code: `# Create a forwarder with targetUrl = https://api.telegram.org
curl "${fwdBase}/bot<YOUR_BOT_TOKEN>/getMe"

# Send a message (works identically in Telegraf / python-telegram-bot / grammY via custom apiRoot)
curl -X POST "${fwdBase}/bot<YOUR_BOT_TOKEN>/sendMessage" \\
  -H "Content-Type: application/json" \\
  -d '{"chat_id": 123456789, "text": "Hello via ProxyNet!"}'`,
      },
      python: {
        filename: 'client.py',
        lang: 'python',
        code: `import httpx

# Forwarder pointing at https://api.ipify.org (or any REST API)
with httpx.Client(timeout=30.0) as client:
    r = client.get("${fwdBase}", params={"format": "json"})
    print("Status:", r.status_code)
    print("Exit Tunnel:", r.headers.get("x-proxynet-via-tunnel"), r.headers.get("x-proxynet-via-country"))
    print("Body:", r.json())`,
      },
      node: {
        filename: 'client.mjs',
        lang: 'javascript',
        code: `const res = await fetch('${fwdBase}?format=json', {
  headers: { Accept: 'application/json' },
});

console.log('Status:', res.status);
console.log('Via Tunnel:', res.headers.get('x-proxynet-via-tunnel'));
console.log('Exit Country:', res.headers.get('x-proxynet-via-country'));
console.log('Body:', await res.json());`,
      },
      go: {
        filename: 'main.go',
        lang: 'go',
        code: `package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	resp, err := http.Get("${fwdBase}?format=json")
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("Country=%s Tunnel=%s Body=%s\\n",
		resp.Header.Get("X-Proxynet-Via-Country"),
		resp.Header.Get("X-Proxynet-Via-Tunnel"),
		string(body),
	)
}`,
      },
      php: {
        filename: 'forwarder.php',
        lang: 'php',
        code: `<?php
$ch = curl_init('${fwdBase}?format=json');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
]);
$response = curl_exec($ch);
curl_close($ch);
echo $response;`,
      },
    }),
    [fwdBase]
  );

  const socksSnippets = useMemo(
    () => ({
      curl: {
        filename: 'socks5-curl.sh',
        lang: 'bash',
        code: `# Create a credential in ${origin}/user/credentials
curl --socks5-hostname "CREDENTIAL_UUID:CREDENTIAL_SECRET@<NODE_IP>:1080" \\
  https://api.ipify.org?format=json`,
      },
      python: {
        filename: 'socks5_httpx.py',
        lang: 'python',
        code: `# pip install "httpx[socks]"
import httpx

proxy_url = "socks5://CREDENTIAL_UUID:CREDENTIAL_SECRET@<NODE_IP>:1080"
with httpx.Client(proxy=proxy_url, timeout=30.0) as client:
    print(client.get("https://api.ipify.org?format=json").json())`,
      },
      node: {
        filename: 'socks5-node.mjs',
        lang: 'javascript',
        code: `// npm install socks-proxy-agent node-fetch
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

const agent = new SocksProxyAgent(
  'socks5h://CREDENTIAL_UUID:CREDENTIAL_SECRET@<NODE_IP>:1080'
);
const res = await fetch('https://api.ipify.org?format=json', { agent });
console.log(await res.json());`,
      },
      gateway: {
        filename: 'http-gateway.sh',
        lang: 'bash',
        code: `# Programmatic HTTP Gateway (Basic Auth with credential UUID + secret)
curl -X POST "${origin}/api/gateway/fetch" \\
  -u "CREDENTIAL_UUID:CREDENTIAL_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://api.ipify.org?format=json",
    "method": "GET"
  }'`,
      },
    }),
    [origin]
  );

  const openApiEndpoints = useMemo(() => {
    if (!openApi?.paths) return [];
    const list: Array<{
      method: string;
      path: string;
      tag: string;
      summary: string;
      description?: string;
      auth: string;
    }> = [];
    for (const [path, methods] of Object.entries(openApi.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) continue;
        const sec = op.security?.[0];
        const auth = sec?.bearerAuth
          ? 'JWT Bearer'
          : sec?.basicAuth
            ? 'Basic Auth'
            : path.startsWith('/api/f/')
              ? 'URL Slugs'
              : 'Public';
        list.push({
          method: method.toLowerCase(),
          path,
          tag: op.tags?.[0] || 'API',
          summary: op.summary || path,
          description: op.description,
          auth,
        });
      }
    }
    return list;
  }, [openApi]);

  const toc = [
    { id: 'quickstart', label: tx('Quickstart & Modes', 'شروع سریع و روش‌ها') },
    { id: 'sandbox', label: tx('Live URL Builder', 'سازنده زنده لینک') },
    { id: 'ai-tools', label: tx('AI Tools & SSE', 'ابزارهای AI و استریم') },
    { id: 'general-apis', label: tx('REST & Telegram Bots', 'APIها و ربات تلگرام') },
    { id: 'socks5', label: tx('SOCKS5 & Gateway', 'SOCKS5 و گیت‌وی') },
    { id: 'routing-privacy', label: tx('Routing, Headers & Privacy', 'مسیریابی، هدرها و امنیت') },
    { id: 'openapi', label: tx('OpenAPI Reference', 'مرجع OpenAPI') },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shadow-sm">
                <Shield className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-base tracking-tight">{t(lang, 'brand')}</span>
                <span className="text-[10px] text-muted-foreground font-mono leading-none">
                  Developer Docs v1.3
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-5 text-xs sm:text-sm font-medium text-muted-foreground">
              <Link href="/" className="hover:text-foreground transition-colors">
                {tx('Home', 'صفحه اصلی')}
              </Link>
              <Link href="/docs" className="text-foreground font-semibold">
                {tx('Docs', 'مستندات')}
              </Link>
              <a
                href="/api/docs"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <span>Swagger UI</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setLang(isRTL ? 'en' : 'fa')}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
            >
              {isRTL ? 'English' : 'فارسی'}
            </button>
            <Link href="/login" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm" className="text-xs">
                {t(lang, 'nav.signin')}
              </Button>
            </Link>
            <Link href="/user/forwarders">
              <Button size="sm" className="text-xs gap-1">
                <span>{tx('Open Panel', 'ورود به پنل')}</span>
                {isRTL ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 via-background to-background py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{tx('Public Developer Documentation & OpenAPI 3.0', 'مستندات عمومی برنامه‌نویسان و OpenAPI 3.0')}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
            {tx(
              'Connect any AI tool, bot, or backend through ProxyNet in 60 seconds',
              'اتصال هر ابزار هوش مصنوعی، ربات یا پروژه به ProxyNet در کمتر از ۱ دقیقه'
            )}
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed">
            {tx(
              'Zero-buffer SSE streaming, multi-country WireGuard/AmneziaWG load balancing, strict origin-IP privacy stripping, and standard SOCKS5 — ready for OpenAI, OpenCode Go, Claude Code, OpenRouter, Telegram Bots, and custom REST services.',
              'استریم زنده SSE بدون بافر، توزیع بار خودکار روی تانل‌های WireGuard و AmneziaWG چندکشوری، حذف کامل هدرهای آی‌پی مبدا و پروکسی استاندارد SOCKS5 — آماده برای OpenAI، OpenCode Go، Claude Code، OpenRouter، ربات‌های تلگرام و هر API دلخواه.'
            )}
          </p>

          {/* Quick Machine-Readable Resource Pills */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <a href="/api/openapi.json" target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs font-mono">
                <FileJson className="h-3.5 w-3.5 text-primary" />
                <span>/api/openapi.json</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Button>
            </a>
            <a href="/api/docs" target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Code2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>{tx('Interactive Swagger UI', 'رابط تعاملی Swagger')}</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-mono"
              onClick={() =>
                copyText(`${origin}/llms.txt`, 'llms.txt URL', () => {
                  setCopiedLlms(true);
                  setTimeout(() => setCopiedLlms(false), 2000);
                })
              }
            >
              {copiedLlms ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
              <span>{tx('Copy /llms.txt for AI Agents', 'کپی لینک /llms.txt برای Cursor / AI')}</span>
            </Button>
            <a href="/llms.txt" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
              {tx('View raw llms.txt', 'مشاهده فایل llms.txt')}
            </a>
          </div>
        </div>
      </section>

      {/* Main Layout: Sidebar TOC + Content */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col lg:flex-row gap-8 flex-1">
        {/* Sticky Sidebar */}
        <aside className="lg:w-60 shrink-0">
          <div className="lg:sticky lg:top-24 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-3 mb-2">
              {tx('On This Page', 'فهرست مطالب')}
            </p>
            <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors whitespace-nowrap"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Docs Content */}
        <main className="flex-1 min-w-0 space-y-12">
          {/* Section 1: Quickstart & 3 Connection Methods */}
          <section id="quickstart" className="scroll-mt-24 space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <span>{tx('1. Quickstart: Choose Your Integration Mode', '۱. شروع سریع: انتخاب روش اتصال مناسب')}</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {tx(
                  'ProxyNet provides three developer-friendly connection layers. For AI gateways, coding tools, and REST APIs, Forwarder is the fastest and cleanest choice.',
                  'ProxyNet سه لایه اتصال استاندارد در اختیارتان می‌گذارد. برای ابزارهای هوش مصنوعی، استریم SSE و APIهای وب، «فورواردر» سریع‌ترین و ساده‌ترین گزینه است.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-primary/40 bg-primary/[0.02]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className="text-[10px]">{tx('Recommended', 'پیشنهادی')}</Badge>
                    <Cpu className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-base pt-2">{tx('HTTP/SSE Forwarder', 'فورواردر HTTP و استریم SSE')}</CardTitle>
                  <CardDescription className="text-xs">
                    {tx(
                      'Replace only the Base URL in any SDK or AI tool. Supports zero-buffer SSE streaming, WireGuard Round-Robin load balancing, and automatic failover.',
                      'فقط Base URL را در کد یا ابزار AI عوض کنید. پشتیبانی کامل از استریم SSE، لودبالانسینگ وایرگارد و Failover خودکار.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-[11px] font-mono text-muted-foreground break-all" dir="ltr">
                  {origin}/api/f/&lt;userSlug&gt;/&lt;fwdSlug&gt;/*
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">Basic Auth</Badge>
                    <Globe2 className="h-4 w-4 text-sky-500" />
                  </div>
                  <CardTitle className="text-base pt-2">{tx('HTTP Fetch Gateway', 'گیت‌وی برنامه‌نویسی HTTP')}</CardTitle>
                  <CardDescription className="text-xs">
                    {tx(
                      'Send dynamic target URLs in a JSON envelope using Basic Auth — ideal when the destination domain changes per request.',
                      'ارسال آدرس مقصد به‌صورت داینامیک داخل JSON با Basic Auth — مناسب زمانی که دامنه مقصد در هر درخواست متفاوت است.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-[11px] font-mono text-muted-foreground break-all" dir="ltr">
                  POST {origin}/api/gateway/fetch
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">TCP / RFC 1928</Badge>
                    <Network className="h-4 w-4 text-emerald-500" />
                  </div>
                  <CardTitle className="text-base pt-2">{tx('SOCKS5 Proxy', 'پروکسی استاندارد SOCKS5')}</CardTitle>
                  <CardDescription className="text-xs">
                    {tx(
                      'Standard TCP proxy for crawlers, desktop clients, cURL, or libraries with native SOCKS5 support.',
                      'پروکسی استاندارد سطح TCP برای خزنده‌ها، کلاینت‌ها و کتابخانه‌هایی که از SOCKS5 پشتیبانی می‌کنند.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-[11px] font-mono text-muted-foreground break-all" dir="ltr">
                  socks5h://uuid:secret@&lt;NODE_IP&gt;:1080
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Section 2: Interactive Live URL Builder (Client-side only) */}
          <section id="sandbox" className="scroll-mt-24 space-y-4">
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-primary" />
                  <span>{tx('Live Code Generator (Local Only — Never Sent to Server)', 'شخصی‌سازی زنده مثال‌های کد (فقط داخل مرورگر شما)')}</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  {tx(
                    'Paste your userSlug and forwarderSlug from Panel → Forwarders to instantly fill every snippet below.',
                    'اگر userSlug و forwarderSlug خود را از بخش «فورواردرها» در پنل وارد کنید، تمام مثال‌های کد این صفحه بلافاصله با لینک واقعی شما آماده کپی می‌شوند.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3" dir="ltr">
                  <label className="space-y-1 block">
                    <span className="text-[11px] font-mono text-muted-foreground">userSlug</span>
                    <input
                      value={userSlug}
                      onChange={(e) => setUserSlug(e.target.value)}
                      placeholder="YOUR_USER_SLUG"
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[11px] font-mono text-muted-foreground">forwarderSlug</span>
                    <input
                      value={fwdSlug}
                      onChange={(e) => setFwdSlug(e.target.value)}
                      placeholder="YOUR_FORWARDER_SLUG"
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[11px] font-mono text-muted-foreground">Upstream API Key (optional)</span>
                    <input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="YOUR_UPSTREAM_API_KEY"
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border/60 text-xs font-mono" dir="ltr">
                  <span className="truncate text-foreground">{fwdBase}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs gap-1 shrink-0"
                    onClick={() => copyText(fwdBase, 'Base URL')}
                  >
                    <Copy className="h-3 w-3" />
                    <span>{tx('Copy', 'کپی')}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section 3: AI Coding Tools & SSE Streaming */}
          <section id="ai-tools" className="scroll-mt-24 space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span>{tx('2. AI Gateways & Coding Tools (SSE Streaming)', '۲. اتصال ابزارهای هوش مصنوعی و کدنویسی (استریم SSE)')}</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {tx(
                  'All forwarder responses stream with zero buffering and a 300-second idle timeout — ideal for long reasoning models (DeepSeek, Claude, OpenAI, Kimi, Qwen, MiMo).',
                  'تمامی پاسخ‌های فورواردر بدون بافر و با تایم‌اوت ۵ دقیقه‌ای استریم می‌شوند — ایده‌آل برای مدل‌های Reasoning و جلسات طولانی کدنویسی.'
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['opencode', 'OpenCode / T3 Code'],
                  ['claude', 'Claude Code'],
                  ['openai-py', 'OpenAI Python'],
                  ['openai-js', 'OpenAI Node.js'],
                  ['curl-sse', 'cURL SSE'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAiTab(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    aiTab === key
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground bg-muted/40 border border-border/60 rounded-lg px-3.5 py-2.5 leading-relaxed">
              {aiSnippets[aiTab].note}
            </p>

            <CopyableCodeBlock
              code={aiSnippets[aiTab].code}
              filename={aiSnippets[aiTab].filename}
              language={aiSnippets[aiTab].lang}
              isRTL={isRTL}
            />
          </section>

          {/* Section 4: General REST APIs & Telegram Bots */}
          <section id="general-apis" className="scroll-mt-24 space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <span>{tx('3. Telegram Bots & General Backend APIs', '۳. ربات‌های تلگرام و پروژه‌های بک‌اند')}</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {tx(
                  'Path suffixes and query strings are automatically appended to your forwarder targetUrl when preservePath and preserveQuery are enabled.',
                  'در صورت فعال بودن preservePath و preserveQuery، هر مسیر و پارامتری که به انتهای لینک فورواردر اضافه کنید عیناً به سرور مقصد منتقل می‌شود.'
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['telegram', 'Telegram Bot API'],
                  ['python', 'Python (httpx)'],
                  ['node', 'Node.js (fetch)'],
                  ['go', 'Go (net/http)'],
                  ['php', 'PHP (cURL)'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setGeneralTab(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    generalTab === key
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <CopyableCodeBlock
              code={generalSnippets[generalTab].code}
              filename={generalSnippets[generalTab].filename}
              language={generalSnippets[generalTab].lang}
              isRTL={isRTL}
            />
          </section>

          {/* Section 5: SOCKS5 & HTTP Gateway */}
          <section id="socks5" className="scroll-mt-24 space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                <span>{tx('4. SOCKS5 Proxy & HTTP Fetch Gateway', '۴. پروکسی SOCKS5 و گیت‌وی HTTP')}</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {tx(
                  'Use credentials created under Panel → Credentials for direct SOCKS5 TCP connections or JSON-enveloped HTTP Gateway requests.',
                  'با نام‌کاربری (UUID) و رمز ساخته‌شده در بخش «اعتبارنامه‌ها» می‌توانید از SOCKS5 مستقیم یا گیت‌وی HTTP استفاده کنید.'
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['curl', 'SOCKS5 cURL'],
                  ['python', 'SOCKS5 Python'],
                  ['node', 'SOCKS5 Node.js'],
                  ['gateway', 'HTTP Gateway JSON'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSocksTab(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    socksTab === key
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <CopyableCodeBlock
              code={socksSnippets[socksTab].code}
              filename={socksSnippets[socksTab].filename}
              language={socksSnippets[socksTab].lang}
              isRTL={isRTL}
            />
          </section>

          {/* Section 6: Routing Modes, Headers, Privacy & Error Codes */}
          <section id="routing-privacy" className="scroll-mt-24 space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                <span>{tx('5. Routing Modes, Diagnostic Headers & Privacy', '۵. حالت‌های مسیریابی، هدرهای پاسخ و حریم خصوصی')}</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">{tx('Forwarder Routing Modes', 'حالت‌های مسیریابی فورواردر')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  <div>
                    <code className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">auto</code>{' '}
                    <span className="text-muted-foreground">
                      {tx(
                        'Round-Robin load balancing across all healthy top-priority WireGuard tunnels + instant pre-header failover.',
                        'توزیع بار چرخشی (Round-Robin) بین همه تانل‌های سالم وایرگارد با اولویت یکسان + Failover خودکار در صورت خطا.'
                      )}
                    </span>
                  </div>
                  <div>
                    <code className="px-1.5 py-0.5 rounded bg-muted font-mono">country</code>{' '}
                    <span className="text-muted-foreground">
                      {tx(
                        'Ordered country list (e.g. NL → DE). Fail-closed: never leaks local IP if selected countries are down.',
                        'لیست اولویت‌بندی‌شده کشورها (مثلاً NL سپس DE). در صورت قطعی، هرگز از آی‌پی مبدا ارسال نمی‌شود.'
                      )}
                    </span>
                  </div>
                  <div>
                    <code className="px-1.5 py-0.5 rounded bg-muted font-mono">tunnel</code>{' '}
                    <span className="text-muted-foreground">
                      {tx(
                        'Pinned to one specific upstreamTunnelId (sticky exit IP, fail-closed).',
                        'قفل‌شده روی یک تانل مشخص (آی‌پی خروجی ثابت؛ مناسب سرویس‌های حساس به تغییر آی‌پی).'
                      )}
                    </span>
                  </div>
                  <div>
                    <code className="px-1.5 py-0.5 rounded bg-muted font-mono">direct</code>{' '}
                    <span className="text-muted-foreground">
                      {tx(
                        'Direct edge server egress without an upstream WireGuard tunnel.',
                        'ارسال مستقیم از سرور لبه بدون عبور از تانل وایرگارد.'
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold">{tx('Response Headers & Privacy Guarantee', 'هدرهای دیباگ و تضمین عدم نشت آی‌پی')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    {tx(
                      'Outbound requests automatically strip X-Forwarded-For, X-Real-IP, Forwarded, CF-Connecting-IP, and True-Client-IP so upstream APIs only observe the exit tunnel IP.',
                      'درخواست‌های خروجی به‌طور خودکار هدرهای X-Forwarded-For، X-Real-IP، Forwarded و CF-Connecting-IP را حذف می‌کنند تا سرور مقصد فقط آی‌پی پاک تانل خروجی را ببیند.'
                    )}
                  </p>
                  <div className="space-y-1 pt-1 font-mono text-[11px]" dir="ltr">
                    <div><span className="text-foreground">x-proxynet-via-tunnel:</span> 1</div>
                    <div><span className="text-foreground">x-proxynet-via-protocol:</span> wireguard</div>
                    <div><span className="text-foreground">x-proxynet-via-country:</span> NL</div>
                    <div><span className="text-foreground">x-accel-buffering:</span> no</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Status Codes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>{tx('Common HTTP Status Codes', 'کدهای وضعیت مهم')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <span className="font-mono font-bold text-rose-500">404</span>
                  <p className="text-muted-foreground mt-0.5">
                    {tx('Forwarder slug not found, disabled, or account suspended.', 'اسلاگ فورواردر اشتباه یا غیرفعال است.')}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <span className="font-mono font-bold text-amber-500">413</span>
                  <p className="text-muted-foreground mt-0.5">
                    {tx('Request body exceeds 10 MB limit.', 'حجم بدنه درخواست بیشتر از ۱۰ مگابایت است.')}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <span className="font-mono font-bold text-amber-500">502</span>
                  <p className="text-muted-foreground mt-0.5">
                    {tx('Upstream target or all candidate tunnels failed pre-header.', 'خطا در برقراری ارتباط با تانل‌ها یا مقصد.')}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <span className="font-mono font-bold text-amber-500">503</span>
                  <p className="text-muted-foreground mt-0.5">
                    {tx('Pinned tunnel or selected country is currently unavailable.', 'تانل یا کشور انتخاب‌شده موقتاً در دسترس نیست.')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Section 7: Live Public OpenAPI Explorer */}
          <section id="openapi" className="scroll-mt-24 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
                  <FileJson className="h-5 w-5 text-primary" />
                  <span>{tx('6. Public OpenAPI 3.0 Reference', '۶. مرجع زنده OpenAPI 3.0')}</span>
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {tx(
                    'Loaded live from /api/openapi.json (curated public developer endpoints only — internal admin routes are strictly excluded).',
                    'به‌صورت زنده از /api/openapi.json بارگذاری می‌شود (فقط اندپوینت‌های عمومی برنامه‌نویسان — مسیرهای ادمین کاملاً مخفی هستند).'
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href="/api/openapi.json" target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="text-xs font-mono gap-1.5">
                    <FileJson className="h-3.5 w-3.5" />
                    <span>JSON</span>
                  </Button>
                </a>
                <a href="/api/docs" target="_blank" rel="noreferrer">
                  <Button size="sm" className="text-xs gap-1.5">
                    <span>{tx('Open Swagger UI', 'باز کردن Swagger UI')}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
            </div>

            {openApiError ? (
              <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                {tx(
                  `Could not load live /api/openapi.json (${openApiError}). You can still open /api/docs directly.`,
                  `بارگذاری زنده /api/openapi.json با خطا مواجه شد (${openApiError}). همچنان می‌توانید مستقیم /api/docs را باز کنید.`
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {openApiEndpoints.map((ep, idx) => (
                  <div
                    key={`${ep.method}-${ep.path}-${idx}`}
                    className="rounded-xl border border-border/80 bg-card p-3.5 space-y-1.5 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2" dir="ltr">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase font-mono shrink-0 ${
                            METHOD_COLORS[ep.method] || 'bg-muted text-foreground border-border'
                          }`}
                        >
                          {ep.method}
                        </span>
                        <code className="text-xs font-mono font-semibold text-foreground break-all">
                          {ep.path}
                        </code>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px]">
                          {ep.tag}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {ep.auth}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-foreground/90 font-medium">{ep.summary}</p>
                    {ep.description && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{ep.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/60 py-6 bg-background text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{t(lang, 'brand')}</span>
            <span>·</span>
            <span>{tx('Public Developer Docs', 'مستندات عمومی برنامه‌نویسان')}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-foreground transition-colors">
              {tx('Home', 'صفحه اصلی')}
            </Link>
            <a href="/api/openapi.json" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors font-mono">
              OpenAPI JSON
            </a>
            <a href="/llms.txt" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors font-mono">
              llms.txt
            </a>
            <Link href="/login" className="hover:text-foreground transition-colors">
              {t(lang, 'footer.signin')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
