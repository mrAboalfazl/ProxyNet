'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { StatCard, Alert, Spinner, Card, colors } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';

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

export default function UserDashboardPage() {
  const { lang } = useLang();
  const [me, setMe] = useState<Me | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [credCount, setCredCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [meData, usageData, creds] = await Promise.all([
          api.me(),
          api.myUsage().catch(() => null),
          api.myCredentials().catch(() => []),
        ]);
        setMe(meData);
        setUsage(usageData);
        setCredCount(Array.isArray(creds) ? creds.length : 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Spinner />;

  const bytesUsed = usage ? Number(usage.bytesUsed) : 0;
  const planGb = usage?.plan ? Number(usage.plan.monthlyBandwidthGb) : null;
  const usedPct = planGb ? Math.min(100, Math.round((bytesUsed / (planGb * 1e9)) * 100)) : null;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: colors.navy }}>
          {t(lang, 'udash.welcome')}{me?.displayName ? `, ${me.displayName}` : ''}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textMuted }}>{me?.email}</p>
      </div>

      {error && <Alert message={error} />}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard label={t(lang, 'udash.bandwidth')} value={fmtBytes(bytesUsed)} />
        <StatCard label={t(lang, 'udash.connections')} value={usage ? Number(usage.connectionsUsed).toLocaleString() : '—'} />
        <StatCard label={t(lang, 'udash.credentials')} value={credCount ?? '—'} />
      </div>

      {planGb && usedPct !== null && (
        <Card style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.textMuted }}>
                {t(lang, 'udash.monthly')} — {usage?.plan?.name || t(lang, 'udash.plan')}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                {fmtBytes(bytesUsed)} {t(lang, 'udash.of')} {planGb} GB {t(lang, 'udash.used')} ({usedPct}%)
              </p>
            </div>
            <span style={{
              fontSize: 22, fontWeight: 700,
              color: usedPct > 80 ? colors.danger : usedPct > 60 ? colors.warning : colors.success,
            }}>
              {usedPct}%
            </span>
          </div>
          <div style={{ height: 10, backgroundColor: colors.border, borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 5,
              width: `${usedPct}%`,
              backgroundColor: usedPct > 80 ? colors.danger : usedPct > 60 ? colors.warning : colors.primary,
              transition: 'width 0.5s ease',
            }} />
          </div>
          {usage && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.textMuted }}>
              {t(lang, 'udash.period')}: {new Date(usage.periodStart).toLocaleDateString()} – {new Date(usage.periodEnd).toLocaleDateString()}
            </p>
          )}
        </Card>
      )}

      {!planGb && (
        <Card style={{ padding: '20px 24px', marginBottom: 24, borderLeft: `4px solid ${colors.warning}` }}>
          <p style={{ margin: 0, fontWeight: 600, color: colors.navy }}>{t(lang, 'udash.no_plan')}</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.textMuted }}>
            {t(lang, 'udash.no_plan_msg')}
          </p>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card style={{ padding: '20px 24px', flex: 1, minWidth: 220 }}>
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: colors.navy }}>{t(lang, 'udash.proxy_title')}</p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: colors.textMuted }}>
            {t(lang, 'udash.proxy_msg')}
          </p>
          <a href="/user/credentials" style={{
            display: 'inline-block', padding: '8px 18px', fontSize: 13, fontWeight: 600,
            backgroundColor: colors.primary, color: '#fff', borderRadius: 6, textDecoration: 'none',
          }}>
            {t(lang, 'udash.manage')}
          </a>
        </Card>
        <Card style={{ padding: '20px 24px', flex: 1, minWidth: 220 }}>
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: colors.navy }}>{t(lang, 'udash.account_title')}</p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: colors.textMuted }}>
            {t(lang, 'udash.account_msg')}
          </p>
          <a href="/user/profile" style={{
            display: 'inline-block', padding: '8px 18px', fontSize: 13, fontWeight: 600,
            backgroundColor: '#e5e7eb', color: '#374151', borderRadius: 6, textDecoration: 'none',
          }}>
            {t(lang, 'udash.edit_profile')}
          </a>
        </Card>
      </div>
    </div>
  );
}
