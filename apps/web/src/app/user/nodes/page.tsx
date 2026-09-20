'use client';

import { useEffect, useState } from 'react';
import { api, Node } from '../../../lib/api';
import { PageHeader, Card, Table, Tr, Td, Button, Input, Alert, Spinner, Modal, colors } from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';

const ENDPOINT = 'https://panel.civonex.ir';
const AGENT_LINUX_URL = 'https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent-linux';
const AGENT_WINDOWS_URL = 'https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent.exe';
const DOCS_URL = 'https://github.com/mrAboalfazl/ProxyNet#readme';

function statusColor(status: string) {
  if (status === 'healthy') return { bg: '#dcfce7', color: '#166534' };
  if (status === 'active') return { bg: '#dbeafe', color: '#1d4ed8' };
  if (status === 'degraded') return { bg: '#fef3c7', color: '#92400e' };
  if (status === 'pending') return { bg: '#f3f4f6', color: '#6b7280' };
  if (status === 'disabled') return { bg: '#fee2e2', color: '#991b1b' };
  return { bg: '#f3f4f6', color: '#374151' };
}

export default function UserNodesPage() {
  const { lang, isRTL } = useLang();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ nodeId: string; token: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setNodes(await api.myNodes.list());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function addNode() {
    if (!label || !countryCode) return;
    setCreating(true);
    try {
      const res = await api.myNodes.create({ label, countryCode: countryCode.toUpperCase() });
      setNewToken({ nodeId: res.node.id, token: res.token, expiresAt: res.expiresAt });
      setShowAdd(false);
      setLabel('');
      setCountryCode('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add node');
    } finally {
      setCreating(false);
    }
  }

  function enrollCmd(token: string) {
    return `./agent -enroll -endpoint ${ENDPOINT} -token ${token}`;
  }

  function copyCmd(token: string) {
    navigator.clipboard.writeText(enrollCmd(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => { load(); }, []);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t(lang, 'nodes.title')}
        action={<Button onClick={() => setShowAdd(true)}>+ {t(lang, 'nodes.add')}</Button>}
      />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {newToken && (
        <Card style={{ marginBottom: 20, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 600, color: '#166534', fontSize: 15 }}>
              {t(lang, 'nodes.token_title')}
            </div>
            <div style={{ fontSize: 13, color: '#374151' }}>{t(lang, 'nodes.token_hint')}</div>
            <div style={{
              background: '#1e293b', color: '#e2e8f0', borderRadius: 8,
              padding: '12px 16px', fontFamily: 'monospace', fontSize: 12,
              wordBreak: 'break-all',
            }}>
              {enrollCmd(newToken.token)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => copyCmd(newToken.token)} size="sm">
                {copied ? t(lang, 'nodes.copied') : t(lang, 'nodes.copy_cmd')}
              </Button>
              <Button onClick={() => setNewToken(null)} variant="ghost" size="sm">
                {t(lang, 'nodes.dismiss')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* How-to banner */}
      <Card style={{ marginBottom: 20, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: colors.text }}>
            {lang === 'fa' ? 'چطور نود اضافه کنم؟' : 'How to add a node?'}
          </div>
          <ol style={{ margin: 0, paddingInlineStart: 20, fontSize: 13, color: colors.textMuted, lineHeight: 1.8 }}>
            {lang === 'fa' ? <>
              <li>روی <strong>+ افزودن نود</strong> کلیک کنید، برچسب و کد کشور سرورتان را وارد کنید</li>
              <li>دستور ثبت‌نام را کپی کنید</li>
              <li>ایجنت را روی سرور لینوکسی خود دانلود کنید و دستور را اجرا کنید</li>
              <li>منتظر تایید ادمین باشید — پس از تایید نود فعال می‌شود</li>
            </> : <>
              <li>Click <strong>+ Add Node</strong>, enter a label and your server&apos;s country code</li>
              <li>Copy the enrollment command that appears</li>
              <li>Download the agent on your Linux server and run the command</li>
              <li>Wait for admin approval — your node goes live once approved</li>
            </>}
          </ol>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: colors.textMuted, fontWeight: 600 }}>
              {lang === 'fa' ? 'دانلود ایجنت:' : 'Download agent:'}
            </span>
            <a href={AGENT_LINUX_URL} target="_blank" rel="noreferrer" style={{
              fontSize: 12, fontWeight: 600, color: '#1d4ed8',
              background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 6, padding: '4px 12px', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              🐧 Linux (agent-linux)
            </a>
            <a href={AGENT_WINDOWS_URL} target="_blank" rel="noreferrer" style={{
              fontSize: 12, fontWeight: 600, color: '#6d28d9',
              background: '#f5f3ff', border: '1px solid #ddd6fe',
              borderRadius: 6, padding: '4px 12px', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              🪟 Windows (agent.exe)
            </a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer" style={{
              fontSize: 12, color: colors.textMuted, textDecoration: 'underline',
            }}>
              {lang === 'fa' ? 'راهنمای کامل' : 'Full guide'}
            </a>
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : nodes.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🖥️</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 6 }}>
              {t(lang, 'nodes.empty')}
            </div>
            <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 20 }}>
              {t(lang, 'nodes.empty_msg')}
            </div>
            <Button onClick={() => setShowAdd(true)}>+ {t(lang, 'nodes.add')}</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Table headers={[t(lang, 'nodes.label'), 'Country', 'Status', 'Agent']}>
            {nodes.map((node) => {
              const sc = statusColor(node.status);
              const enrolled = !!node.nodeSecretHash;
              return (
                <Tr key={node.id}>
                  <Td style={{ fontWeight: 600 }}>{node.label}</Td>
                  <Td>
                    <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{node.countryCode}</span>
                  </Td>
                  <Td>
                    <span style={{
                      display: 'inline-block', fontSize: 12, fontWeight: 600,
                      borderRadius: 4, padding: '2px 10px',
                      background: sc.bg, color: sc.color,
                    }}>
                      {t(lang, `nodes.status.${node.status}`) || node.status}
                    </span>
                  </Td>
                  <Td>
                    <span style={{
                      fontSize: 12, fontWeight: 500,
                      color: enrolled ? '#166534' : '#6b7280',
                    }}>
                      {enrolled ? `✓ ${t(lang, 'nodes.enrolled')}` : t(lang, 'nodes.not_enrolled')}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </Card>
      )}

      {showAdd && (
        <Modal title={t(lang, 'nodes.add')} onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label={t(lang, 'nodes.label')}
              value={label}
              onChange={setLabel}
              placeholder={t(lang, 'nodes.label.placeholder')}
              required
            />
            <Input
              label={t(lang, 'nodes.country')}
              value={countryCode}
              onChange={setCountryCode}
              placeholder={t(lang, 'nodes.country.placeholder')}
              required
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button onClick={() => setShowAdd(false)} variant="secondary">
                {t(lang, 'cancel')}
              </Button>
              <Button onClick={addNode} disabled={creating || !label || !countryCode}>
                {creating ? t(lang, 'nodes.creating') : t(lang, 'nodes.create')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
