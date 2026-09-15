'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, Socks5Endpoint } from '../../../lib/api';
import { PageHeader, Card, Button, Alert, Spinner, Badge, colors } from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import { CodeExamplesPanel, buildGatewaySnippets } from '../../../lib/code-examples';
import { AccountStatusStrip } from '../../../lib/account-status';
import { Server, ShieldAlert } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_PUBLIC_API_BASE || 'https://panel.civonex.ir/api';

interface Credential {
  id: string;
  uuid: string;
  label: string | null;
  enabled: boolean;
  createdAt: string;
}

interface NewlyCreated {
  id: string;
  uuid: string;
  secret: string;
  label: string | null;
}

function buildBasicAuth(uuid: string, secret: string): string {
  if (typeof window === 'undefined') return '';
  return btoa(`${uuid}:${secret}`);
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        minHeight: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
        border: `1px solid ${copied ? '#86efac' : '#cbd5e1'}`, background: copied ? '#dcfce7' : '#fff',
        color: copied ? '#166534' : '#334155', whiteSpace: 'nowrap', transition: 'all 120ms ease',
      }}
    >
      {copied ? '✓' : label}
    </button>
  );
}

function SecretBanner({ cred, lang, endpoints, requiresActivePlan, onDismiss }: { cred: NewlyCreated; lang: string; endpoints: Socks5Endpoint[]; requiresActivePlan: boolean; onDismiss: () => void }) {
  const basicAuth = buildBasicAuth(cred.uuid, cred.secret);

  const curlExample = `curl -X POST ${API_BASE}/gateway/fetch \\
  -H "Authorization: Basic ${basicAuth}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/api/data"}'`;

  const pythonExample = `import requests, base64

creds = base64.b64encode(f"${cred.uuid}:${cred.secret}".encode()).decode()
r = requests.post(
    "${API_BASE}/gateway/fetch",
    headers={"Authorization": f"Basic {creds}"},
    json={"url": "https://example.com/api/data"}
)
print(r.json()["body"])`;

  return (
    <div style={{
      background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10,
      padding: '20px 24px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#92400e' }}>
          {lang === 'fa'
            ? '⚠️ اعتبارنامه ایجاد شد — این اطلاعات را الان ذخیره کنید'
            : '⚠️ Credential created — save this information now'}
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 18 }}>✕</button>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#78350f' }}>
        {lang === 'fa'
          ? 'سیکرت پس از بستن این پنجره دیگر نمایش داده نمی‌شود.'
          : 'The secret is shown only once. Once you dismiss this, it cannot be retrieved.'}
      </p>

      {/* UUID + Secret */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'UUID', value: cred.uuid },
          { label: 'Secret', value: cred.secret },
        ].map(({ label: lbl, value }) => (
          <div key={lbl}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4, textTransform: 'uppercase' }}>{lbl}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <code style={{
                flex: 1, background: '#fff', border: '1px solid #fcd34d', borderRadius: 6,
                padding: '6px 10px', fontSize: 12, wordBreak: 'break-all', direction: 'ltr',
              }}>{value}</code>
              <CopyButton text={value} label="Copy" />
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #fcd34d', paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: '#78350f', marginBottom: 8 }}><Server size={16} /> SOCKS5</div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
          {lang === 'fa'
            ? 'نام کاربری UUID و رمز عبور Secret است. SOCKS5 به‌صورت رمزنگاری‌شده اجرا نمی‌شود؛ فقط از شبکه مورداعتماد استفاده کنید.'
            : 'Use the UUID as the username and Secret as the password. SOCKS5 does not encrypt authentication; use it only from a trusted network.'}
        </p>
        {requiresActivePlan ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#9a3412' }}>
            <ShieldAlert size={16} style={{ flex: '0 0 auto', marginTop: 1 }} />
            <span>{lang === 'fa' ? 'برای استفاده از SOCKS5 ابتدا یک اشتراک فعال تهیه یا فعال کنید. نود آلمان آماده است، اما بدون اشتراک اتصال مجاز نیست.' : 'Activate a subscription before using SOCKS5. The German node is ready, but connections are blocked without an active subscription.'}</span>
          </div>
        ) : endpoints.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>
            {lang === 'fa' ? 'هنوز هیچ نود SOCKS5 آماده‌ای وجود ندارد.' : 'No SOCKS5-enabled node is ready yet.'}
          </p>
        ) : endpoints.map((endpoint) => {
          const uri = `socks5://${encodeURIComponent(cred.uuid)}:${encodeURIComponent(cred.secret)}@${endpoint.host}:${endpoint.port}`;
          return (
            <div key={endpoint.nodeId} style={{ background: '#fff', border: '1px solid #fcd34d', borderRadius: 6, padding: '10px 12px', marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#78350f', marginBottom: 6 }}>{endpoint.countryName} · {endpoint.label}</div>
              <code style={{ display: 'block', fontSize: 11, direction: 'ltr', overflowWrap: 'anywhere', color: colors.text }}>{uri}</code>
              <div style={{ marginTop: 7 }}><CopyButton text={uri} label="Copy SOCKS5 URL" /></div>
            </div>
          );
        })}
      </div>

      {/* API usage */}
      <div style={{ borderTop: '1px solid #fcd34d', paddingTop: 16, marginTop: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#78350f', marginBottom: 10 }}>
          {lang === 'fa' ? 'استفاده در سرور / کد (HTTP Fetch Gateway)' : 'Server-side / programmatic use (HTTP Fetch Gateway)'}
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
          {lang === 'fa'
            ? `POST ${API_BASE}/gateway/fetch با Basic Auth (UUID:Secret) — هر درخواست HTTP از طریق سرورهای ما ارسال می‌شود.`
            : `POST ${API_BASE}/gateway/fetch with Basic Auth (UUID:Secret) — any HTTP request is routed through our servers.`}
        </p>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#78350f', marginBottom: 4 }}>curl</div>
          <div style={{ position: 'relative' }}>
            <pre style={{
              background: '#1e293b', color: '#e2e8f0', borderRadius: 6, margin: 0,
              padding: '10px 14px', fontSize: 11, overflowX: 'auto', direction: 'ltr',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>{curlExample}</pre>
            <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6 }}>
              <CopyButton text={curlExample} label="Copy" />
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#78350f', marginBottom: 4 }}>Python</div>
          <div style={{ position: 'relative' }}>
            <pre style={{
              background: '#1e293b', color: '#e2e8f0', borderRadius: 6, margin: 0,
              padding: '10px 14px', fontSize: 11, overflowX: 'auto', direction: 'ltr',
              whiteSpace: 'pre-wrap',
            }}>{pythonExample}</pre>
            <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6 }}>
              <CopyButton text={pythonExample} label="Copy" />
            </div>
          </div>
        </div>

        <p style={{ margin: '14px 0 0', fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
          {lang === 'fa'
            ? '💡 برای روش ساده‌تر (بدون تنظیم Auth در هر درخواست)، به بخش «فوروارد آدرس‌ها» بروید.'
            : '💡 For an easier approach (no auth setup per request), see the Forwarders page.'}
          {' '}
          <Link href="/user/forwarders" style={{ color: colors.primary, fontWeight: 600 }}>
            {lang === 'fa' ? 'فوروارد آدرس‌ها ←' : 'Go to Forwarders →'}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function UserCredentialsPage() {
  const { lang } = useLang();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<NewlyCreated | null>(null);
  const [socksEndpoints, setSocksEndpoints] = useState<Socks5Endpoint[]>([]);
  const [socksRequiresPlan, setSocksRequiresPlan] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [data, socks] = await Promise.all([api.myCredentials(), api.socks5.endpoints()]);
      setCreds(data);
      setSocksEndpoints(socks.endpoints);
      setSocksRequiresPlan(socks.requiresActivePlan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!newLabel.trim()) return;
    setCreating(true);
    setError('');
    try {
      const [cred, socks] = await Promise.all([api.createCredential(newLabel.trim()), api.socks5.endpoints()]);
      setSocksEndpoints(socks.endpoints);
      setSocksRequiresPlan(socks.requiresActivePlan);
      setNewlyCreated({
        id: cred.id,
        uuid: cred.uuid,
        secret: cred.secret || '',
        label: cred.label,
      });
      setNewLabel('');
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create credential');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(t(lang, 'cred.revoke') + '?')) return;
    try {
      await api.revokeCredential(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke credential');
    }
  }

  useEffect(() => { load(); }, []);

  const [exampleCredUuid, setExampleCredUuid] = useState<string | null>(null);
  const featuredCred = useMemo(() => {
    if (!creds.length) return null;
    if (exampleCredUuid) return creds.find((c) => c.uuid === exampleCredUuid) ?? creds[0];
    return creds.find((c) => c.enabled) ?? creds[0];
  }, [creds, exampleCredUuid]);

  return (
    <div>
      <AccountStatusStrip lang={lang} />
      <PageHeader
        title={t(lang, 'cred.title')}
        action={
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? t(lang, 'cancel') : `+ ${t(lang, 'cred.new')}`}
          </Button>
        }
      />

      {showCreate && (
        <Card style={{ padding: '20px 24px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 15, color: colors.navy }}>{t(lang, 'cred.new')}</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: colors.textMuted }}>
                {t(lang, 'cred.label')}
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t(lang, 'cred.label.placeholder')}
                style={{
                  width: '100%', padding: '8px 12px', border: `1px solid ${colors.border}`,
                  borderRadius: 6, fontSize: 14,
                }}
              />
            </div>
            <Button onClick={create} disabled={creating || !newLabel.trim()}>
              {creating ? '...' : t(lang, 'cred.create')}
            </Button>
          </div>
        </Card>
      )}

      {newlyCreated && (
        <SecretBanner cred={newlyCreated} lang={lang} endpoints={socksEndpoints} requiresActivePlan={socksRequiresPlan} onDismiss={() => setNewlyCreated(null)} />
      )}

      {error && <Alert message={error} />}

      {!loading && (
        <Card style={{ padding: '18px 20px', marginBottom: 16, border: `1px solid ${socksRequiresPlan ? '#fed7aa' : '#bfdbfe'}`, background: socksRequiresPlan ? '#fff7ed' : '#f8fbff' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {socksRequiresPlan ? <ShieldAlert size={20} color="#c2410c" /> : <Server size={20} color={colors.primary} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 750, color: colors.navy, marginBottom: 5 }}>SOCKS5</div>
              {socksRequiresPlan ? (
                <div style={{ fontSize: 13, lineHeight: 1.7, color: '#9a3412' }}>
                  {lang === 'fa' ? 'نود آلمان آماده است، اما این حساب اشتراک فعال ندارد. پس از فعال‌سازی اشتراک، مشخصات اتصال اینجا نمایش داده می‌شود.' : 'The German node is ready, but this account has no active subscription. Connection details appear here after a subscription is activated.'}
                </div>
              ) : socksEndpoints.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {socksEndpoints.map((endpoint) => <div key={endpoint.nodeId} style={{ fontSize: 13, color: colors.text }}><strong>{endpoint.countryName} · {endpoint.label}</strong><code style={{ marginInlineStart: 8, direction: 'ltr' }}>{endpoint.host}:{endpoint.port}</code></div>)}
                  <div style={{ fontSize: 12, color: colors.textMuted }}>{lang === 'fa' ? 'نام کاربری UUID و رمز عبور Secret اعتبارنامه شماست.' : 'Use your credential UUID as the username and its Secret as the password.'}</div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: colors.textMuted }}>{lang === 'fa' ? 'در حال حاضر هیچ نود SOCKS5 آماده‌ای وجود ندارد.' : 'No SOCKS5 node is currently ready.'}</div>
              )}
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : creds.length === 0 ? (
        <Card style={{ padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>{t(lang, 'cred.empty')}</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {creds.map((cred) => (
            <Card key={cred.id} style={{ padding: '18px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: colors.navy, marginBottom: 4 }}>
                    {cred.label || '(no label)'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge label={cred.enabled ? 'enabled' : 'disabled'} />
                    <span style={{ fontSize: 12, color: colors.textMuted }}>
                      {t(lang, 'cred.created')} {new Date(cred.createdAt).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US')}
                    </span>
                  </div>
                </div>
                <Button variant="danger" onClick={() => revoke(cred.id)}>
                  {t(lang, 'cred.revoke')}
                </Button>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>UUID</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <code style={{
                    flex: 1, background: '#f8fafc', border: `1px solid ${colors.border}`, borderRadius: 6,
                    padding: '6px 10px', fontSize: 12, wordBreak: 'break-all', direction: 'ltr',
                  }}>{cred.uuid}</code>
                  <CopyButton text={cred.uuid} label={t(lang, 'cred.copy')} />
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.textMuted, lineHeight: 1.6 }}>
                  {lang === 'fa'
                    ? 'برای استفاده از HTTP Gateway به UUID و Secret نیاز دارید. Secret فقط یک بار (هنگام ساخت) نمایش داده می‌شود.'
                    : 'Use with HTTP Gateway needs UUID + Secret. The Secret is shown once at creation.'}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Usage examples for HTTP Gateway (UUID + Secret + Basic auth) */}
      <div style={{ marginTop: 28 }}>
        {featuredCred ? (
          <>
            {creds.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>
                  {t(lang, 'examples.select_credential')}:
                </label>
                <select
                  value={featuredCred.uuid}
                  onChange={(e) => setExampleCredUuid(e.target.value)}
                  style={{ padding: '4px 8px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 13 }}
                >
                  {creds.map((c) => (
                    <option key={c.id} value={c.uuid}>{c.label || c.uuid.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
            )}
            <CodeExamplesPanel
              lang={lang}
              intro={t(lang, 'examples.intro.gateway')}
              snippets={buildGatewaySnippets(API_BASE, featuredCred.uuid)}
            />
          </>
        ) : (
          <Card style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
              {t(lang, 'examples.no_credential')}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
