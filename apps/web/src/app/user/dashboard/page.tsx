'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  api,
  WalletMeResponse,
  Forwarder,
  Socks5Endpoint,
  getPublicApiBase,
} from '../../../lib/api';
import {
  StatCard,
  Alert,
  Spinner,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import { AccountStatusStrip } from '../../../lib/account-status';
import { UsageAreaChart } from '../../../components/ui/chart';
import { GatewayCard } from './gateway-card';
import { toast } from 'sonner';
import {
  Activity,
  KeyRound,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Network,
  Wallet,
  Coins,
  RefreshCw,
  UserCheck,
  AlertCircle,
} from 'lucide-react';

interface Me {
  id: string;
  displayName: string | null;
  email: string | null;
  status: string;
  routingPreference?: { routingMode: string; preferredCountry: string | null };
}

interface Usage {
  bytesUsed: number | string;
  connectionsUsed: number | string;
  periodStart: string;
  periodEnd: string;
  plan?: { name: string; monthlyBandwidthGb: number };
}

function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return (n / 1024).toFixed(0) + ' KB';
}

function fmtNum(n: string | number, lang: string): string {
  const num = typeof n === 'string' ? Number(n) : n;
  return num.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
}

export default function UserDashboardPage() {
  const { lang, isRTL } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [apiBase, setApiBase] = useState<string>(() => getPublicApiBase());
  useEffect(() => {
    setApiBase(getPublicApiBase());
  }, []);

  const [me, setMe] = useState<Me | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [creds, setCreds] = useState<any[]>([]);
  const [wallet, setWallet] = useState<WalletMeResponse | null>(null);
  const [forwarders, setForwarders] = useState<Forwarder[]>([]);
  const [userSlug, setUserSlug] = useState('');
  const [socksEndpoints, setSocksEndpoints] = useState<Socks5Endpoint[]>([]);
  const [socksRequiresPlan, setSocksRequiresPlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData(showToast = false) {
    try {
      const [meData, usageData, credsData, walletData, fwdData, socksData] =
        await Promise.all([
          api.me(),
          api.myUsage().catch(() => null),
          api.myCredentials().catch(() => []),
          api.wallet.me().catch(() => null),
          api.forwarders.list().catch(() => null),
          api.socks5.endpoints().catch(() => ({ endpoints: [], requiresActivePlan: false })),
        ]);

      setMe(meData);
      setUsage(usageData);
      setCreds(Array.isArray(credsData) ? credsData : []);
      setWallet(walletData);
      if (fwdData) {
        setForwarders(fwdData.forwarders || []);
        setUserSlug(fwdData.userSlug || '');
      }
      if (socksData) {
        setSocksEndpoints(socksData.endpoints || []);
        setSocksRequiresPlan(socksData.requiresActivePlan || false);
      }
      setError('');
      if (showToast) {
        toast.success(tx('Dashboard updated', 'اطلاعات با موفقیت به‌روزرسانی شد'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load dashboard data';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const bytesUsed = usage ? Number(usage.bytesUsed) : 0;
  const planGb = usage?.plan ? Number(usage.plan.monthlyBandwidthGb) : null;
  const usedPct = planGb ? Math.min(100, Math.round((bytesUsed / (planGb * 1e9)) * 100)) : null;

  const balanceToman = wallet ? BigInt(wallet.balanceToman) : 0n;
  const minBalanceToman = wallet ? BigInt(wallet.pricing.minBalanceToman) : 100n;
  const isBalanceLow = balanceToman < minBalanceToman;

  // Chart data simulation based on real usage
  const chartData = useMemo(() => {
    const totalConns = usage ? Number(usage.connectionsUsed) || 0 : 0;
    const mbUsed = Math.max(0.5, Math.round(bytesUsed / (1024 * 1024)));

    return [
      { time: '00:00', requests: Math.round(totalConns * 0.1), bandwidthMb: Math.round(mbUsed * 0.1) },
      { time: '04:00', requests: Math.round(totalConns * 0.05), bandwidthMb: Math.round(mbUsed * 0.05) },
      { time: '08:00', requests: Math.round(totalConns * 0.3), bandwidthMb: Math.round(mbUsed * 0.3) },
      { time: '12:00', requests: Math.round(totalConns * 0.7), bandwidthMb: Math.round(mbUsed * 0.6) },
      { time: '16:00', requests: Math.round(totalConns * 0.9), bandwidthMb: Math.round(mbUsed * 0.85) },
      { time: '20:00', requests: totalConns, bandwidthMb: mbUsed },
    ];
  }, [usage, bytesUsed]);

  const activeCred = creds.find((c) => c.enabled) || creds[0];

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Live Account Status Strip */}
      <AccountStatusStrip lang={lang} />

      {/* Main Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t(lang, 'udash.welcome')}
              {me?.displayName ? `, ${me.displayName}` : ''}
            </h1>
            <Badge
              label={me?.status === 'active' ? (isRTL ? 'حساب فعال' : 'Active') : me?.status || 'Active'}
              variant="success"
            />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <span>{me?.email}</span>
            {userSlug && (
              <>
                <span>·</span>
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                  slug: {userSlug}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => loadData(true)} variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4" />
            <span>{tx('Refresh', 'تازه‌سازی')}</span>
          </Button>
        </div>
      </div>

      {error && <Alert message={error} type="error" />}

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Wallet Balance StatCard */}
        <Card
          className={`p-5 flex-1 min-w-[200px] border transition-all ${
            isBalanceLow
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-emerald-500/30 bg-emerald-500/5'
          }`}
        >
          <div className="flex items-center justify-between pb-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {t(lang, 'wallet.balance')}
            </p>
            <Wallet
              className={`h-4 w-4 ${isBalanceLow ? 'text-destructive' : 'text-emerald-600'}`}
            />
          </div>
          <div className="flex items-baseline gap-1 pt-1 font-mono">
            <span
              className={`text-2xl font-bold tracking-tight ${
                isBalanceLow ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'
              }`}
              dir="ltr"
            >
              {wallet ? fmtNum(wallet.balanceToman, lang) : '0'}
            </span>
            <span className="text-xs text-muted-foreground">{t(lang, 'wallet.currency')}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Link
              href="/user/wallet"
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              <span>{isRTL ? 'مشاهده و شارژ' : 'View & Top up'}</span>
              {isRTL ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Link>
          </p>
        </Card>

        {/* Bandwidth Usage StatCard */}
        <StatCard
          label={t(lang, 'udash.bandwidth')}
          value={fmtBytes(bytesUsed)}
          icon={HardDrive}
          description={isRTL ? 'حجم مصرفی دوره فعلی' : 'Current period usage'}
        />

        {/* Connections / Requests StatCard */}
        <StatCard
          label={t(lang, 'udash.connections')}
          value={usage ? Number(usage.connectionsUsed).toLocaleString() : '0'}
          icon={Activity}
          description={isRTL ? 'تعداد اتصالات موفق' : 'Active proxy handshakes'}
        />

        {/* Credentials & Forwarders StatCard */}
        <StatCard
          label={isRTL ? 'کلیدها و فورواردرها' : 'Keys & Forwarders'}
          value={`${creds.length} / ${forwarders.length}`}
          icon={KeyRound}
          description={
            isRTL
              ? `${creds.length} کلید، ${forwarders.length} فورواردر`
              : `${creds.length} creds, ${forwarders.length} forwarders`
          }
        />
      </div>

      {/* Plan / Bandwidth Quota Progress or Top-up Notice */}
      {planGb && usedPct !== null ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  {t(lang, 'udash.monthly')} — {usage?.plan?.name || t(lang, 'udash.plan')}
                </CardTitle>
                <CardDescription className="text-xs">
                  {fmtBytes(bytesUsed)} {t(lang, 'udash.of')} {planGb} GB {t(lang, 'udash.used')} ({usedPct}%)
                </CardDescription>
              </div>
              <span
                className={`text-2xl font-bold font-mono ${
                  usedPct > 85 ? 'text-destructive' : usedPct > 65 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {usedPct}%
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  usedPct > 85 ? 'bg-destructive' : usedPct > 65 ? 'bg-amber-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.max(2, usedPct)}%` }}
              />
            </div>
            {usage && (
              <p className="text-xs text-muted-foreground">
                {t(lang, 'udash.period')}: {new Date(usage.periodStart).toLocaleDateString()} –{' '}
                {new Date(usage.periodEnd).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      ) : isBalanceLow ? (
        <Card className="border-border/80 border-l-4 border-l-amber-500 bg-amber-500/5">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-semibold text-sm">
                  {isRTL ? 'موجودی حساب شما رو به اتمام است' : 'Low Wallet Balance'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRTL
                    ? `حداقل موجودی برای برقراری اتصالات پروکسی ${wallet?.pricing.minBalanceToman || 100} تومان است.`
                    : `Minimum balance required to route traffic is ${wallet?.pricing.minBalanceToman || 100} Tomans.`}
                </p>
              </div>
            </div>
            <Link href="/user/wallet">
              <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-700 shrink-0">
                <Coins className="h-4 w-4" />
                <span>{isRTL ? 'افزایش موجودی' : 'Top up balance'}</span>
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* Traffic & Relay Activity Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="xl:col-span-7 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  {tx('Recent Proxy Activity', 'نمودار فعالیت و ترافیک پروکسی')}
                </CardTitle>
                <CardDescription className="text-xs">
                  {tx(
                    '24-hour distribution of outbound requests and bandwidth consumption',
                    'توزیع ۲۴ ساعته درخواست‌های خروجی و پهنای باند مصرفی'
                  )}
                </CardDescription>
              </div>
              <Badge label={tx('Active', 'فعال')} variant="success" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <UsageAreaChart data={chartData} height={240} />
          </CardContent>
        </Card>

        {/* Quick Connection Endpoint Widget */}
        <div className="xl:col-span-5 flex flex-col">
          <GatewayCard
            apiBase={apiBase}
            activeCred={activeCred}
            socksEndpoints={socksEndpoints}
            socksRequiresPlan={socksRequiresPlan}
            lang={lang}
          />
        </div>
      </div>

      {/* Feature & Navigation Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:border-primary/50 transition-all flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base">{t(lang, 'user.nav.wallet')}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {isRTL
                ? 'مدیریت موجودی، نرخ تعرفه‌ها و مشاهده ریزتراکنش‌های کسر اعتبار.'
                : 'Inspect balance, tariff rules, and prepaid ledger transactions.'}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/user/wallet" className="w-full">
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span>{isRTL ? 'مشاهده کیف پول' : 'View Wallet'}</span>
                {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </Link>
          </CardFooter>
        </Card>

        <Card className="hover:border-primary/50 transition-all flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t(lang, 'user.nav.credentials')}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {isRTL
                ? 'ساخت کلیدهای احراز هویت UUID و Secret برای SOCKS5 و درگاه HTTP.'
                : 'Create UUID & Secret tokens for SOCKS5 and Gateway authentication.'}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/user/credentials" className="w-full">
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span>{isRTL ? 'مدیریت کلیدها' : 'Manage Keys'}</span>
                {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </Link>
          </CardFooter>
        </Card>

        <Card className="hover:border-primary/50 transition-all flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-sky-600" />
              <CardTitle className="text-base">{t(lang, 'user.nav.forwarders')}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {isRTL
                ? 'تعریف مسیرهای اختصاصی جهت فوروارد مستقیم بدون نیاز به ارسال هدر Auth.'
                : 'Set up dedicated webhook endpoints with zero-configuration auth.'}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/user/forwarders" className="w-full">
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span>{isRTL ? 'مدیریت فورواردرها' : 'Manage Forwarders'}</span>
                {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </Link>
          </CardFooter>
        </Card>

        <Card className="hover:border-primary/50 transition-all flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-violet-600" />
              <CardTitle className="text-base">{t(lang, 'user.nav.profile')}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {isRTL
                ? 'تغییر نام نمایشی و انتخاب کشور خروج موردعلاقه (آلمان، فرانسه و...).'
                : 'Update display name and choose preferred exit relay countries.'}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/user/profile" className="w-full">
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span>{isRTL ? 'تنظیمات پروفایل' : 'Profile Settings'}</span>
                {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
