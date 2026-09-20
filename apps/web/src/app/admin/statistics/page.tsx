'use client';
import { useEffect, useState } from 'react';
import { api, AdminStatistics } from '../../../lib/api';
import { PageHeader, Card, StatCard, Alert, Spinner, colors } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';

function formatBytes(value: string) { let n = Number(value); const units = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; } return `${n.toFixed(i ? 2 : 0)} ${units[i]}`; }

export default function AdminStatisticsPage() {
  const { lang } = useLang(); const tx = (en: string, fa: string) => lang === 'fa' ? fa : en;
  const [stats, setStats] = useState<AdminStatistics | null>(null); const [error, setError] = useState('');
  useEffect(() => { api.adminStatistics().then(setStats).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load statistics')); }, []);
  if (error) return <Alert message={error} />; if (!stats) return <Spinner />;
  return <div><PageHeader title={tx('Statistics & Budget', 'آمار و بودجه')} action={<button onClick={() => window.location.reload()} style={{ padding: '8px 14px', border: `1px solid ${colors.border}`, borderRadius: 7, background: '#f8fafc', cursor: 'pointer' }}>{tx('Refresh', 'تازه‌سازی')}</button>} />
    <p style={{ color: colors.textMuted, fontSize: 13, marginTop: -12, marginBottom: 22 }}>{tx('Platform-wide financial, usage, and capacity metrics from the shared wallet ledger.', 'شاخص‌های مالی، مصرف و ظرفیت پلتفرم از دفترکل مشترک کیف پول.')}</p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
      <StatCard label={tx('Total wallet balances (toman)', 'کل موجودی کیف پول‌ها (تومان)')} value={Number(stats.walletBalanceToman).toLocaleString()} color="#166534" />
      <StatCard label={tx('Collected usage revenue (toman)', 'درآمد مصرف دریافت‌شده (تومان)')} value={Number(stats.revenueToman).toLocaleString()} color="#1d4ed8" />
      <StatCard label={tx('Wallet transactions', 'تراکنش‌های کیف پول')} value={stats.transactionCount} />
      <StatCard label={tx('Requests billed', 'درخواست‌های محاسبه‌شده')} value={stats.requestCount} />
    </div>
    <Card style={{ padding: 22, marginBottom: 20 }}><h2 style={{ margin: '0 0 18px', fontSize: 17, color: colors.navy }}>{tx('Usage & capacity', 'مصرف و ظرفیت')}</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>{[[tx('SOCKS5 bandwidth', 'پهنای باند سرویس'), formatBytes(stats.socksBandwidthBytes)], [tx('Active subscriptions', 'اشتراک‌های فعال'), stats.activeSubscriptions], [tx('Active credentials', 'اعتبارنامه‌های فعال'), stats.activeCredentials], [tx('Active forwarders', 'فورواردهای فعال'), stats.activeForwarders], [tx('Active users', 'کاربران فعال'), stats.totalUsers], [tx('Healthy nodes', 'نودهای سالم'), `${stats.healthyNodes} / ${stats.totalNodes}`], [tx('Enabled countries', 'کشورهای فعال'), stats.activeCountries]].map(([label, value]) => <div key={String(label)} style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: 8 }}><div style={{ fontSize: 12, color: colors.textMuted }}>{label}</div><strong style={{ display: 'block', marginTop: 6, color: colors.navy }}>{value}</strong></div>)}</div></Card>
    <Card style={{ padding: 22, background: '#f8fafc' }}><h2 style={{ margin: '0 0 10px', fontSize: 17, color: colors.navy }}>{tx('Budget controls', 'کنترل‌های بودجه')}</h2><p style={{ margin: 0, color: colors.textMuted, fontSize: 13, lineHeight: 1.7 }}>{tx('Pricing controls remain available under Pricing. All deposits, request charges, bandwidth charges, forwarding costs, and adjustments are recorded in the same wallet ledger.', 'کنترل‌های قیمت‌گذاری در بخش قیمت‌گذاری در دسترس هستند. همه واریزها، هزینه درخواست، پهنای باند، فوروارد و اصلاحات در یک دفترکل کیف پول ثبت می‌شوند.')} {new Date(stats.generatedAt).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US')}</p></Card>
  </div>;
}
