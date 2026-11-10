'use client';

import React, { useState } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Zap,
  Play,
  RotateCw,
  Lock,
  Server,
  Sparkles,
  Globe2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ArrowRightLeft,
  FileCode,
  Sliders,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Socks5Endpoint } from '../../../lib/api';

interface GatewayCardProps {
  apiBase: string;
  activeCred?: { uuid: string; label?: string; enabled: boolean };
  socksEndpoints: Socks5Endpoint[];
  socksRequiresPlan: boolean;
  lang: string;
}

type TabType = 'curl' | 'php' | 'python' | 'node' | 'playground';

export function GatewayCard({
  apiBase,
  activeCred,
  socksEndpoints,
  socksRequiresPlan,
  lang,
}: GatewayCardProps) {
  const isRTL = lang === 'fa';
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [activeTab, setActiveTab] = useState<TabType>('curl');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSchemaGuide, setShowSchemaGuide] = useState(false);

  // Playground state
  const [targetUrl, setTargetUrl] = useState('https://api.ipify.org?format=json');
  const [testMethod, setTestMethod] = useState<'GET' | 'POST'>('GET');
  const [testInsecure, setTestInsecure] = useState(false);
  const [testFollowRedirects, setTestFollowRedirects] = useState(true);
  const [testCustomHeader, setTestCustomHeader] = useState('');
  const [testBody, setTestBody] = useState('');
  const [showAdvancedPlayground, setShowAdvancedPlayground] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: number;
    latencyMs: number;
    data: string;
    success: boolean;
  } | null>(null);

  const endpointUrl = `${apiBase}/gateway/fetch`;
  const uuidPlaceholder = activeCred ? activeCred.uuid : 'YOUR_CREDENTIAL_UUID';
  const authHeader = activeCred
    ? `Basic ${btoa(`${activeCred.uuid}:YOUR_SECRET`)}`
    : 'Basic base64(uuid:secret)';

  // Code snippets by language
  const snippets: Record<Exclude<TabType, 'playground'>, { langTag: string; code: string; title: string; filename: string }> = {
    curl: {
      langTag: 'bash',
      title: 'cURL',
      filename: 'terminal — bash',
      code: `# ۱. فراخوانی استاندارد GET
curl -X POST "${endpointUrl}" \\
  -H "Authorization: ${authHeader}" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://api.ipify.org?format=json"}'

# ۲. فراخوانی پیشرفته: هدر اختصاصی مقصد + SSL خودامضا + تایم‌اوت
# curl -X POST "${endpointUrl}" \\
#   -H "Authorization: ${authHeader}" \\
#   -H "Content-Type: application/json" \\
#   -d '{
#     "url": "https://api.example.com/v1/action",
#     "method": "POST",
#     "headers": {
#       "Authorization": "Bearer YOUR_UPSTREAM_TOKEN",
#       "Content-Type": "application/json"
#     },
#     "body": "{\\"action\\":\\"sync\\"}",
#     "followRedirects": true,
#     "insecure": true,
#     "timeoutMs": 30000
#   }'`,
    },
    php: {
      langTag: 'php',
      title: 'PHP',
      filename: 'request-gateway.php',
      code: `<?php
// ProxyNet HTTP Gateway Integration (PHP cURL)
$payload = [
  'url' => 'https://api.ipify.org?format=json',
  // 'method' => 'GET',
  // 'headers' => ['Authorization' => 'Bearer YOUR_UPSTREAM_TOKEN'],
  // 'followRedirects' => true,
  // 'insecure' => false, // برای گواهی‌های خودامضا روی true بگذارید
  // 'timeoutMs' => 30000,
];

$ch = curl_init('${endpointUrl}');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: ${authHeader}',
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => json_encode($payload),
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 35,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "Response Code: " . $httpCode . "\\n";
echo "Response Body: " . $response;`,
    },
    python: {
      langTag: 'python',
      title: 'Python',
      filename: 'proxynet_client.py',
      code: `import requests
from requests.auth import HTTPBasicAuth

# ارسال درخواست از طریق گیت‌وی خروج پروکسی‌نت
payload = {
    "url": "https://api.ipify.org?format=json",
    # "method": "GET",
    # "headers": {"Authorization": "Bearer YOUR_UPSTREAM_TOKEN"},
    # "followRedirects": True,
    # "insecure": False,  # True برای نادیده گرفتن خطای SSL خودامضا
    # "timeoutMs": 30000,
}

response = requests.post(
    "${endpointUrl}",
    auth=HTTPBasicAuth("${uuidPlaceholder}", "YOUR_SECRET"),
    json=payload,
    timeout=35,
)
print("Exit Node Response:", response.json())`,
    },
    node: {
      langTag: 'javascript',
      title: 'Node.js',
      filename: 'gateway_fetch.mjs',
      code: `import fetch from 'node-fetch';

const res = await fetch('${endpointUrl}', {
  method: 'POST',
  headers: {
    'Authorization': '${authHeader}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://api.ipify.org?format=json',
    // method: 'GET',
    // headers: { 'Authorization': 'Bearer YOUR_UPSTREAM_TOKEN' },
    // followRedirects: true,
    // insecure: false,
    // timeoutMs: 30000,
  }),
});
const data = await res.json();
console.log('Exit Node IP:', data);`,
    },
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success(tx('Code snippet copied to clipboard', 'کد با موفقیت کپی شد'));
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Run live gateway test
  const runLiveTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    const start = performance.now();

    // Prepare payload
    const payload: Record<string, unknown> = {
      url: targetUrl.trim(),
      method: testMethod,
      followRedirects: testFollowRedirects,
      insecure: testInsecure,
    };

    if (testCustomHeader.trim()) {
      const parts = testCustomHeader.split(':');
      if (parts.length >= 2) {
        const headerKey = parts[0].trim();
        const headerVal = parts.slice(1).join(':').trim();
        payload.headers = { [headerKey]: headerVal };
      }
    }

    if (testMethod === 'POST' && testBody.trim()) {
      payload.body = testBody.trim();
    }

    try {
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeCred
            ? { Authorization: `Basic ${btoa(`${activeCred.uuid}:test-probe`)}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      const latencyMs = Math.round(performance.now() - start);
      let text = await res.text();
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // use raw text
      }

      setTestResult({
        status: res.status,
        latencyMs,
        data: text,
        success: res.ok,
      });

      if (res.ok) {
        toast.success(tx(`Request successful in ${latencyMs}ms`, `پاسخ موفق در ${latencyMs} میلی‌ثانیه`));
      } else if (res.status === 401) {
        toast.info(tx('Gateway reachable (requires valid credentials)', 'درگاه فعال است (نیازمند اعتبارنامه معتبر)'));
      }
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setTestResult({
        status: 0,
        latencyMs,
        data: JSON.stringify({ error: msg, hint: 'Ensure ProxyNet Control Plane is running on port 3000' }, null, 2),
        success: false,
      });
      toast.error(tx('Gateway connection error', 'خطا در ارتباط با درگاه'));
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Card className="flex flex-col justify-between border-border/80 shadow-sm overflow-hidden h-full">
      <div>
        {/* Responsive Header: Prevents wrapping and badge collisions */}
        <CardHeader className="p-3.5 sm:p-4 border-b border-border/40 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
                <Terminal className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm sm:text-base font-bold whitespace-nowrap">
                    {tx('HTTP Fetch Gateway', 'درگاه اتصال سریع HTTP')}
                  </CardTitle>
                  <span className="hidden xs:inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    v1
                  </span>
                </div>
                <CardDescription className="text-xs text-muted-foreground truncate mt-0.5">
                  {tx(
                    'Direct outbound requests through verified relay nodes',
                    'ارسال مستقیم درخواست‌ها از نودهای خروج پروکسی‌نت'
                  )}
                </CardDescription>
              </div>
            </div>

            {/* REST API Badge */}
            <div className="shrink-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                <Zap className="h-3 w-3 text-primary" />
                <span>{tx('REST API', 'درگاه REST')}</span>
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3.5 sm:p-4 space-y-3.5">
          {/* Endpoint Bar with Integrated Copy Button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                {tx('API Endpoint', 'آدرس درگاه')}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(endpointUrl, 'endpoint')}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline transition-colors"
              >
                {copiedKey === 'endpoint' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span className="text-emerald-600 font-medium">{tx('Copied', 'کپی شد')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>{tx('Copy URL', 'کپی آدرس')}</span>
                  </>
                )}
              </button>
            </div>

            <div
              className="flex items-center gap-2 p-1.5 px-2.5 rounded-lg bg-muted/50 border border-border/80 font-mono text-xs hover:border-primary/40 transition-colors"
              dir="ltr"
            >
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold text-[11px] border border-emerald-500/25 shrink-0">
                POST
              </span>
              <span className="text-foreground/90 font-medium select-all truncate flex-1 text-xs">
                {endpointUrl}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(endpointUrl, 'endpoint')}
                title={tx('Copy URL', 'کپی آدرس')}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors"
              >
                {copiedKey === 'endpoint' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Feature Highlights Pills: Auth Pass-Through, Binary Base64, Follow Redirects, Insecure SSL */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
            <div className="flex items-center gap-1.5 p-1.5 px-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" />
              <span className="truncate">{tx('Auth Pass-Through', 'حفظ توکن مقصد')}</span>
            </div>
            <div className="flex items-center gap-1.5 p-1.5 px-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-700 dark:text-blue-300">
              <FileCode className="h-3 w-3 shrink-0 text-blue-600" />
              <span className="truncate">{tx('Binary Base64', 'پشتیبانی باینری')}</span>
            </div>
            <div className="flex items-center gap-1.5 p-1.5 px-2 rounded-md bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-700 dark:text-purple-300">
              <ArrowRightLeft className="h-3 w-3 shrink-0 text-purple-600" />
              <span className="truncate">{tx('Follow Redirects', 'تعقیب ۳۰۲')}</span>
            </div>
            <div className="flex items-center gap-1.5 p-1.5 px-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
              <Lock className="h-3 w-3 shrink-0 text-amber-600" />
              <span className="truncate">{tx('Self-Signed SSL', 'سازگار با SSL خودامضا')}</span>
            </div>
          </div>

          {/* Language Tabs Row */}
          <div className="space-y-2">
            <div className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 text-xs min-w-max">
                {(['curl', 'php', 'python', 'node'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
                      activeTab === tab
                        ? 'bg-background text-foreground shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {snippets[tab].title}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setActiveTab('playground')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 shrink-0 ${
                    activeTab === 'playground'
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-primary hover:bg-primary/10'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  <span>{tx('Live Test', 'تست زنده')}</span>
                </button>
              </div>
            </div>

            {/* Code Terminal View with PROMINENT Copy Button in the header bar */}
            {activeTab !== 'playground' ? (
              <div className="space-y-2">
                <div
                  className="rounded-xl border border-zinc-800 bg-[#0d1117] text-zinc-100 overflow-hidden shadow-md text-left"
                  dir="ltr"
                >
                  {/* Terminal Mac-style Bar with ALWAYS-VISIBLE COPY BUTTON */}
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/95 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80 inline-block" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block" />
                      </div>
                      <span className="text-zinc-300 font-sans font-medium text-xs truncate">
                        {snippets[activeTab].filename}
                      </span>
                    </div>

                    {/* High-visibility Copy Button right inside terminal header */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(snippets[activeTab].code, activeTab)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all active:scale-95 ${
                          copiedKey === activeTab
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 hover:text-white'
                        }`}
                      >
                        {copiedKey === activeTab ? (
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
                  </div>

                  {/* Preformatted Code Content */}
                  <pre className="p-3 text-[11px] font-mono leading-relaxed overflow-x-auto text-zinc-200 selection:bg-primary/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <code>{snippets[activeTab].code}</code>
                  </pre>
                </div>

                {/* Collapsible Schema Guide */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowSchemaGuide(!showSchemaGuide)}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-muted/40 hover:bg-muted/70 border border-border/60 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Info className="h-3.5 w-3.5 text-primary" />
                      <span>{tx('View Request Schema & Parameters', 'مشاهده راهنمای پارامترهای درخواست (JSON Schema)')}</span>
                    </div>
                    {showSchemaGuide ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>

                  {showSchemaGuide && (
                    <div className="mt-2 p-3 rounded-lg border border-border bg-background/95 space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2 rounded bg-muted/40 border border-border/50">
                          <span className="font-mono font-bold text-primary">url</span>{' '}
                          <span className="text-[10px] text-rose-500 font-semibold">{tx('(required)', '(الزامی)')}</span>
                          <p className="text-muted-foreground mt-0.5">{tx('Target HTTP/HTTPS URL to fetch.', 'آدرس کامل مقصد اینترنتی (HTTP یا HTTPS).')}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/40 border border-border/50">
                          <span className="font-mono font-bold text-primary">method</span>{' '}
                          <span className="text-[10px] text-muted-foreground font-mono">GET, POST, ...</span>
                          <p className="text-muted-foreground mt-0.5">{tx('HTTP method (default: GET).', 'متد درخواست به مقصد (پیش‌فرض: GET).')}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/40 border border-border/50">
                          <span className="font-mono font-bold text-primary">headers</span>{' '}
                          <span className="text-[10px] text-muted-foreground font-mono">object</span>
                          <p className="text-muted-foreground mt-0.5">{tx('Upstream headers. "Authorization" is forwarded intact.', 'هدرهای سفارشی مقصد؛ هدر Authorization به طور کامل منتقل می‌شود.')}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/40 border border-border/50">
                          <span className="font-mono font-bold text-primary">body & isBase64</span>{' '}
                          <span className="text-[10px] text-muted-foreground font-mono">string | boolean</span>
                          <p className="text-muted-foreground mt-0.5">{tx('Payload for POST/PUT. Set isBase64: true for binary files.', 'بدنه ارسالی متنی یا باینری (با Base64 جهت فایل‌ها و کانفیگ‌ها).')}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/40 border border-border/50">
                          <span className="font-mono font-bold text-primary">followRedirects</span>{' '}
                          <span className="text-[10px] text-emerald-600 font-mono">{tx('true (default)', 'true (پیش‌فرض)')}</span>
                          <p className="text-muted-foreground mt-0.5">{tx('Follow 301/302 redirects automatically up to 5 hops.', 'تعقیب خودکار ریدایرکت‌های ۳۰۱، ۳۰۲، ۳۰۷ و ۳۰۸ تا ۵ مرحله.')}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/40 border border-border/50">
                          <span className="font-mono font-bold text-primary">insecure</span>{' '}
                          <span className="text-[10px] text-amber-600 font-mono">boolean</span>
                          <p className="text-muted-foreground mt-0.5">{tx('Set true to bypass Self-Signed SSL cert errors.', 'تنظیم روی true برای نادیده گرفتن خطای SSL سرورهای دارای گواهی خودامضا.')}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/40 border border-border/50 sm:col-span-2">
                          <span className="font-mono font-bold text-primary">timeoutMs</span>{' '}
                          <span className="text-[10px] text-muted-foreground font-mono">1000 - 60000ms</span>
                          <p className="text-muted-foreground mt-0.5">{tx('Custom response timeout (useful for Telegram bot long-polling).', 'حداکثر مهلت زمانی پاسخ برحسب میلی‌ثانیه (مناسب Long-Polling ربات‌های تلگرام و وب‌هوک‌ها).')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Live Test Playground View */
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-muted-foreground">
                      {tx('Target URL to Fetch through Proxy', 'آدرس مقصد برای فراخوانی')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedPlayground(!showAdvancedPlayground)}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <Sliders className="h-3 w-3" />
                      <span>{showAdvancedPlayground ? tx('Hide Options', 'بستن تنظیمات') : tx('Advanced Options', 'تنظیمات پیشرفته')}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={testMethod}
                      onChange={(e) => setTestMethod(e.target.value as 'GET' | 'POST')}
                      className="h-8 px-2 rounded-md border border-input bg-background text-xs font-mono font-semibold"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>

                    <Input
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      placeholder="https://api.ipify.org?format=json"
                      className="font-mono text-xs h-8 bg-background flex-1"
                      dir="ltr"
                    />

                    <Button
                      onClick={runLiveTest}
                      disabled={testLoading || !targetUrl.trim()}
                      size="sm"
                      className="h-8 gap-1.5 shrink-0"
                    >
                      {testLoading ? (
                        <>
                          <RotateCw className="h-3.5 w-3.5 animate-spin" />
                          <span>{tx('Testing...', 'ارسال...')}</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 fill-current" />
                          <span>{tx('Send Request', 'ارسال تست')}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Advanced Playground Options */}
                {showAdvancedPlayground && (
                  <div className="p-2.5 rounded-lg border border-border/80 bg-background/80 space-y-2.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 p-1.5 rounded bg-muted/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={testFollowRedirects}
                          onChange={(e) => setTestFollowRedirects(e.target.checked)}
                          className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span className="text-[11px]">{tx('Follow 301/302 Redirects', 'تعقیب خودکار ریدایرکت‌های ۳۰۱/۳۰۲')}</span>
                      </label>

                      <label className="flex items-center gap-2 p-1.5 rounded bg-muted/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={testInsecure}
                          onChange={(e) => setTestInsecure(e.target.checked)}
                          className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          {tx('Insecure SSL (Bypass Cert Errors)', 'نادیده گرفتن خطای گواهی SSL (Insecure)')}
                        </span>
                      </label>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">
                        {tx('Custom Header (e.g. Authorization: Bearer <TOKEN>)', 'هدر اختصاصی مقصد (مانند Authorization: Bearer <TOKEN>)')}
                      </label>
                      <Input
                        value={testCustomHeader}
                        onChange={(e) => setTestCustomHeader(e.target.value)}
                        placeholder="Authorization: Bearer test-token"
                        className="font-mono text-xs h-7 bg-background"
                        dir="ltr"
                      />
                    </div>

                    {testMethod === 'POST' && (
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">
                          {tx('Request Body (JSON or text)', 'بدنه درخواست (JSON یا متن)')}
                        </label>
                        <textarea
                          value={testBody}
                          onChange={(e) => setTestBody(e.target.value)}
                          placeholder='{"key": "value"}'
                          rows={2}
                          className="w-full font-mono text-xs p-1.5 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                          dir="ltr"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Live Test Result Output */}
                {testResult && (
                  <div className="space-y-1.5 pt-1 text-left" dir="ltr">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            testResult.status === 200
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                              : testResult.status === 401
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25'
                              : 'bg-destructive/15 text-destructive border border-destructive/25'
                          }`}
                        >
                          {testResult.status > 0 ? `${testResult.status} ${testResult.success ? 'OK' : 'Error'}` : 'Net Error'}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {testResult.latencyMs}ms
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">Gateway Probe</span>
                    </div>

                    <pre className="p-2.5 rounded-lg bg-zinc-950 text-zinc-200 text-[11px] font-mono max-h-36 overflow-y-auto border border-zinc-800">
                      <code>{testResult.data}</code>
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </div>

      {/* Responsive Specifications Footer: Eliminates truncation completely */}
      <CardFooter className="p-3 sm:p-3.5 border-t border-border/50 bg-muted/10">
        <div className="w-full space-y-2 text-xs">
          {/* Row 1: Universal Protocol Compatibility Spec */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
              <Globe2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{tx('Compatibility', 'سازگاری کلاینت')}</span>
            </div>
            <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
              <span>{tx('Universal HTTP & SOCKS5 Support', 'سازگار با کلیه کلاینت‌ها و وب‌سرویس‌ها')}</span>
              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            </div>
          </div>

          {/* Row 2: Auth Protocol & SOCKS5 Relays in 2 clean columns */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border/50">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                <Lock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>{tx('Auth', 'احراز هویت')}</span>
              </div>
              <span className="font-mono font-semibold text-xs text-foreground">
                Basic Auth
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border/50">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                <Server className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>{tx('SOCKS5', 'رله‌ها')}</span>
              </div>
              <div className="flex items-center gap-1 font-semibold text-xs text-foreground">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    socksEndpoints.length > 0 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>
                  {socksRequiresPlan
                    ? tx('Plan Req.', 'اشتراک')
                    : socksEndpoints.length > 0
                    ? `${socksEndpoints.length} ${tx('Nodes', 'نود')}`
                    : tx('Standby', 'آماده‌باش')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
