'use client';
import { useEffect, useState } from 'react';
import { api, AdminStatistics } from '../../../lib/api';
import { PageHeader, Card, StatCard, Alert, Spinner, colors } from '../../../lib/ui';

function formatBytes(value: string) { let n = Number(value); const units = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; } return `${n.toFixed(i ? 2 : 0)} ${units[i]}`; }

export default function AdminStatisticsPage() {
  const [stats, setStats] = useState<AdminStatistics | null>(null); const [error, setError] = useState('');
  useEffect(() => { api.adminStatistics().then(setStats).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load statistics')); }, []);
  if (error) return <Alert message={error} />; if (!stats) return <Spinner />;
  return <div><PageHeader title="Statistics & Budget" action={<button onClick={() => window.location.reload()} style={{ padding: '8px 14px', border: `1px solid ${colors.border}`, borderRadius: 7, background: '#f8fafc', cursor: 'pointer' }}>Refresh</button>} />
    <p style={{ color: colors.textMuted, fontSize: 13, marginTop: -12, marginBottom: 22 }}>Platform-wide financial, usage, and capacity metrics from the shared wallet ledger.</p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
      <StatCard label="Total wallet balances (toman)" value={Number(stats.walletBalanceToman).toLocaleString()} color="#166534" />
      <StatCard label="Collected usage revenue (toman)" value={Number(stats.revenueToman).toLocaleString()} color="#1d4ed8" />
      <StatCard label="Wallet transactions" value={stats.transactionCount} />
      <StatCard label="Requests billed" value={stats.requestCount} />
    </div>
    <Card style={{ padding: 22, marginBottom: 20 }}><h2 style={{ margin: '0 0 18px', fontSize: 17, color: colors.navy }}>Usage & capacity</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>{[['SOCKS5 bandwidth', formatBytes(stats.socksBandwidthBytes)], ['Active subscriptions', stats.activeSubscriptions], ['Active credentials', stats.activeCredentials], ['Active forwarders', stats.activeForwarders], ['Active users', stats.totalUsers], ['Healthy nodes', `${stats.healthyNodes} / ${stats.totalNodes}`], ['Enabled countries', stats.activeCountries]].map(([label, value]) => <div key={String(label)} style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: 8 }}><div style={{ fontSize: 12, color: colors.textMuted }}>{label}</div><strong style={{ display: 'block', marginTop: 6, color: colors.navy }}>{value}</strong></div>)}</div></Card>
    <Card style={{ padding: 22, background: '#f8fafc' }}><h2 style={{ margin: '0 0 10px', fontSize: 17, color: colors.navy }}>Budget controls</h2><p style={{ margin: 0, color: colors.textMuted, fontSize: 13, lineHeight: 1.7 }}>Pricing controls remain available under Pricing. All user deposits, request charges, SOCKS5 bandwidth charges, forwarding costs, and adjustments are recorded in the same wallet ledger. Last generated: {new Date(stats.generatedAt).toLocaleString()}</p></Card>
  </div>;
}
