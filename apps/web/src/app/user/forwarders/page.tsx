'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, Forwarder, getPublicApiBase } from '../../../lib/api';
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
  Pagination,
  usePagination,
  formatDateTime,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t, Lang } from '../../../lib/i18n';
import { CodeExamplesPanel, buildForwarderSnippets } from '../../../lib/code-examples';
import { toast } from 'sonner';
import {
  Network,
  Plus,
  Play,
  Copy,
  Check,
  Power,
  Trash2,
  Pencil,
  ChevronDown,
  Globe2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type TestState =
  | { loading: true }
  | { loading: false; ok: boolean; status?: number; timeMs?: number; msg?: string };

function TestBadge({ state, lang }: { state: TestState | undefined; lang: Lang }) {
  if (!state || state.loading) return null;
  const good = state.ok;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${
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
  const [apiBase, setApiBase] = useState<string>(() => getPublicApiBase());
  useEffect(() => {
    setApiBase(getPublicApiBase());
  }, []);
  const [userSlug, setUserSlug] = useState('');
  const [countryOptions, setCountryOptions] = useState<
    { code: string; name: string }[]
  >([]);
  const [countryRequiresPlan, setCountryRequiresPlan] = useState(false);
  const [fwds, setFwds] = useState<Forwarder[]>([]);
  const pagination = usePagination(fwds, 5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: '',
    targetUrl: '',
    countryCode: '',
    forwardAuthHeader: true,
    preservePath: true,
    preserveQuery: true,
  });

  const [editingFwd, setEditingFwd] = useState<Forwarder | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editForm, setEditForm] = useState({
    label: '',
    targetUrl: '',
    countryCode: '',
    forwardAuthHeader: true,
    preservePath: true,
    preserveQuery: true,
  });

  function openEdit(fwd: Forwarder) {
    setEditingFwd(fwd);
    setEditForm({
      label: fwd.label,
      targetUrl: fwd.targetUrl,
      countryCode: fwd.countryCode ?? '',
      forwardAuthHeader: fwd.forwardAuthHeader,
      preservePath: fwd.preservePath,
      preserveQuery: fwd.preserveQuery,
    });
  }

  async function handleUpdate() {
    if (!editingFwd || !editForm.label.trim() || !editForm.targetUrl.trim()) return;
    setUpdating(true);
    try {
      await api.forwarders.update(editingFwd.id, {
        label: editForm.label.trim(),
        targetUrl: editForm.targetUrl.trim(),
        countryCode: editForm.countryCode || null,
        forwardAuthHeader: editForm.forwardAuthHeader,
        preservePath: editForm.preservePath,
        preserveQuery: editForm.preserveQuery,
      });
      setEditingFwd(null);
      toast.success(tx('Forwarder updated successfully', 'مسیر با موفقیت ویرایش شد'));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update';
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [data, socks] = await Promise.all([
        api.forwarders.list(),
        api.socks5
          .endpoints()
          .catch(() => ({ endpoints: [], requiresActivePlan: false })),
      ]);
      setUserSlug(data.userSlug);
      setFwds(data.forwarders);
      const countries = new Map<string, string>();
      for (const endpoint of socks.endpoints) {
        countries.set(endpoint.countryCode, endpoint.countryName);
      }
      setCountryOptions(
        Array.from(countries, ([code, name]) => ({ code, name }))
      );
      setCountryRequiresPlan(socks.requiresActivePlan);
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
        countryCode: form.countryCode || null,
        forwardAuthHeader: form.forwardAuthHeader,
        preservePath: form.preservePath,
        preserveQuery: form.preserveQuery,
      });
      setForm({
        label: '',
        targetUrl: '',
        countryCode: '',
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
      let detailMsg = '';
      if (!r.ok) {
        try {
          const bodyJson = await r.json();
          if (
            bodyJson.detail &&
            typeof bodyJson.detail === 'string' &&
            bodyJson.detail.includes('ECONNREFUSED')
          ) {
            toast.error(
              tx(
                `Connection refused by target server (${fwd.targetUrl}). Please ensure your upstream service is online.`,
                `سرور مقصد (${fwd.targetUrl}) اتصال را رد کرد (ECONNREFUSED). لطفاً مطمئن شوید سرویس مقصد روشن و در دسترس است.`
              ),
              { duration: 7000 }
            );
            detailMsg = 'ECONNREFUSED';
          } else if (bodyJson.error === 'upstream_relay_error') {
            toast.error(
              tx(
                `Target server is unreachable (${fwd.targetUrl})`,
                `سرور مقصد در دسترس نیست (${fwd.targetUrl})`
              ),
              { duration: 6000 }
            );
            detailMsg = '502 Unreachable';
          } else {
            toast.error(
              bodyJson.message ||
                bodyJson.error ||
                tx(`HTTP error: ${r.status}`, `خطای پاسخ سرور: ${r.status}`)
            );
          }
        } catch {
          toast.error(tx(`HTTP error: ${r.status}`, `خطای پاسخ سرور: ${r.status}`));
        }
      } else {
        toast.success(tx(`Forwarder OK (${timeMs}ms)`, `تست موفق بود (${timeMs} میلی‌ثانیه)`));
        setTimeout(load, 500);
      }
      setTestResults((s) => ({
        ...s,
        [fwd.id]: { loading: false, ok: r.ok, status: r.status, timeMs, msg: detailMsg },
      }));
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
    featuredForwarder && userSlug ? `${apiBase}/f/${userSlug}/${featuredForwarder.slug}` : null;

  return (
    <div className="space-y-6">
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

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-primary" />
                <span>{tx('Exit country (optional)', 'کشور خروج (اختیاری)')}</span>
              </label>
              <select
                value={form.countryCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, countryCode: e.target.value }))
                }
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">
                  {tx('Auto (account routing)', 'خودکار (تنظیمات حساب)')}
                </option>
                {countryOptions.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.code} — {country.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {countryRequiresPlan
                  ? tx(
                      'An active plan is required to pin a country. Auto mode still works without it.',
                      'برای انتخاب کشور به اشتراک فعال نیاز دارید؛ حالت خودکار بدون اشتراک هم کار می‌کند.',
                    )
                  : tx(
                      'Traffic for this forwarder exits through the selected country.',
                      'ترافیک این فورواردر از کشور انتخاب‌شده خارج می‌شود.',
                    )}
              </p>
            </div>

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

      {/* Edit Modal Dialog */}
      {editingFwd && (
        <Modal
          title={tx('Edit Forwarder', 'ویرایش مسیر فورواردر')}
          onClose={() => setEditingFwd(null)}
          open={!!editingFwd}
        >
          <div className="space-y-4 pt-2">
            <Input
              label={t(lang, 'fwd.form.label')}
              placeholder={t(lang, 'fwd.form.label_ph')}
              value={editForm.label}
              onChange={(v) => setEditForm((f) => ({ ...f, label: v }))}
              required
            />

            <Input
              label={t(lang, 'fwd.form.target')}
              placeholder={t(lang, 'fwd.form.target_ph')}
              value={editForm.targetUrl}
              onChange={(v) => setEditForm((f) => ({ ...f, targetUrl: v }))}
              hint={tx(
                'e.g. http://199.247.2.165:4000 or https://api.ipify.org?format=json',
                'مثال: http://199.247.2.165:4000 یا https://api.ipify.org?format=json'
              )}
              dir="ltr"
              required
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-primary" />
                <span>{tx('Exit country (optional)', 'کشور خروج (اختیاری)')}</span>
              </label>
              <select
                value={editForm.countryCode}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, countryCode: e.target.value }))
                }
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">
                  {tx('Auto (account routing)', 'خودکار (تنظیمات حساب)')}
                </option>
                {countryOptions.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.code} — {country.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {countryRequiresPlan
                  ? tx(
                      'An active plan is required to pin a country. Auto mode still works without it.',
                      'برای انتخاب کشور به اشتراک فعال نیاز دارید؛ حالت خودکار بدون اشتراک هم کار می‌کند.',
                    )
                  : tx(
                      'Traffic for this forwarder exits through the selected country.',
                      'ترافیک این فورواردر از کشور انتخاب‌شده خارج می‌شود.',
                    )}
              </p>
            </div>

            <div className="space-y-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="editPreservePath"
                  checked={editForm.preservePath}
                  onCheckedChange={(checked) =>
                    setEditForm((f) => ({ ...f, preservePath: !!checked }))
                  }
                />
                <label
                  htmlFor="editPreservePath"
                  className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
                >
                  {t(lang, 'fwd.form.preserve_path')}
                </label>
              </div>

              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="editPreserveQuery"
                  checked={editForm.preserveQuery}
                  onCheckedChange={(checked) =>
                    setEditForm((f) => ({ ...f, preserveQuery: !!checked }))
                  }
                />
                <label
                  htmlFor="editPreserveQuery"
                  className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
                >
                  {t(lang, 'fwd.form.preserve_query')}
                </label>
              </div>

              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="editForwardAuthHeader"
                  checked={editForm.forwardAuthHeader}
                  onCheckedChange={(checked) =>
                    setEditForm((f) => ({ ...f, forwardAuthHeader: !!checked }))
                  }
                />
                <label
                  htmlFor="editForwardAuthHeader"
                  className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
                >
                  {t(lang, 'fwd.form.forward_auth')}
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
              <Button variant="outline" size="sm" onClick={() => setEditingFwd(null)}>
                {t(lang, 'cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={updating || !editForm.label.trim() || !editForm.targetUrl.trim()}
              >
                {updating ? '...' : tx('Save Changes', 'ذخیره تغییرات')}
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
          {pagination.paginatedItems.map((fwd) => {
            const publicUrl = `${apiBase}/f/${userSlug}/${fwd.slug}`;
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
                            ? formatDateTime(fwd.lastUsedAt, lang)
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
                        onClick={() => openEdit(fwd)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>{tx('Edit', 'ویرایش')}</span>
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

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe2 className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold uppercase tracking-wider">
                      {tx('Exit:', 'خروج:')}
                    </span>
                    <span className="font-mono text-foreground" dir="ltr">
                      {fwd.countryCode || tx('Auto', 'خودکار')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Pagination
            currentPage={pagination.page}
            totalItems={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            lang={lang}
          />
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-normal border-input bg-background">
                      <span>{featuredForwarder?.label ?? '—'}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[8rem] p-1">
                    {fwds.map((f) => {
                      const isSelected = f.id === (featuredForwarder?.id ?? '');
                      return (
                        <DropdownMenuItem
                          key={f.id}
                          onClick={() => setExampleFwdId(f.id)}
                          className={cn(
                            'text-xs cursor-pointer flex items-center justify-between px-2.5 py-1.5',
                            isSelected && 'font-semibold bg-accent text-accent-foreground'
                          )}
                        >
                          <span>{f.label}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
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
