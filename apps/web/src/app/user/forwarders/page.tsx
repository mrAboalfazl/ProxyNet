'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, Forwarder } from '../../../lib/api';
import { PageHeader, Card, Button, Alert, Spinner, Badge, colors } from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t, Lang } from '../../../lib/i18n';
import { CodeExamplesPanel, buildForwarderSnippets } from '../../../lib/code-examples';
import { AccountStatusStrip } from '../../../lib/account-status';

const API_BASE = process.env.NEXT_PUBLIC_PUBLIC_API_BASE || 'https://panel.civonex.ir/api';

type TestState = { loading: true } | { loading: false; ok: boolean; status?: number; timeMs?: number; msg?: string };

function TestBadge({ state, lang }: { state: TestState | undefined; lang: Lang }) {
  if (!state || state.loading) return null;
  const good = state.ok;
  const bg = good ? '#dcfce7' : '#fee2e2';
  const fg = good ? '#166534' : '#991b1b';
  const border = good ? '#86efac' : '#fca5a5';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: bg, color: fg, border: `1px solid ${border}`, direction: 'ltr',
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    }}>
      {good ? '✓' : '✗'}
      {state.status && <span>{state.status}</span>}
      {state.timeMs !== undefined && <span style={{ opacity: 0.8 }}>· {state.timeMs}ms</span>}
      {state.msg && <span title={state.msg}>· {state.msg.slice(0, 24)}</span>}
    </span>
  );
}

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

