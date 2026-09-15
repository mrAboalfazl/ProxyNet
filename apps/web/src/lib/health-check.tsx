'use client';

import { useState } from 'react';
import { api, HealthMeResponse } from './api';
import { colors } from './ui';
import { t, Lang } from './i18n';

function formatBytes(n: string | number): string {
  const bytes = typeof n === 'string' ? Number(n) : n;
  if (!bytes || bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function HealthCheckButton({ lang }: { lang: Lang }) {
  const [result, setResult] = useState<HealthMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.healthMe();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Health check failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const isOk = result && result.status === 'ok';

  return (
    <div>
      <button
        onClick={run}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 8,
          background: loading ? '#94a3b8' : '#16a34a',
          color: '#fff', border: 'none', cursor: loading ? 'default' : 'pointer',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        <span style={{ fontSize: 15 }}>{loading ? '⏳' : isOk ? '💚' : '🩺'}</span>
        {loading ? t(lang, 'health.checking') : t(lang, 'health.check')}
      </button>

      {(result || error) && (
        <div style={{
          marginTop: 12, padding: '14px 18px', borderRadius: 8,
          background: isOk ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${isOk ? '#86efac' : '#fca5a5'}`,
          fontSize: 13, color: isOk ? '#166534' : '#991b1b',
        }}>
          {error && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>✗ {t(lang, 'health.failed')}</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{error}</div>
            </div>
          )}
          {result && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                ✓ {t(lang, 'health.ok')}
                <span style={{ fontWeight: 400, fontSize: 11, color: colors.textMuted, marginLeft: 8 }}>
                  {t(lang, 'health.last_checked')}: {new Date(result.timestamp).toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US')}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 10 }}>
                <Stat label={t(lang, 'health.plan')} value={result.plan?.name ?? t(lang, 'health.no_plan')} />
                <Stat label={t(lang, 'health.credentials_active')} value={result.usage.activeCredentials.toString()} />
                <Stat label={t(lang, 'health.forwarders_active')} value={`${result.usage.enabledForwarders} / ${result.usage.totalForwarders}`} />
                <Stat label={t(lang, 'health.calls_all_time')} value={result.usage.totalCallsAllTime} />
                <Stat label={t(lang, 'health.bytes_transferred')} value={formatBytes(result.usage.totalBytesIn)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#052e16' }}>{value}</div>
    </div>
  );
}
