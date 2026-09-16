'use client';

import { useEffect, useState } from 'react';
import { api, FinancialReport } from '../../../lib/api';
import { PageHeader, Card, Alert, Spinner, colors } from '../../../components/user-ui';
import { AccountStatusStrip } from '../../../lib/account-status';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';

const labels: Record<string, [string, string]> = {
  requests: ['Requests', 'درخواست‌ها'], proxy_bandwidth: ['Proxy bandwidth', 'پهنای‌باند پروکسی'],
  forwarding: ['Forwarding', 'فورواردینگ'], credentials: ['Credentials', 'اعتبارنامه‌ها'], other: ['Other fees', 'سایر هزینه‌ها'],
};
function num(value: string, lang: string) { return Number(value).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US'); }
function bytes(value: string, lang: string) {
  const n = Number(value); const units = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i ? 2 : 0)} ${units[i]}`;
}

export default function BillingPage() {
  const { lang } = useLang();
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.financialReport().then(setReport).catch((e) => setError(e instanceof Error ? e.message : 'load failed')); }, []);
  if (error) return <Alert message={error} />;
  if (!report) return <Spinner />;
  return <div>
    <AccountStatusStrip lang={lang} />
    <PageHeader title={lang === 'fa' ? 'گزارش مصرف و مالی' : 'Usage & billing'} />
    <Card style={{ padding: 22, marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 16px', color: colors.navy }}>{lang === 'fa' ? 'هزینه بر اساس دسته‌بندی' : 'Spending by category'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
        {report.categories.map((item) => <div key={item.category} style={{ padding: 14, border: `1px solid ${colors.border}`, borderRadius: 8 }}>
          <div style={{ color: colors.textMuted, fontSize: 12 }}>{labels[item.category]?.[lang === 'fa' ? 1 : 0] ?? item.category}</div>
          <strong style={{ display: 'block', marginTop: 6, direction: 'ltr' }}>{num(item.spentToman, lang)} {t(lang, 'wallet.currency')}</strong>
        </div>)}
      </div>
    </Card>
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '18px 22px', borderBottom: `1px solid ${colors.border}`, fontWeight: 700 }}>{lang === 'fa' ? 'مصرف ثبت‌شده' : 'Recorded usage'}</div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr style={{ background: '#f8fafc' }}>
        <th style={{ padding: 10, textAlign: 'start' }}>Protocol</th><th style={{ padding: 10, textAlign: 'start' }}>Type</th><th style={{ padding: 10, textAlign: 'end' }}>Requests</th><th style={{ padding: 10, textAlign: 'end' }}>Bandwidth</th>
      </tr></thead><tbody>{report.usage.map((u) => <tr key={`${u.eventType}-${u.protocol}`} style={{ borderTop: `1px solid ${colors.border}` }}>
        <td style={{ padding: 10 }}>{u.protocol}</td><td style={{ padding: 10 }}>{u.eventType}</td><td style={{ padding: 10, textAlign: 'end' }}>{num(String(u.requests), lang)}</td><td style={{ padding: 10, textAlign: 'end', direction: 'ltr' }}>{bytes(String(Number(u.bytesIn) + Number(u.bytesOut)), lang)}</td>
      </tr>)}</tbody></table></div>
    </Card>
    <Card style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: '18px 22px', borderBottom: `1px solid ${colors.border}`, fontWeight: 700 }}>{lang === 'fa' ? 'تراکنش‌های مالی' : 'Financial transactions'}</div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><tbody>{report.transactions.map((tx) => <tr key={tx.id} style={{ borderTop: `1px solid ${colors.border}` }}><td style={{ padding: 10 }}>{labels[tx.type]?.[lang === 'fa' ? 1 : 0] ?? tx.type}</td><td style={{ padding: 10, color: colors.textMuted }}>{tx.description ?? '—'}</td><td style={{ padding: 10, textAlign: 'end', direction: 'ltr', color: Number(tx.amountToman) >= 0 ? '#166534' : '#991b1b' }}>{num(tx.amountToman, lang)}</td><td style={{ padding: 10, color: colors.textMuted }}>{new Date(tx.createdAt).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US')}</td></tr>)}</tbody></table></div>
    </Card>
  </div>;
}
