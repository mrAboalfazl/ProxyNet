'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, Socks5Endpoint, getPublicApiBase } from '../../../lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Alert,
  Spinner,
  Badge,
  Input,
  Modal,
  Pagination,
  usePagination,
  formatDateTime,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import { CodeExamplesPanel, buildGatewaySnippets } from '../../../lib/code-examples';
import { toast } from 'sonner';
import {
  KeyRound,
  Copy,
  Check,
  Plus,
  Trash2,
  Terminal,
  ShieldAlert,
  Server,
  Lock,
} from 'lucide-react';

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

function SecretBanner({
  cred,
  lang,
  endpoints,
  requiresActivePlan,
  apiBase,
  onDismiss,
}: {
  cred: NewlyCreated;
  lang: string;
  endpoints: Socks5Endpoint[];
  requiresActivePlan: boolean;
  apiBase: string;
  onDismiss: () => void;
}) {
  const basicAuth = buildBasicAuth(cred.uuid, cred.secret);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copy(text: string, key: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(
      lang === 'fa' ? `${label} در حافظه کپی شد` : `${label} copied to clipboard`
    );
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const curlExample = `curl -X POST ${apiBase}/gateway/fetch \\
  -H "Authorization: Basic ${basicAuth}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/api/data"}'`;

  return (
    <Card className="border-2 border-amber-500 bg-amber-500/10 dark:bg-amber-950/20 mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <Lock className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base font-bold">
              {lang === 'fa'
                ? 'کلید امنیتی ایجاد شد — این اطلاعات را ذخیره کنید'
                : 'Credential Created — Save these credentials now'}
            </CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onDismiss} className="text-amber-800">
            ✕
          </Button>
        </div>
        <CardDescription className="text-xs text-amber-800 dark:text-amber-300">
          {lang === 'fa'
            ? 'سیکرت (Secret) فقط یک‌بار نمایش داده می‌شود و پس از بستن این کادر دیگر قابل بازیابی نیست.'
            : 'The secret is shown once and cannot be retrieved after closing this window.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              UUID (Username)
            </span>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 p-2 rounded-md bg-background text-xs font-mono break-all border"
                dir="ltr"
              >
                {cred.uuid}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(cred.uuid, 'uuid', 'UUID')}
              >
                {copiedKey === 'uuid' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              Secret (Password)
            </span>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 p-2 rounded-md bg-background text-xs font-mono break-all border"
                dir="ltr"
              >
                {cred.secret}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(cred.secret, 'secret', 'Secret')}
              >
                {copiedKey === 'secret' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* cURL Quick Test */}
        <div className="space-y-2 pt-2 border-t border-amber-500/20">
          <span className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5" />
            {lang === 'fa' ? 'دستور تست سریع با cURL:' : 'Quick cURL test command:'}
          </span>
          <div className="relative">
            <pre
              className="p-3 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all"
              dir="ltr"
            >
              {curlExample}
            </pre>
            <div className="absolute top-2 right-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copy(curlExample, 'curl', 'cURL')}
              >
                {copiedKey === 'curl' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function UserCredentialsPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);
  const [apiBase, setApiBase] = useState<string>(() => getPublicApiBase());
  useEffect(() => {
    setApiBase(getPublicApiBase());
  }, []);
  const [creds, setCreds] = useState<Credential[]>([]);
  const pagination = usePagination(creds, 5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<NewlyCreated | null>(null);
  const [socksEndpoints, setSocksEndpoints] = useState<Socks5Endpoint[]>([]);
  const [socksRequiresPlan, setSocksRequiresPlan] = useState(false);
  const [copiedUuid, setCopiedUuid] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [data, socks] = await Promise.all([
        api.myCredentials(),
        api.socks5.endpoints(),
      ]);
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
      const [cred, socks] = await Promise.all([
        api.createCredential(newLabel.trim()),
        api.socks5.endpoints(),
      ]);
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
      toast.success(tx('Credential created successfully', 'کلید احراز هویت با موفقیت ایجاد شد'));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create credential';
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(t(lang, 'cred.revoke') + '?')) return;
    try {
      await api.revokeCredential(id);
      toast.success(tx('Credential revoked', 'اعتبارنامه ابطال شد'));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to revoke credential';
      setError(msg);
      toast.error(msg);
    }
  }

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedUuid(id);
    toast.success(tx('UUID copied to clipboard', 'شناسه UUID در کلیپ‌بورد کپی شد'));
    setTimeout(() => setCopiedUuid(null), 2000);
  }

  useEffect(() => {
    load();
  }, []);

  const [exampleCredUuid, setExampleCredUuid] = useState<string | null>(null);
  const featuredCred = useMemo(() => {
    if (!creds.length) return null;
    if (exampleCredUuid) return creds.find((c) => c.uuid === exampleCredUuid) ?? creds[0];
    return creds.find((c) => c.enabled) ?? creds[0];
  }, [creds, exampleCredUuid]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(lang, 'cred.title')}
        description={tx(
          'Manage authentication credentials used for SOCKS5 proxies and HTTP Fetch Gateway calls.',
          'مدیریت شناسه‌ها و کلیدهای دسترسی جهت استفاده در پروکسی SOCKS5 و درخواست‌های درگاه HTTP.'
        )}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            <span>{t(lang, 'cred.new')}</span>
          </Button>
        }
      />

      {/* Create Modal Dialog */}
      {showCreate && (
        <Modal
          title={t(lang, 'cred.new')}
          onClose={() => setShowCreate(false)}
          open={showCreate}
        >
          <div className="space-y-4 pt-2">
            <Input
              label={t(lang, 'cred.label')}
              placeholder={t(lang, 'cred.label.placeholder')}
              value={newLabel}
              onChange={setNewLabel}
              required
            />
            <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                {t(lang, 'cancel')}
              </Button>
              <Button size="sm" onClick={create} disabled={creating || !newLabel.trim()}>
                {creating ? '...' : t(lang, 'cred.create')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {newlyCreated && (
        <SecretBanner
          cred={newlyCreated}
          lang={lang}
          endpoints={socksEndpoints}
          requiresActivePlan={socksRequiresPlan}
          apiBase={apiBase}
          onDismiss={() => setNewlyCreated(null)}
        />
      )}

      {error && <Alert message={error} type="error" />}

      {/* SOCKS5 Endpoint Status Info */}
      {!loading && (
        <Card
          className={`border ${
            socksRequiresPlan
              ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/10'
              : 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/10'
          }`}
        >
          <CardContent className="p-4 flex items-start gap-3">
            {socksRequiresPlan ? (
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <Server className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 text-xs">
              <span className="font-bold text-foreground">SOCKS5 Node Relays</span>
              {socksRequiresPlan ? (
                <p className="text-amber-800 dark:text-amber-300">
                  {lang === 'fa'
                    ? 'نودهای پروکسی آماده اتصال هستند، اما برای دریافت دسترسی نیازمند اشتراک فعال هستید.'
                    : 'Relay nodes are operational, but an active plan is required to connect.'}
                </p>
              ) : socksEndpoints.length ? (
                <div className="space-y-1 pt-1">
                  {socksEndpoints.map((ep) => (
                    <div key={ep.nodeId} className="flex items-center gap-2 font-mono">
                      <span className="font-semibold text-foreground">
                        {ep.countryName} ({ep.label}):
                      </span>
                      <code>
                        {ep.host}:{ep.port}
                      </code>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {lang === 'fa'
                    ? 'در حال حاضر نود SOCKS5 در این منطقه ثبت نشده است.'
                    : 'No active SOCKS5 relays registered.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credentials List */}
      {loading ? (
        <Spinner />
      ) : creds.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <p>{t(lang, 'cred.empty')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {pagination.paginatedItems.map((cred) => {
            const isCopied = copiedUuid === cred.id;
            return (
              <Card key={cred.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-base">
                          {cred.label || '(بدون عنوان)'}
                        </span>
                        <Badge
                          label={cred.enabled ? tx('Enabled', 'فعال') : tx('Disabled', 'غیرفعال')}
                          variant={cred.enabled ? 'success' : 'secondary'}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(lang, 'cred.created')}:{' '}
                        {formatDateTime(cred.createdAt, lang)}
                      </p>
                    </div>

                    <Button variant="danger" size="sm" onClick={() => revoke(cred.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{t(lang, 'cred.revoke')}</span>
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      UUID (Username)
                    </span>
                    <div className="flex items-center gap-2">
                      <code
                        className="flex-1 p-2 rounded-md bg-muted/60 text-xs font-mono break-all border"
                        dir="ltr"
                      >
                        {cred.uuid}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copy(cred.uuid, cred.id)}
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

      {/* Code Examples Section */}
      <div className="pt-4">
        {featuredCred ? (
          <div className="space-y-3">
            {creds.length > 1 && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {t(lang, 'examples.select_credential')}:
                </span>
                <select
                  value={featuredCred.uuid}
                  onChange={(e) => setExampleCredUuid(e.target.value)}
                  className="p-1.5 rounded-md border text-xs bg-background"
                >
                  {creds.map((c) => (
                    <option key={c.id} value={c.uuid}>
                      {c.label || c.uuid.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <CodeExamplesPanel
              lang={lang}
              intro={t(lang, 'examples.intro.gateway')}
              snippets={buildGatewaySnippets(apiBase, featuredCred.uuid)}
            />
          </div>
        ) : (
          <Card className="p-6 text-center text-xs text-muted-foreground">
            <p>{t(lang, 'examples.no_credential')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
