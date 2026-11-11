'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  RotateCw,
  Wallet,
  KeyRound,
  Network,
  Activity,
  ArrowDownUp,
  AlertTriangle,
  XCircle,
  CreditCard,
} from 'lucide-react';
import { api, HealthMeResponse } from './api';
import { t, Lang } from './i18n';
import { toPersianDigits } from './jalali';

function fmtBytes(n: string | number, lang: Lang): string {
  const b = typeof n === 'string' ? Number(n) : n;
  const isFa = lang === 'fa';
  if (!b || b < 1024) {
    const val = isFa ? toPersianDigits(b || 0) : String(b || 0);
    return isFa ? `${val} بایت` : `${val} B`;
  }
  if (b < 1024 * 1024) {
    const kb = (b / 1024).toFixed(1);
    const val = isFa ? toPersianDigits(kb) : kb;
    return isFa ? `${val} کیلوبایت` : `${val} KB`;
  }
  if (b < 1024 * 1024 * 1024) {
    const mb = (b / 1024 / 1024).toFixed(2);
    const val = isFa ? toPersianDigits(mb) : mb;
    return isFa ? `${val} مگابایت` : `${val} MB`;
  }
  const gb = (b / 1024 / 1024 / 1024).toFixed(2);
  const val = isFa ? toPersianDigits(gb) : gb;
  return isFa ? `${val} گیگابایت` : `${val} GB`;
}

/**
 * Modern, responsive system & account status bar shown at the top of the user panel.
 * Built with Tailwind CSS, supporting dark/light themes, RTL typography,
 * real Lucide icons, Persian digits, and live status pulses.
 */
export function AccountStatusStrip({ lang }: { lang: Lang }) {
  const isFa = lang === 'fa';
  const tx = (en: string, fa: string) => (isFa ? fa : en);

  const [data, setData] = useState<HealthMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.healthMe();
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const isHealthy = data ? data.status === 'ok' : true;
  const walletOk = data ? data.wallet.aboveMinBalance : true;

  // Formatted balance with Persian digits in fa mode
  const balanceFmt = data
    ? isFa
      ? toPersianDigits(Number(data.wallet.balanceToman).toLocaleString('fa-IR'))
      : Number(data.wallet.balanceToman).toLocaleString('en-US')
    : '۰';

  return (
    <aside
      aria-label={tx('System Status Bar', 'نوار وضعیت سیستم')}
      className="relative mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/85 px-4 py-2.5 backdrop-blur-md shadow-xs transition-colors"
    >
      {/* Left items in LTR / Right items in RTL */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
        {/* System Health Indicator Badge */}
        {loading && !data ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-muted-foreground animate-ping" />
            <span>{t(lang, 'health.checking')}</span>
          </div>
        ) : error ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-400">
            <XCircle className="h-3.5 w-3.5" />
            <span>{t(lang, 'health.failed')}</span>
          </div>
        ) : !isHealthy ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{tx('Service Degraded', 'سرویس نیازمند بررسی')}</span>
          </div>
        ) : !walletOk ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{tx('Low Balance', 'موجودی ناکافی')}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>{tx('System Operational', 'سرویس فعال و پایدار')}</span>
          </div>
        )}

        <div className="hidden h-3.5 w-px bg-border sm:block" />

        {/* Live Metrics */}
        {data && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Wallet Balance */}
            <Link
              href="/user/wallet"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              title={tx('Wallet balance — click to manage', 'موجودی کیف پول — کلیک جهت مشاهده و شارژ')}
            >
              <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-[11px] text-muted-foreground">{tx('Balance', 'موجودی')}:</span>
              <span className="font-bold text-foreground">
                {balanceFmt} {tx('Toman', 'تومان')}
              </span>
            </Link>

            <div className="hidden h-3 w-px bg-border/70 md:block" />

            {/* Subscription */}
            <Link
              href="/user/plans"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              title={tx('Subscription plan — click to manage', 'پلن اشتراک — کلیک جهت مدیریت')}
            >
              <CreditCard className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[11px] text-muted-foreground">{tx('Plan', 'پلن')}:</span>
              <span className="font-semibold text-foreground">
                {data.plan?.name ?? tx('None', 'ندارد')}
              </span>
            </Link>

            <div className="hidden h-3 w-px bg-border/70 md:block" />

            {/* Active Credentials */}
            <Link
              href="/user/credentials"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              title={tx('Active proxy credentials', 'کلیدهای احراز هویت فعال')}
            >
              <KeyRound className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[11px] text-muted-foreground">{tx('Keys', 'کلیدها')}:</span>
              <span className="font-semibold text-foreground">
                {isFa ? toPersianDigits(data.usage.activeCredentials) : data.usage.activeCredentials}
              </span>
            </Link>

            <div className="hidden h-3 w-px bg-border/70 md:block" />

            {/* Active Forwarders */}
            <Link
              href="/user/forwarders"
              className="hidden md:inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              title={tx('Active forwarder paths', 'مسیرهای فورواردر فعال')}
            >
              <Network className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[11px] text-muted-foreground">{tx('Forwarders', 'فورواردرها')}:</span>
              <span className="font-semibold text-foreground">
                {isFa ? toPersianDigits(data.usage.enabledForwarders) : data.usage.enabledForwarders} /{' '}
                {isFa ? toPersianDigits(data.usage.totalForwarders) : data.usage.totalForwarders}
              </span>
            </Link>

            <div className="hidden h-3 w-px bg-border/70 lg:block" />

            {/* Total Calls */}
            <div className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <span className="text-[11px] text-muted-foreground">{tx('Calls', 'فراخوانی‌ها')}:</span>
              <span className="font-semibold text-foreground">
                {isFa ? toPersianDigits(data.usage.totalCallsAllTime) : data.usage.totalCallsAllTime}
              </span>
            </div>

            <div className="hidden h-3 w-px bg-border/70 xl:block" />

            {/* Bandwidth Usage */}
            <div className="hidden xl:inline-flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
              <ArrowDownUp className="h-3.5 w-3.5 text-violet-500 shrink-0" />
              <span className="text-[11px] text-muted-foreground">{tx('Traffic', 'ترافیک')}:</span>
              <span className="font-semibold text-foreground">{fmtBytes(data.usage.totalBytesIn, lang)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Right / End Action: Live Refresh */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          title={tx('Refresh status and balance', 'تازه‌سازی وضعیت و موجودی')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-95 disabled:opacity-50"
        >
          <RotateCw className={`h-3 w-3 ${loading ? 'animate-spin text-primary' : ''}`} />
          <span className="text-[11px]">{tx('Refresh', 'تازه‌سازی')}</span>
        </button>
      </div>
    </aside>
  );
}
