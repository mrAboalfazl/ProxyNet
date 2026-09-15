'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, AdminUserDetails, AdminVlessBundle, AdminWalletBundle } from '../../../../lib/api';
import { PageHeader, Card, Badge, Button, Alert, Spinner, colors } from '../../../../lib/ui';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        fontSize: 12, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
        border: `1px solid ${colors.border}`, background: copied ? '#dcfce7' : '#f8fafc',
        color: copied ? '#166534' : colors.textMuted, whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓' : label}
    </button>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<AdminUserDetails | null>(null);
  const [vless, setVless] = useState<AdminVlessBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showVless, setShowVless] = useState(false);
  const [wallet, setWallet] = useState<AdminWalletBundle | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);

  async function loadWallet() {
    try {
      const w = await api.adminWallet.get(params.id);
      setWallet(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wallet');
    }
  }
  useEffect(() => { loadWallet(); }, [params.id]);

  async function submitTopup(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseInt(topupAmount, 10);
    if (!Number.isFinite(amt) || amt === 0) return;
    setTopupBusy(true);
    try {
      if (amt > 0) await api.adminWallet.topup(params.id, amt, topupNote || undefined);
      else         await api.adminWallet.adjust(params.id, amt, topupNote || undefined);
      setTopupAmount(''); setTopupNote('');
      await loadWallet();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setTopupBusy(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const u = await api.users.get(params.id);
        setUser(u);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load user');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  async function loadVless() {
    try {
      const bundle = await api.users.getVless(params.id);
      setVless(bundle);
      setShowVless(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load VLESS URIs');
    }
  }

  if (loading) return <Spinner />;
  if (error && !user) return <Alert message={error} />;
  if (!user) return null;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/users" style={{ color: colors.textMuted, fontSize: 13, textDecoration: 'none' }}>
          ← Back to Users
        </Link>
      </div>

      <PageHeader title={user.displayName || user.email || `User #${user.id}`} />

      {error && <Alert message={error} />}

      {/* Basic info */}
      <Card style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {[
            { l: 'ID', v: user.id },
            { l: 'Email', v: user.email || '—' },
            { l: 'Phone', v: user.phone || '—' },
            { l: 'Public Slug (used in forwarder URLs)', v: user.publicSlug },
            { l: 'Role', v: user.role },
            { l: 'Status', v: user.status },
            { l: 'Routing mode', v: user.routingPreference?.routingMode ?? 'auto' },
            { l: 'Preferred country', v: user.routingPreference?.preferredCountry ?? '—' },
          ].map(({ l, v }) => (
            <div key={l}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 14, color: colors.text }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Wallet — admin can top up + view transactions */}
      <Card style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Wallet balance
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: colors.text, direction: 'ltr' }}>
                {wallet ? Number(wallet.wallet.balanceToman).toLocaleString('en-US') : '—'}
              </span>
              <span style={{ fontSize: 13, color: colors.textMuted }}>toman</span>
            </div>
          </div>

          <form onSubmit={submitTopup} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 3 }}>Amount (toman)</label>
              <input
                type="number" placeholder="e.g. 50000 or -1000"
                value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)}
                style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13, width: 160, direction: 'ltr' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginBottom: 3 }}>Note (optional)</label>
              <input
                type="text" placeholder="e.g. paid via bank transfer"
                value={topupNote} onChange={(e) => setTopupNote(e.target.value)}
                style={{ padding: '6px 10px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13, width: 240 }}
              />
            </div>
            <Button type="submit" disabled={topupBusy || !topupAmount}>
              {topupBusy ? '…' : (parseInt(topupAmount, 10) >= 0 ? 'Top up' : 'Deduct')}
            </Button>
          </form>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>
          Positive amounts credit the wallet as a top-up; negative amounts deduct as an adjustment. Every change is recorded in the ledger below.
        </p>
      </Card>

      {/* Wallet transactions */}
      {wallet && wallet.transactions.length > 0 && (
        <Card style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 22px', borderBottom: `1px solid ${colors.border}`, fontSize: 13, fontWeight: 600, color: colors.navy }}>
            Wallet transactions ({wallet.transactions.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${colors.border}` }}>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase' }}>When</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase' }}>Type</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase' }}>Description</th>
                  <th style={{ padding: '8px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase' }}>Amount</th>
                  <th style={{ padding: '8px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {wallet.transactions.slice(0, 20).map((tx) => {
                  const amt = BigInt(tx.amountToman);
                  const positive = amt >= 0n;
                  return (
                    <tr key={tx.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '8px 14px', color: colors.textMuted }}>
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 14px' }}>{tx.type}</td>
                      <td style={{ padding: '8px 14px', color: colors.textMuted, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.description ?? ''}>
                        {tx.description ?? '—'}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: positive ? '#166534' : '#991b1b', direction: 'ltr' }}>
                        {positive ? '+' : ''}{Number(tx.amountToman).toLocaleString('en-US')}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: colors.textMuted, fontVariantNumeric: 'tabular-nums', direction: 'ltr' }}>
                        {Number(tx.balanceAfterToman).toLocaleString('en-US')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Proxy credentials — admin sees VLESS URIs */}
      <Card style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 16, color: colors.navy }}>
            Proxy Credentials ({user.proxyCredentials.length})
          </div>
          {!showVless && user.proxyCredentials.length > 0 && (
            <Button variant="primary" onClick={loadVless}>Reveal VLESS URIs</Button>
          )}
        </div>

        {user.proxyCredentials.length === 0 ? (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>User has no active credentials.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {user.proxyCredentials.map((c) => {
              const vlessEntry = vless?.credentials.find((vc) => vc.uuid === c.uuid);
              return (
                <div key={c.id} style={{ padding: '12px 14px', border: `1px solid ${colors.border}`, borderRadius: 8, background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, marginRight: 8 }}>{c.label || '(no label)'}</span>
                      <Badge label={c.enabled ? 'enabled' : 'disabled'} />
                    </div>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>
                      created {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>UUID</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <code style={{ flex: 1, fontSize: 12, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '4px 8px', direction: 'ltr' }}>{c.uuid}</code>
                    <CopyButton text={c.uuid} label="Copy" />
                  </div>

                  {vlessEntry && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginTop: 12, marginBottom: 4, textTransform: 'uppercase' }}>
                        ⚠ VLESS URI — admin view only, do NOT share with the user
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <code style={{
                          flex: 1, fontSize: 11, background: '#fffbeb', border: '1px solid #fcd34d',
                          borderRadius: 4, padding: '6px 10px', direction: 'ltr', wordBreak: 'break-all', lineHeight: 1.5,
                        }}>{vlessEntry.vlessUri}</code>
                        <CopyButton text={vlessEntry.vlessUri} label="Copy" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Forwarders */}
      <Card style={{ padding: '20px 24px' }}>
        <div style={{ fontWeight: 600, fontSize: 16, color: colors.navy, marginBottom: 14 }}>
          Forwarders ({user.forwarders.length})
        </div>
        {user.forwarders.length === 0 ? (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>User has no forwarders.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {user.forwarders.map((f) => (
              <div key={f.id} style={{ padding: '10px 14px', border: `1px solid ${colors.border}`, borderRadius: 8, background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 600, marginRight: 8 }}>{f.label}</span>
                    <Badge label={f.enabled ? 'enabled' : 'disabled'} />
                  </div>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>
                    {f.callCount} calls · last used {f.lastUsedAt ? new Date(f.lastUsedAt).toLocaleString() : 'never'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted, direction: 'ltr' }}>
                  <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 3 }}>/api/f/{user.publicSlug}/{f.slug}</code>
                  {' → '}
                  <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 3 }}>{f.targetUrl}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
