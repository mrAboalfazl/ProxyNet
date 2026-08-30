'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { PageHeader, Card, Button, Alert, Spinner, Badge, colors } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';

const SERVER_HOST = process.env.NEXT_PUBLIC_SERVER_HOST || '108.61.99.207';
const SERVER_PORT = process.env.NEXT_PUBLIC_SERVER_PORT || '443';
const REALITY_PBK = process.env.NEXT_PUBLIC_REALITY_PUBLIC_KEY || 'nln57Zj8Eb4Uxi_ZTCJKg_PMFtkreeRJz-RbFrCBi30';
const REALITY_SID = process.env.NEXT_PUBLIC_REALITY_SHORT_ID || '3c421f5e';
const REALITY_SNI = process.env.NEXT_PUBLIC_REALITY_SNI || 'www.microsoft.com';

interface Credential {
  id: string;
  uuid: string;
  label: string | null;
  enabled: boolean;
  createdAt: string;
}

function buildVlessUri(cred: Credential): string {
  const params = new URLSearchParams({
    encryption: 'none',
    security: 'reality',
    sni: REALITY_SNI,
    fp: 'chrome',
    pbk: REALITY_PBK,
    sid: REALITY_SID,
    type: 'tcp',
    flow: 'xtls-rprx-vision',
  });
  return `vless://${cred.uuid}@${SERVER_HOST}:${SERVER_PORT}?${params.toString()}#${encodeURIComponent(cred.label || 'ProxyNet')}`;
}

export default function UserCredentialsPage() {
  const { lang } = useLang();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.myCredentials();
      setCreds(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    setCreating(true);
    try {
      await api.createCredential(newLabel || undefined);
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

  function copyUri(cred: Credential) {
    navigator.clipboard.writeText(buildVlessUri(cred));
    setCopied(cred.id);
    setTimeout(() => setCopied(null), 2000);
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
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
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                {t(lang, 'cred.label.placeholder')}
              </label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t(lang, 'cred.label.placeholder')}
                style={{
                  width: '100%', padding: '8px 12px', border: `1px solid ${colors.border}`,
                  borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>
            <Button onClick={create} disabled={creating}>
              {creating ? t(lang, 'loading') : t(lang, 'cred.create')}
            </Button>
          </div>
        </Card>
      )}

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {loading ? <Spinner /> : creds.length === 0 ? (
        <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: colors.navy }}>{t(lang, 'cred.empty')}</p>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textMuted }}>
            {t(lang, 'cred.empty_msg')}
          </p>
          <Button onClick={() => setShowCreate(true)}>+ {t(lang, 'cred.new')}</Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {creds.map((cred) => {
            const uri = buildVlessUri(cred);
            return (
              <Card key={cred.id} style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.navy }}>
                        {cred.label || 'Unnamed credential'}
                      </p>
                      <Badge label={cred.enabled ? t(lang, 'cred.status.active') : t(lang, 'cred.status.revoked')} />
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>
                      {t(lang, 'cred.created')} {new Date(cred.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button onClick={() => revoke(cred.id)} variant="danger" size="sm">{t(lang, 'cred.revoke')}</Button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>UUID</p>
                  <code style={{
                    display: 'block', padding: '8px 12px',
                    backgroundColor: '#f8fafc', border: `1px solid ${colors.border}`,
                    borderRadius: 6, fontSize: 13, wordBreak: 'break-all', color: '#1e293b',
                    direction: 'ltr', textAlign: 'left',
                  }}>
                    {cred.uuid}
                  </code>
                </div>

                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>VLESS URI</p>
                  <div style={{ position: 'relative' }}>
                    <code style={{
                      display: 'block', padding: '10px 48px 10px 12px',
                      backgroundColor: '#f8fafc', border: `1px solid ${colors.border}`,
                      borderRadius: 6, fontSize: 12, wordBreak: 'break-all', color: '#1e293b',
                      lineHeight: 1.6, direction: 'ltr', textAlign: 'left',
                    }}>
                      {uri}
                    </code>
                    <Button
                      onClick={() => copyUri(cred)}
                      variant="ghost"
                      size="sm"
                      style={{
                        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 12, padding: '4px 10px',
                      }}
                    >
                      {copied === cred.id ? `✓ ${t(lang, 'cred.copied')}` : t(lang, 'cred.copy')}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