export default function ForwardersPage() {
  const { lang } = useLang();
  const [userSlug, setUserSlug] = useState('');
  const [fwds, setFwds] = useState<Forwarder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    label: '',
    targetUrl: '',
    forwardAuthHeader: true,
    preservePath: true,
    preserveQuery: true,
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api.forwarders.list();
      setUserSlug(data.userSlug);
      setFwds(data.forwarders);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load forwarders');
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!form.label.trim() || !form.targetUrl.trim()) return;
    setCreating(true);
    setError('');
    try {
      await api.forwarders.create({
        label: form.label.trim(),
        targetUrl: form.targetUrl.trim(),
        forwardAuthHeader: form.forwardAuthHeader,
        preservePath: form.preservePath,
        preserveQuery: form.preserveQuery,
      });
      setForm({ label: '', targetUrl: '', forwardAuthHeader: true, preservePath: true, preserveQuery: true });
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create forwarder');
    } finally {
      setCreating(false);
    }
  }

  async function toggle(fwd: Forwarder) {
    try {
      await api.forwarders.update(fwd.id, { enabled: !fwd.enabled });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  async function remove(fwd: Forwarder) {
    if (!confirm(t(lang, 'fwd.confirm_delete'))) return;
    try {
      await api.forwarders.remove(fwd.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  // Per-forwarder test state: keyed by forwarder id
  const [testResults, setTestResults] = useState<Record<string, TestState>>({});

  async function testForwarder(fwd: Forwarder, url: string) {
    setTestResults((s) => ({ ...s, [fwd.id]: { loading: true } }));
    const started = performance.now();
    try {
      const r = await fetch(url, { method: 'GET' });
      const timeMs = Math.round(performance.now() - started);
      setTestResults((s) => ({
        ...s,
        [fwd.id]: { loading: false, ok: r.ok, status: r.status, timeMs },
      }));
      // Refresh the callCount after a successful test
      if (r.ok) setTimeout(load, 500);
    } catch (e) {
      const timeMs = Math.round(performance.now() - started);
      setTestResults((s) => ({
        ...s,
        [fwd.id]: { loading: false, ok: false, timeMs, msg: e instanceof Error ? e.message : 'network error' },
      }));
    }
  }

  useEffect(() => { load(); }, []);

  // Pick which forwarder to feature in the examples panel — the first enabled one if any,
  // else the first one at all
  const [exampleFwdId, setExampleFwdId] = useState<string | null>(null);
  const featuredForwarder = useMemo(() => {
    if (!fwds.length) return null;
    if (exampleFwdId) return fwds.find((f) => f.id === exampleFwdId) ?? fwds[0];
    return fwds.find((f) => f.enabled) ?? fwds[0];
  }, [fwds, exampleFwdId]);
  const featuredUrl = featuredForwarder && userSlug
    ? `${API_BASE}/f/${userSlug}/${featuredForwarder.slug}`
    : null;

  return (
    <div>
      <AccountStatusStrip lang={lang} />
      <PageHeader
        title={t(lang, 'fwd.title')}
        action={
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? t(lang, 'cancel') : `+ ${t(lang, 'fwd.new')}`}
          </Button>
        }
      />

      <Card style={{ padding: '16px 22px', marginBottom: 20, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#0c4a6e', lineHeight: 1.6 }}>
          {t(lang, 'fwd.intro')}
        </p>
      </Card>

      {showCreate && (
        <Card style={{ padding: '22px 26px', marginBottom: 22 }}>
          <p style={{ margin: '0 0 16px', fontWeight: 600, fontSize: 15, color: colors.navy }}>
            {t(lang, 'fwd.new')}
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: colors.textMuted }}>
              {t(lang, 'fwd.form.label')}
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder={t(lang, 'fwd.form.label_ph')}
              style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 14 }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: colors.textMuted }}>
              {t(lang, 'fwd.form.target')}
            </label>
            <input
              type="url"
              value={form.targetUrl}
              onChange={(e) => setForm((f) => ({ ...f, targetUrl: e.target.value }))}
              placeholder={t(lang, 'fwd.form.target_ph')}
              style={{ width: '100%', padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 14, direction: 'ltr' }}
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: colors.textMuted }}>
              {t(lang, 'fwd.form.target_help')}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'preservePath' as const, label: t(lang, 'fwd.form.preserve_path') },
              { key: 'preserveQuery' as const, label: t(lang, 'fwd.form.preserve_query') },
              { key: 'forwardAuthHeader' as const, label: t(lang, 'fwd.form.forward_auth') },
            ].map((opt) => (
              <label key={opt.key} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13, color: colors.text }}>
                <input
                  type="checkbox"
                  checked={form[opt.key]}
                  onChange={(e) => setForm((f) => ({ ...f, [opt.key]: e.target.checked }))}
                />
                {opt.label}
              </label>
            ))}
          </div>

          <Button onClick={create} disabled={creating || !form.label.trim() || !form.targetUrl.trim()}>
            {creating ? '...' : t(lang, 'fwd.form.create')}
          </Button>
        </Card>
      )}

      {error && <Alert message={error} />}

      {loading ? (
        <Spinner />
      ) : fwds.length === 0 ? (
        <Card style={{ padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>{t(lang, 'fwd.empty')}</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fwds.map((fwd) => {
            const publicUrl = `${API_BASE}/f/${userSlug}/${fwd.slug}`;
            return (
              <Card key={fwd.id} style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, color: colors.navy, marginBottom: 6 }}>
                      {fwd.label}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge label={fwd.enabled ? 'active' : 'inactive'} />
                      <span style={{ fontSize: 12, color: colors.textMuted }}>
                        {fwd.callCount} {t(lang, 'fwd.calls')}
                      </span>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>
                        {t(lang, 'fwd.last_used')}: {fwd.lastUsedAt
                          ? new Date(fwd.lastUsedAt).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US')
                          : t(lang, 'fwd.never_used')}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    <TestBadge state={testResults[fwd.id]} lang={lang} />
                    <Button
                      variant="secondary"
                      onClick={() => testForwarder(fwd, publicUrl)}
                    >
                      {testResults[fwd.id]?.loading ? t(lang, 'fwd.testing') : `▶ ${t(lang, 'fwd.test')}`}
                    </Button>
                    <Button variant="secondary" onClick={() => toggle(fwd)}>
                      {fwd.enabled ? t(lang, 'fwd.disable') : t(lang, 'fwd.enable')}
                    </Button>
                    <Button variant="danger" onClick={() => remove(fwd)}>
                      {t(lang, 'fwd.delete')}
                    </Button>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>
                    {t(lang, 'fwd.your_url')}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <code style={{
                      flex: 1, background: '#f8fafc', border: `1px solid ${colors.border}`, borderRadius: 6,
                      padding: '8px 12px', fontSize: 12, wordBreak: 'break-all', direction: 'ltr',
                    }}>{publicUrl}</code>
                    <CopyButton text={publicUrl} label={lang === 'fa' ? 'کپی' : 'Copy'} />
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
                    {t(lang, 'fwd.your_url_help')}
                  </p>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>
                    → {fwd.targetUrl}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Usage examples — visible even when no forwarder exists, but URL is filled in
          when a forwarder is available. */}
      <div style={{ marginTop: 28 }}>
        {featuredUrl ? (
          <>
            {fwds.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>
                  {t(lang, 'examples.select_forwarder')}:
                </label>
                <select
                  value={featuredForwarder?.id ?? ''}
                  onChange={(e) => setExampleFwdId(e.target.value)}
                  style={{ padding: '4px 8px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13 }}
                >
                  {fwds.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}
            <CodeExamplesPanel
              lang={lang}
              intro={t(lang, 'examples.intro.forwarder')}
              snippets={buildForwarderSnippets(featuredUrl)}
            />
          </>
        ) : (
          <Card style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
              {t(lang, 'examples.no_forwarder')}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
