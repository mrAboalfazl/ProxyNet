'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, Forwarder } from '../../../lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Button,
  Alert,
  Spinner,
  Badge,
  Input,
  Modal,
  Checkbox,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t, Lang } from '../../../lib/i18n';
import { CodeExamplesPanel, buildForwarderSnippets } from '../../../lib/code-examples';
import { AccountStatusStrip } from '../../../lib/account-status';
import { toast } from 'sonner';
import {
  Network,
  Plus,
  Play,
  Copy,
  Check,
  Power,
  Trash2,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_PUBLIC_API_BASE || 'http://localhost:3000/api';

type TestState =
  | { loading: true }
  | { loading: false; ok: boolean; status?: number; timeMs?: number; msg?: string };

function TestBadge({ state, lang }: { state: TestState | undefined; lang: Lang }) {
  if (!state || state.loading) return null;
  const good = state.ok;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border ${
        good
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
          : 'bg-destructive/10 text-destructive border-destructive/30'
      }`}
      dir="ltr"
    >
      {good ? '✓' : '✗'}
      {state.status && <span>{state.status}</span>}
      {state.timeMs !== undefined && <span className="opacity-80">· {state.timeMs}ms</span>}
      {state.msg && <span title={state.msg}>· {state.msg.slice(0, 20)}</span>}
    </span>
  );
}

export default function ForwardersPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);
  const [userSlug, setUserSlug] = useState('');
  const [fwds, setFwds] = useState<Forwarder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
      setForm({
        label: '',
        targetUrl: '',
        forwardAuthHeader: true,
        preservePath: true,
        preserveQuery: true,
      });
      setShowCreate(false);
      toast.success(tx('Forwarder created successfully', 'مسیر جدید با موفقیت ایجاد شد'));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create forwarder';
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function toggle(fwd: Forwarder) {
    try {
      await api.forwarders.update(fwd.id, { enabled: !fwd.enabled });
      toast.success(
        !fwd.enabled
          ? tx('Forwarder activated', 'مسیر فعال شد')
          : tx('Forwarder deactivated', 'مسیر غیرفعال شد')
      );
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update';
      setError(msg);
      toast.error(msg);
    }
  }

  async function remove(fwd: Forwarder) {
    if (!confirm(t(lang, 'fwd.confirm_delete'))) return;
    try {
      await api.forwarders.remove(fwd.id);
      toast.success(tx('Forwarder deleted', 'مسیر حذف شد'));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete';
      setError(msg);
      toast.error(msg);
    }
  }

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
      if (r.ok) {
        toast.success(tx(`Forwarder OK (${timeMs}ms)`, `تست موفق بود (${timeMs} میلی‌ثانیه)`));
        setTimeout(load, 500);
      } else {
        toast.error(tx(`HTTP error: ${r.status}`, `خطای پاسخ سرور: ${r.status}`));
      }
    } catch (e) {
      const timeMs = Math.round(performance.now() - started);
      const errMsg = e instanceof Error ? e.message : 'network error';
      setTestResults((s) => ({
        ...s,
        [fwd.id]: { loading: false, ok: false, timeMs, msg: errMsg },
      }));
      toast.error(tx(`Connection failed: ${errMsg}`, `عدم برقراری ارتباط: ${errMsg}`));
    }
  }

  function copyUrl(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(tx('Gateway URL copied to clipboard', 'آدرس درگاه در کلیپ‌بورد کپی شد'));
    setTimeout(() => setCopiedId(null), 2000);
  }

  useEffect(() => {
    load();
  }, []);

  const [exampleFwdId, setExampleFwdId] = useState<string | null>(null);
  const featuredForwarder = useMemo(() => {
    if (!fwds.length) return null;
    if (exampleFwdId) return fwds.find((f) => f.id === exampleFwdId) ?? fwds[0];
    return fwds.find((f) => f.enabled) ?? fwds[0];
  }, [fwds, exampleFwdId]);
  const featuredUrl =
    featuredForwarder && userSlug ? `${API_BASE}/f/${userSlug}/${featuredForwarder.slug}` : null;

  return (
    <div className="space-y-6">
      <AccountStatusStrip lang={lang} />

      <PageHeader
        title={t(lang, 'fwd.title')}
        description={tx(
          'Create secure webhook endpoints that relay traffic through proxy exits.',
          'ایجاد درگاه‌های اختصاصی امن جهت هدایت ترافیک به سرورهای مقصد از طریق شبکه پروکسی.'
        )}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            <span>{t(lang, 'fwd.new')}</span>
          </Button>
        }
      />

      {error && <Alert message={error} type="error" />}

      {/* Info Callout */}
      <Card className="bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800">
        <CardContent className="p-4 flex items-center gap-3 text-sky-900 dark:text-sky-200 text-xs sm:text-sm">
          <Network className="h-5 w-5 text-sky-600 shrink-0" />
          <p>{t(lang, 'fwd.intro')}</p>
        </CardContent>
      </Card>

      {/* Create Modal Dialog */}
      {showCreate && (
        <Modal
          title={t(lang, 'fwd.new')}
          onClose={() => setShowCreate(false)}
          open={showCreate}
        >
          <div className="space-y-4 pt-2">
            <Input
              label={t(lang, 'fwd.form.label')}
              placeholder={t(lang, 'fwd.form.label_ph')}
              value={form.label}
              onChange={(v) => setForm((f) => ({ ...f, label: v }))}
              required
            />

            <Input
              label={t(lang, 'fwd.form.target')}
              placeholder={t(lang, 'fwd.form.target_ph')}
              value={form.targetUrl}
              onChange={(v) => setForm((f) => ({ ...f, targetUrl: v }))}
              hint={t(lang, 'fwd.form.target_help')}
              dir="ltr"
              required
            />

            <div className="space-y-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="preservePath"
                  checked={form.preservePath}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, preservePath: !!checked }))
                  }
                />
                <label
                  htmlFor="preservePath"
                  className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
                >
                  {t(lang, 'fwd.form.preserve_path')}
                </label>
              </div>

              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="preserveQuery"
                  checked={form.preserveQuery}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, preserveQuery: !!checked }))
                  }
                />
                <label
                  htmlFor="preserveQuery"
                  className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
                >
                  {t(lang, 'fwd.form.preserve_query')}
                </label>
              </div>

              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="forwardAuthHeader"
                  checked={form.forwardAuthHeader}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, forwardAuthHeader: !!checked }))
                  }
                />
                <label
                  htmlFor="forwardAuthHeader"
                  className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
                >
                  {t(lang, 'fwd.form.forward_auth')}
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                {t(lang, 'cancel')}
              </Button>
              <Button
                size="sm"
                onClick={create}
                disabled={creating || !form.label.trim() || !form.targetUrl.trim()}
              >
                {creating ? '...' : t(lang, 'fwd.form.create')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Forwarders List */}
      {loading ? (
        <Spinner />
      ) : fwds.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <p>{t(lang, 'fwd.empty')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {fwds.map((fwd) => {
            const publicUrl = `${API_BASE}/f/${userSlug}/${fwd.slug}`;
            const isCopied = copiedId === fwd.id;

            return (
              <Card key={fwd.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">{fwd.label}</span>
                        <Badge
                          label={fwd.enabled ? tx('Active', 'فعال') : tx('Inactive', 'غیرفعال')}
                          variant={fwd.enabled ? 'success' : 'secondary'}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {fwd.callCount} {t(lang, 'fwd.calls')}
                        </span>
                        <span>·</span>
                        <span>
                          {t(lang, 'fwd.last_used')}:{' '}
                          {fwd.lastUsedAt
                            ? new Date(fwd.lastUsedAt).toLocaleString(
                                lang === 'fa' ? 'fa-IR' : 'en-US'
                              )
                            : t(lang, 'fwd.never_used')}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <TestBadge state={testResults[fwd.id]} lang={lang} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testForwarder(fwd, publicUrl)}
                        disabled={testResults[fwd.id]?.loading}
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>
                          {testResults[fwd.id]?.loading
                            ? t(lang, 'fwd.testing')
                            : t(lang, 'fwd.test')}
                        </span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => toggle(fwd)}
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>
                          {fwd.enabled ? t(lang, 'fwd.disable') : t(lang, 'fwd.enable')}
                        </span>
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => remove(fwd)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t(lang, 'fwd.delete')}</span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  {/* Public URL Box */}
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t(lang, 'fwd.your_url')}
                    </span>
                    <div className="flex items-center gap-2">
                      <code
                        className="flex-1 p-2 rounded-md bg-muted/60 text-xs font-mono break-all border"
                        dir="ltr"
                      >
                        {publicUrl}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyUrl(publicUrl, fwd.id)}
                        className="shrink-0"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-600">{tx('Copied', 'کپی شد')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>{tx('Copy', 'کپی')}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Upstream Target */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wider">
                      {tx('Target:', 'مقصد:')}
                    </span>
                    <code className="font-mono text-foreground" dir="ltr">
                      {fwd.targetUrl}
                    </code>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Code Snippets Section */}
      <div className="pt-4">
        {featuredUrl ? (
          <div className="space-y-3">
            {fwds.length > 1 && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {t(lang, 'examples.select_forwarder')}:
                </span>
                <select
                  value={featuredForwarder?.id ?? ''}
                  onChange={(e) => setExampleFwdId(e.target.value)}
                  className="p-1.5 rounded-md border text-xs bg-background"
                >
                  {fwds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <CodeExamplesPanel
              lang={lang}
              intro={t(lang, 'examples.intro.forwarder')}
              snippets={buildForwarderSnippets(featuredUrl)}
            />
          </div>
        ) : (
          <Card className="p-6 text-center text-xs text-muted-foreground">
            <p>{t(lang, 'examples.no_forwarder')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
