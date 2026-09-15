'use client';

import { useEffect, useState } from 'react';
import { api, HealthMeResponse } from './api';
import { colors } from './ui';
import { t, Lang } from './i18n';

function fmtBytes(n: string | number): string {
  const b = typeof n === 'string' ? Number(n) : n;
  if (!b || b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Compact status bar shown at the top of user pages. Loads on mount, silent
 * refresh button, no big buttons or heavy visuals — designed to be a peripheral
 * always-there indicator, not a modal experience.
 */
export function AccountStatusStrip({ lang }: { lang: Lang }) {
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

  useEffect(() => { load(); }, []);

  const ok = data && data.status === 'ok';
  const walletOk = data ? data.wallet.aboveMinBalance : true;
  const bg = error ? '#fef2f2' : !walletOk ? '#fffbeb' : ok ? '#f0fdf4' : '#f8fafc';
  const borderColor = error ? '#fca5a5' : !walletOk ? '#fcd34d' : ok ? '#bbf7d0' : colors.border;
  const dotColor = error ? '#dc2626' : !walletOk ? '#d97706' : ok ? '#16a34a' : '#94a3b8';
  const balanceFmt = data ? Number(data.wallet.balanceToman).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US') : '';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      padding: '10px 16px', marginBottom: 20,
      background: bg, border: `1px solid ${borderColor}`,
      borderRadius: 8, fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: dotColor,
          animation: loading ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontWeight: 600, color: error ? '#991b1b' : !walletOk ? '#92400e' : ok ? '#166534' : colors.textMuted }}>
          {loading ? t(lang, 'health.checking')
            : error ? t(lang, 'health.failed')
            : !walletOk ? t(lang, 'wallet.low_balance_warning').slice(0, 60) + (t(lang, 'wallet.low_balance_warning').length > 60 ? '…' : '')
            : t(lang, 'health.ok')}
        </span>
      </div>

      {data && (
        <>
          <StripDivider />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ color: colors.textMuted, fontSize: 11 }}>{t(lang, 'wallet.balance')}:</span>
            <span style={{ fontWeight: 700, color: !walletOk ? '#92400e' : '#065f46', direction: 'ltr' }}>
              {balanceFmt} {t(lang, 'wallet.currency')}
            </span>
          </div>
          <StripDivider />
          <StripStat label={t(lang, 'health.credentials_active')} value={String(data.usage.activeCredentials)} />
          <StripDivider />
          <StripStat
            label={t(lang, 'health.forwarders_active')}
            value={`${data.usage.enabledForwarders} / ${data.usage.totalForwarders}`}
          />
          <StripDivider />
          <StripStat label={t(lang, 'health.calls_all_time')} value={data.usage.totalCallsAllTime} />
          <StripDivider />
          <StripStat label={t(lang, 'health.bytes_transferred')} value={fmtBytes(data.usage.totalBytesIn)} />
        </>
      )}

      <div style={{ marginLeft: 'auto' }}>
        <button
          onClick={load}
          disabled={loading}
          title={t(lang, 'health.check')}
          style={{
            background: 'transparent', border: 'none', cursor: loading ? 'default' : 'pointer',
            padding: '4px 8px', borderRadius: 4, fontSize: 14,
            color: colors.textMuted, opacity: loading ? 0.4 : 0.7,
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '0.7'; }}
        >
          {loading ? '⏳' : '↻'}
        </button>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function StripStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ color: colors.textMuted, fontSize: 11 }}>{label}:</span>
      <span style={{ fontWeight: 600, color: colors.text }}>{value}</span>
    </div>
  );
}

function StripDivider() {
  return <span style={{ color: colors.border, fontSize: 10 }}>·</span>;
}
