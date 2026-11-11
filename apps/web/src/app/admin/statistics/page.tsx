'use client';

import { useEffect, useState } from 'react';
import { api, AdminStatistics } from '../../../lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatCard,
  Alert,
  Spinner,
  Button,
  formatDateTime,
} from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';
import { toast } from 'sonner';
import {
  BarChart3,
  Wallet,
  TrendingUp,
  Receipt,
  Zap,
  HardDrive,
  Users,
  Server,
  Globe2,
  RefreshCw,
  Coins,
  ShieldCheck,
} from 'lucide-react';

function formatBytes(value: string) {
  let n = Number(value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 2 : 0)} ${units[i]}`;
}

export default function AdminStatisticsPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [stats, setStats] = useState<AdminStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(showToast = false) {
    setLoading(true);
    try {
      const data = await api.adminStatistics();
      setStats(data);
      setError('');
      if (showToast) {
        toast.success(tx('Statistics updated', 'آمار با موفقیت به‌روزرسانی شد'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load statistics';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <Alert message={error} type="error" />;
  if (loading || !stats) return <Spinner />;

  const capacityMetrics = [
    {
      label: tx('SOCKS5 Bandwidth', 'پهنای باند سرویس'),
      value: formatBytes(stats.socksBandwidthBytes),
      icon: HardDrive,
      color: 'text-sky-600',
    },
    {
      label: tx('Active Subscriptions', 'اشتراک‌های فعال'),
      value: stats.activeSubscriptions,
      icon: ShieldCheck,
      color: 'text-indigo-600',
    },
    {
      label: tx('Active Credentials', 'اعتبارنامه‌های فعال'),
      value: stats.activeCredentials,
      icon: Zap,
      color: 'text-amber-600',
    },
    {
      label: tx('Active Forwarders', 'فورواردهای فعال'),
      value: stats.activeForwarders,
      icon: BarChart3,
      color: 'text-teal-600',
    },
    {
      label: tx('Active Users', 'کاربران فعال'),
      value: stats.totalUsers,
      icon: Users,
      color: 'text-blue-600',
    },
    {
      label: tx('Healthy Nodes', 'نودهای آنلاین'),
      value: `${stats.healthyNodes} / ${stats.totalNodes}`,
      icon: Server,
      color: 'text-emerald-600',
    },
    {
      label: tx('Enabled Countries', 'کشورهای فعال'),
      value: stats.activeCountries,
      icon: Globe2,
      color: 'text-violet-600',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={tx('Statistics & Budget Overview', 'آمار کلی و بودجه')}
        description={tx(
          'Platform-wide financial, usage, and capacity metrics from the shared wallet ledger.',
          'شاخص‌های مالی، مصرف و ظرفیت عملیاتی پلتفرم از دفترکل مشترک کیف پول.'
        )}
        action={
          <Button onClick={() => load(true)} variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4" />
            <span>{tx('Refresh', 'تازه‌سازی')}</span>
          </Button>
        }
      />

      {/* Primary Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={tx('Total Wallet Balances', 'کل موجودی کیف پول‌ها')}
          value={`${Number(stats.walletBalanceToman).toLocaleString()} تومان`}
          icon={Wallet}
          color="#166534"
          description={tx('Customer prepaid balances', 'مجموع دارایی واریزشده')}
        />
        <StatCard
          label={tx('Collected Usage Revenue', 'درآمد مصرف دریافت‌شده')}
          value={`${Number(stats.revenueToman).toLocaleString()} تومان`}
          icon={TrendingUp}
          color="#1d4ed8"
          description={tx('Earned from billed traffic', 'مجموع کسر اعتبار ترافیک')}
        />
        <StatCard
          label={tx('Wallet Transactions', 'تراکنش‌های کیف پول')}
          value={stats.transactionCount.toLocaleString()}
          icon={Receipt}
          description={tx('Recorded in double-entry ledger', 'ثبت‌شده در دفترکل مالی')}
        />
        <StatCard
          label={tx('Requests Billed', 'درخواست‌های محاسبه‌شده')}
          value={stats.requestCount.toLocaleString()}
          icon={Zap}
          description={tx('Gateway calls & sessions', 'درخواست‌های درگاه و رله')}
        />
      </div>

      {/* Capacity & Usage Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">
              {tx('Usage & Operational Capacity', 'مصرف و ظرفیت عملیاتی')}
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            {tx(
              'Real-time counters of active connections, relays, and subscriptions',
              'شمارنده‌های لحظه‌ای اتصالات، سرورهای رله و اشتراک‌های فعال'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {capacityMetrics.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="p-3.5 rounded-lg border border-border/80 bg-muted/20 space-y-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {item.label}
                    </span>
                    <Icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div className="text-lg font-bold text-foreground">
                    {item.value}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Budget Controls Info Card */}
      <Card className="bg-muted/30 border-border/70">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">
                {tx('Unified Double-Entry Ledger', 'دفترکل یکپارچه دوطرفه')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {tx(
                'Pricing rules and quota caps remain centralized. All user deposits, per-request gateway deductions, bandwidth fees, and admin adjustments are audited atomically with zero balance drift.',
                'تنظیمات قیمت‌گذاری و سقف‌های سهمیه متمرکز هستند. تمام شارژها، کسر کارمزد گیت‌وی، ترافیک مگابایتی و اصلاحات با تضمین اتمیک و حفظ تراز مالی در دفترکل ثبت می‌شوند.'
              )}
            </p>
          </div>
          <span className="text-xs text-muted-foreground self-start sm:self-auto shrink-0">
            {formatDateTime(stats.generatedAt, lang)}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
