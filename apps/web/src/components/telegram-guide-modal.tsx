'use client';

import React, { useState } from 'react';
import {
  Send,
  Server,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface TelegramGuideModalProps {
  open: boolean;
  onClose: () => void;
  nodeIp?: string;
  nodePort?: number;
  credentialUuid?: string;
  lang?: string;
}

export function TelegramGuideModal({
  open,
  onClose,
  nodeIp = '91.223.61.106',
  nodePort = 1080,
  credentialUuid,
  lang = 'fa',
}: TelegramGuideModalProps) {
  const isFa = lang === 'fa';
  const isRTL = isFa;
  const tx = (en: string, fa: string) => (isFa ? fa : en);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const finalUuid = credentialUuid || 'YOUR_CREDENTIAL_UUID';
  const tgLink = `tg://socks?server=${nodeIp}&port=${nodePort}&user=${finalUuid}&pass=YOUR_SECRET`;

  const copyToClipboard = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(isFa ? `${label} کپی شد` : `${label} copied`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const curlSocksCmd = `curl -x socks5h://${finalUuid}:YOUR_SECRET@${nodeIp}:${nodePort} "https://api.telegram.org"`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold">
                {tx('Connection Guide: Telegram', 'راهنمای اتصال: تلگرام')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {tx(
                  'Set up the SOCKS5 proxy in Telegram and route external services via upstream or webhook.',
                  'تنظیم پروکسی SOCKS5 در تلگرام و هدایت ترافیک سرویس‌های خارجی از طریق Upstream یا Webhook.'
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="telegram" className="w-full mt-3">
          <TabsList className="grid w-full grid-cols-2 h-10">
            <TabsTrigger value="telegram" className="text-xs font-semibold gap-1.5">
              <Send className="h-3.5 w-3.5 text-sky-500" />
              <span>{tx('Telegram Proxy (SOCKS5)', 'اتصال تلگرام (SOCKS5)')}</span>
            </TabsTrigger>
            <TabsTrigger value="upstream" className="text-xs font-semibold gap-1.5">
              <Layers className="h-3.5 w-3.5 text-amber-500" />
              <span>{tx('Upstream & Webhook', 'اتصال سرویس‌های خارجی')}</span>
            </TabsTrigger>
          </TabsList>

          {/* TELEGRAM TAB */}
          <TabsContent value="telegram" className="space-y-4 pt-3">
            {/* Quick 1-Click Action */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-sky-500/10 via-primary/10 to-transparent border border-sky-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <span className="font-bold text-sm text-foreground">
                    {tx('1-Click Telegram Proxy Link', 'اتصال سریع با ۱ کلیک به تلگرام')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tx(
                    'Click to automatically open Telegram and add this SOCKS5 proxy to your app.',
                    'با کلیک روی این دکمه، تلگرام به طور خودکار باز شده و این پروکسی ذخیره می‌شود.'
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={tgLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-sm transition-all"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{tx('Open in Telegram', 'باز کردن در تلگرام')}</span>
                  <ExternalLink className="h-3 w-3 opacity-80" />
                </a>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(tgLink, 'tg-link', tx('Telegram Link', 'لینک تلگرام'))}
                  className="h-9 px-2.5"
                  title={tx('Copy Share Link', 'کپی لینک اشتراک‌گذاری')}
                >
                  {copiedKey === 'tg-link' ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Manual Config Parameters */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-primary" />
                <span>{tx('Manual Configuration Parameters (SOCKS5):', 'مشخصات لازم جهت تنظیم دستی در تلگرام:')}</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Server */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/30 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-muted-foreground">{tx('Server Host (IP)', 'آدرس سرور (Server)')}</span>
                    <div className="font-mono font-semibold text-foreground" dir="ltr">{nodeIp}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(nodeIp, 'node-ip', tx('Server IP', 'آدرس سرور'))}
                  >
                    {copiedKey === 'node-ip' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {/* Port */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/30 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-muted-foreground">{tx('Port', 'پورت (Port)')}</span>
                    <div className="font-mono font-semibold text-foreground" dir="ltr">{nodePort}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(String(nodePort), 'node-port', tx('Port', 'پورت'))}
                  >
                    {copiedKey === 'node-port' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {/* Username */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/30 flex items-center justify-between">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <span className="text-[11px] text-muted-foreground">{tx('Username (UUID)', 'نام کاربری (UUID)')}</span>
                    <div className="font-mono font-semibold text-foreground truncate max-w-[170px]" dir="ltr">
                      {finalUuid}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => copyToClipboard(finalUuid, 'uuid', 'UUID')}
                  >
                    {copiedKey === 'uuid' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {/* Password */}
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/30 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-muted-foreground">{tx('Password', 'رمز عبور (Secret)')}</span>
                    <div className="font-mono text-muted-foreground text-[11px]">
                      {tx('Your Credential Secret', 'کلید Secret دریافت شده')}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {tx('From Credentials', 'صفحه اعتبارنامه‌ها')}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Visual Step-by-Step */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-2 text-xs">
              <span className="font-bold text-foreground block">
                {tx('Step-by-step instructions in Telegram app:', 'مراحل قدم به قدم در برنامه تلگرام:')}
              </span>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground leading-relaxed pr-1">
                <li>
                  {tx(
                    'Open Telegram Settings -> Data and Storage -> Proxy Settings.',
                    'وارد تنظیمات تلگرام (Settings) شده و به بخش Data and Storage -> Proxy Settings بروید.'
                  )}
                </li>
                <li>
                  {tx(
                    'Tap "Add Proxy" and choose SOCKS5.',
                    'روی گزینه "Add Proxy" (افزودن پروکسی) زده و نوع پروکسی را SOCKS5 انتخاب کنید.'
                  )}
                </li>
                <li>
                  {tx(
                    'Enter Server IP, Port (1080), Username (UUID), and Password (Secret), then save.',
                    'آدرس سرور، پورت (۱۰۸۰)، نام کاربری (UUID) و رمز عبور (Secret) بالا را وارد و تأیید کنید.'
                  )}
                </li>
              </ol>
            </div>
          </TabsContent>

          {/* UPSTREAM TAB */}
          <TabsContent value="upstream" className="space-y-4 pt-3">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              <span className="font-bold block mb-1">
                {tx('Routing external services through ProxyNet:', 'نحوه هدایت ترافیک سرویس‌های خارجی از طریق پروکسی‌نت:')}
              </span>
              <p>
                {tx(
                  'To route traffic from your upstream service through this proxy, use one of the two methods below: Upstream SOCKS5 Proxy or HTTP Gateway/Webhook.',
                  'جهت هدایت ترافیک سرویس خارجی خود از طریق این پروکسی، از یکی از دو روش زیر استفاده کنید:'
                )}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-3 text-xs">
              {/* Option 1 */}
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-xs">
                    ۱
                  </span>
                  <span className="font-bold text-foreground">
                    {tx('Method 1: Upstream SOCKS5 Proxy', 'روش اول: استفاده به عنوان Upstream SOCKS5')}
                  </span>
                </div>
                <p className="text-muted-foreground leading-relaxed pr-7">
                  {tx(
                    'In your service or panel outbound configuration, define a SOCKS5 outbound pointing to:',
                    'در تنظیمات Outbound یا Upstream سرویس خود، یک خروجی از نوع SOCKS5 با مشخصات زیر تعریف کنید:'
                  )}
                </p>
                <div className="pr-7 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                  <div className="p-2 rounded bg-muted/50 border">
                    <span className="text-[10px] text-muted-foreground block font-sans">Protocol</span>
                    <span>SOCKS5</span>
                  </div>
                  <div className="p-2 rounded bg-muted/50 border">
                    <span className="text-[10px] text-muted-foreground block font-sans">Host</span>
                    <span>{nodeIp}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/50 border">
                    <span className="text-[10px] text-muted-foreground block font-sans">Port</span>
                    <span>{nodePort}</span>
                  </div>
                  <div className="p-2 rounded bg-muted/50 border">
                    <span className="text-[10px] text-muted-foreground block font-sans">Auth</span>
                    <span>UUID : Secret</span>
                  </div>
                </div>
              </div>

              {/* Option 2 */}
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-xs">
                    ۲
                  </span>
                  <span className="font-bold text-foreground">
                    {tx('Method 2: Dedicated Forwarder Webhook', 'روش دوم: استفاده از درگاه فورواردر اختصاصی (Webhook)')}
                  </span>
                </div>
                <p className="text-muted-foreground leading-relaxed pr-7">
                  {tx(
                    'Create a forwarder in "Forwarders" page pointing to your target service or Telegram Bot API. Your service sends requests directly to your public URL without needing credentials.',
                    'در صفحه "فورواردر آدرس‌ها" یک مسیر جدید بسازید و آدرس مقصد را ثبت کنید. سرویس شما درخواست‌ها را به آدرس اختصاصی شما می‌فرستد و سیستم بدون نیاز به اعتبارسنجی پیچیده آن را رله می‌کند.'
                  )}
                </p>
              </div>
            </div>

            {/* Test cURL Command */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-primary" />
                <span>{tx('Test Command via cURL:', 'دستور تست ارتباط با cURL:')}</span>
              </span>

              <div
                className="rounded-xl border border-zinc-800 bg-[#0d1117] text-zinc-100 overflow-hidden shadow-md text-left"
                dir="ltr"
              >
                <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/95 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500/80 inline-block" />
                    <span className="h-2 w-2 rounded-full bg-amber-500/80 inline-block" />
                    <span className="h-2 w-2 rounded-full bg-emerald-500/80 inline-block" />
                    <span className="text-zinc-300 font-sans text-xs">terminal — bash</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(curlSocksCmd, 'curl-socks', 'cURL SOCKS5')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all active:scale-95 ${
                      copiedKey === 'curl-socks'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 hover:text-white'
                    }`}
                  >
                    {copiedKey === 'curl-socks' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{isFa ? 'کپی شد!' : 'Copied!'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>{isFa ? 'کپی دستور' : 'Copy'}</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all text-zinc-200">
                  {curlSocksCmd}
                </pre>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
