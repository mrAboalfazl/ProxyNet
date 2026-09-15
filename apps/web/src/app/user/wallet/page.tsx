'use client';

import { useEffect, useState } from 'react';
import { api, WalletMeResponse, WalletTransaction } from '../../../lib/api';
import { PageHeader, Card, Alert, Spinner, colors } from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import { AccountStatusStrip } from '../../../lib/account-status';

function fmtNum(n: string | number, lang: string): string {
  const num = typeof n === 'string' ? Number(n) : n;
  return num.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
}

function typeColor(type: string, amount: bigint): { bg: string; color: string } {
  const positive = amount >= 0n;
  if (type.startsWith('topup')) return { bg: '#dcfce7', color: '#166534' };
  if (type === 'refund') return { bg: '#dbeafe', color: '#1e40af' };
  if (type === 'adjustment_admin') return positive
    ? { bg: '#e0e7ff', color: '#3730a3' }
    : { bg: '#fef3c7', color: '#92400e' };
  return { bg: '#fee2e2', color: '#991b1b' }; // debits (gateway_call / forwarder_call)
}

export default function WalletPage() {
  const { lang } = useLang();
  const [wallet, setWallet] = useState<WalletMeResponse | null>(null);
  const [txns, setTxns] = useState<WalletTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.wallet.me(), api.wallet.transactions(50)])
      .then(([w, t]) => { setWallet(w); setTxns(t); })
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'));
  }, []);

  if (error) return <Alert message={error} />;
  if (!wallet || !txns) return <Spinner />;

  const balance = BigInt(wallet.balanceToman);
  const minBalance = BigInt(wallet.pricing.minBalanceToman);
  const belowMin = balance < minBalance;

  return (
    <div>
      <AccountStatusStrip lang={lang} />
      <PageHeader title={t(lang, 'wallet.title')} />

      {/* Balance card */}
      <Card style={{
        padding: '28px 30px', marginBottom: 20,
        background: belowMin
          ? 'linear-gradient(135deg, #fef2f2 0%, #ffffff 60%)'
          : 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 60%)',
        border: `1px solid ${belowMin ? '#fecaca' : '#a7f3d0'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t(lang, 'wallet.balance')}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 700, color: belowMin ? '#991b1b' : '#065f46', direction: 'ltr' }}>
                {fmtNum(wallet.balanceToman, lang)}
              </span>
              <span style={{ fontSize: 15, color: colors.textMuted }}>{t(lang, 'wallet.currency')}</span>
            </div>
          </div>
        </div>
        {belowMin && (
          <div style={{
            marginTop: 18, padding: '12px 16px', borderRadius: 6, background: '#fef2f2',
            border: '1px solid #fca5a5', fontSize: 13, color: '#991b1b', lineHeight: 1.5,
          }}>
            ⚠ {balance === 0n
              ? t(lang, 'wallet.zero_balance').replace('{min}', fmtNum(wallet.pricing.minBalanceToman, lang))
              : t(lang, 'wallet.low_balance_warning')}
          </div>
        )}
      </Card>

      {/* Pricing card */}
      <Card style={{ padding: '20px 26px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.navy, marginBottom: 12 }}>
          {t(lang, 'wallet.pricing_title')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <PriceStat label={t(lang, 'wallet.pricing_per_request')} value={fmtNum(wallet.pricing.perRequestToman, lang)} unit={t(lang, 'wallet.currency')} />
          <PriceStat label={t(lang, 'wallet.pricing_per_mb')} value={fmtNum(wallet.pricing.perMbToman, lang)} unit={t(lang, 'wallet.currency')} />
          <PriceStat label={t(lang, 'wallet.pricing_min_balance')} value={fmtNum(wallet.pricing.minBalanceToman, lang)} unit={t(lang, 'wallet.currency')} />
        </div>
        <p style={{ margin: '16px 0 0', padding: '10px 14px', borderRadius: 6, background: '#f0f9ff', color: '#0c4a6e', fontSize: 12, lineHeight: 1.6 }}>
          💡 {t(lang, 'wallet.topup_note')}
        </p>
      </Card>

      {/* Transactions */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px 12px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.navy }}>
            {t(lang, 'wallet.transactions')}
          </div>
        </div>
        {txns.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
            {t(lang, 'wallet.no_transactions')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${colors.border}` }}>
                  <Th>{t(lang, 'wallet.tx.date')}</Th>
                  <Th>{t(lang, 'wallet.tx.type')}</Th>
                  <Th>{t(lang, 'wallet.tx.description')}</Th>
                  <Th align="end">{t(lang, 'wallet.tx.amount')}</Th>
                  <Th align="end">{t(lang, 'wallet.tx.balance')}</Th>
                </tr>
              </thead>
              <tbody>
                {txns.map((tx) => {
                  const amount = BigInt(tx.amountToman);
                  const isCredit = amount >= 0n;
                  const chip = typeColor(tx.type, amount);
                  return (
                    <tr key={tx.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <Td style={{ color: colors.textMuted, fontSize: 12 }}>
                        {new Date(tx.createdAt).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US', {
                          dateStyle: 'short', timeStyle: 'short',
                        })}
                      </Td>
                      <Td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: chip.bg, color: chip.color, whiteSpace: 'nowrap',
                        }}>
                          {t(lang, `wallet.type.${tx.type}`) === `wallet.type.${tx.type}` ? tx.type : t(lang, `wallet.type.${tx.type}`)}
                        </span>
                      </Td>
                      <Td style={{ fontSize: 12, color: colors.textMuted, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={tx.description ?? ''}>
                        {tx.description ?? '—'}
                      </Td>
                      <Td align="end" style={{
                        fontVariantNumeric: 'tabular-nums', fontWeight: 600, direction: 'ltr',
                        color: isCredit ? '#166534' : '#991b1b',
                      }}>
                        {isCredit ? '+' : ''}{fmtNum(tx.amountToman, lang)}
                      </Td>
                      <Td align="end" style={{ fontVariantNumeric: 'tabular-nums', color: colors.textMuted, direction: 'ltr' }}>
                        {fmtNum(tx.balanceAfterToman, lang)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({ children, align = 'start' }: { children: React.ReactNode; align?: 'start' | 'end' }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: align, fontWeight: 600, fontSize: 11,
      color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {children}
    </th>
  );
}

function Td({ children, align = 'start', style, title }: { children: React.ReactNode; align?: 'start' | 'end'; style?: React.CSSProperties; title?: string }) {
  return <td style={{ padding: '10px 16px', textAlign: align, ...style }} title={title}>{children}</td>;
}

function PriceStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: colors.text, direction: 'ltr' }}>{value}</span>
        <span style={{ fontSize: 12, color: colors.textMuted }}>{unit}</span>
      </div>
    </div>
  );
}
