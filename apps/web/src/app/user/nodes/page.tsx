'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  Copy,
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  Server,
  Terminal,
  Send,
} from 'lucide-react';
import { TelegramGuideModal } from '@/components/telegram-guide-modal';
import { CountryFlag } from '../../../components/country-flag';
import { api, Country, Node, Project, Socks5Endpoint } from '../../../lib/api';
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
  Input,
  Modal,
  Pagination,
  usePagination,
  formatDate,
  toPersianDigits,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import { toast } from 'sonner';

const INSTALL_COMMAND =
  'curl -fsSL https://panel.civonex.ir/api/nodes/install.sh | sudo bash -s -- --panel https://panel.civonex.ir --token';
const DOCS_URL = 'https://github.com/mrAboalfazl/ProxyNet#readme';

const faCountryNames: Record<string, string> = {
  DE: 'آلمان',
  FR: 'فرانسه',
  NL: 'هلند',
  TR: 'ترکیه',
  GB: 'بریتانیا',
  US: 'ایالات متحده',
};

function displayCountry(
  country: { code: string; name?: string },
  lang: string,
) {
  return lang === 'fa'
    ? (faCountryNames[country.code] ?? (country.name || country.code))
    : country.name || country.code;
}

function formatUptime(secondsStr?: string | null, isFa = false) {
  if (!secondsStr) return null;
  const sec = parseInt(secondsStr, 10);
  if (isNaN(sec) || sec <= 0) return null;
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  if (days > 0) {
    return isFa
      ? `${toPersianDigits(days)} روز و ${toPersianDigits(hours)} ساعت`
      : `${days}d ${hours}h`;
  }
  const mins = Math.floor((sec % 3600) / 60);
  return isFa
    ? `${toPersianDigits(hours)} ساعت و ${toPersianDigits(mins)} دقیقه`
    : `${hours}h ${mins}m`;
}

export default function UserNodesPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [nodes, setNodes] = useState<Node[]>([]);
  const pagination = usePagination(nodes, 6);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [telegramNode, setTelegramNode] = useState<Node | null>(null);
  const [copiedNodeIp, setCopiedNodeIp] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState('');
  const [newToken, setNewToken] = useState<{
    nodeId: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState<'private' | 'request-public'>(
    'private',
  );
  const [managing, setManaging] = useState<Node | null>(null);
  const [manageLabel, setManageLabel] = useState('');
  const [busyNode, setBusyNode] = useState<string | null>(null);
  const [usingNode, setUsingNode] = useState<Node | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [socksEndpoints, setSocksEndpoints] = useState<Socks5Endpoint[]>([]);

  async function load(showSpinner = true, showToast = false) {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const [result, socks] = await Promise.all([
        api.myNodes.list(),
        api.socks5.endpoints().catch(() => ({ endpoints: [] })),
      ]);
      setNodes(result);
      setSocksEndpoints(socks.endpoints);
      setError('');
      if (showToast) {
        toast.success(tx('Nodes updated', 'فهرست نودها به‌روزرسانی شد'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load nodes';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    api.countries
      .list()
      .then((items) => setCountries(items.filter((country) => country.enabled)))
      .catch(() => setCountries([]));
  }, []);

  const stats = useMemo(
    () => ({
      total: nodes.length,
      healthy: nodes.filter((node) => node.httpReady).length,
      pending: nodes.filter(
        (node) => node.status === 'pending' || node.sharingRequested,
      ).length,
    }),
    [nodes],
  );

  const installCommand = newToken ? `${INSTALL_COMMAND} ${newToken.token}` : '';

  async function addNode() {
    if (creating || !label.trim() || !countryCode) return;
    setCreating(true);
    setError('');
    setAddError('');
    try {
      const res = await api.myNodes.create({
        label: label.trim(),
        countryCode,
        sharing,
      });
      setNewToken({
        nodeId: res.node.id,
        token: res.token,
        expiresAt: res.expiresAt,
      });
      setShowAdd(false);
      setLabel('');
      setCountryCode('');
      setSharing('private');
      toast.success(tx('Node registered successfully', 'نود با موفقیت ثبت شد'));
      await load(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add node';
      setAddError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function mutateNode(
    node: Node,
    data: {
      label?: string;
      userPaused?: boolean;
      sharing?: 'private' | 'request-public';
    },
  ) {
    setBusyNode(node.id);
    try {
      await api.myNodes.update(node.id, data);
      setManaging(null);
      await load(false);
      toast.success(
        data.sharing === 'request-public'
          ? tx(
              'Request sent. The node stays private until administrator approval.',
              'درخواست ثبت شد؛ تا تأیید ادمین نود خصوصی می‌ماند.',
            )
          : data.sharing === 'private'
            ? tx(
                'The node is now private; public sharing requests are cancelled.',
                'نود خصوصی است و درخواست اشتراک لغو شد.',
              )
            : tx('Node settings saved', 'تنظیمات نود ذخیره شد'),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update node');
    } finally {
      setBusyNode(null);
    }
  }

  async function renewToken(node: Node) {
    setBusyNode(node.id);
    try {
      const result = await api.myNodes.enrollmentToken(node.id);
      setNewToken({ nodeId: node.id, ...result });
      setCopied(false);
      toast.success(
        tx(
          'New installation command ready; the previous token is invalid.',
          'دستور نصب جدید آماده شد؛ توکن قبلی باطل شد.',
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to renew token');
    } finally {
      setBusyNode(null);
    }
  }

  async function updateSoftware(node: Node) {
    setBusyNode(node.id);
    try {
      await api.myNodes.updateSoftware(node.id);
      await load(false);
      setManaging(null);
      toast.success(
        tx(
          'Relay update queued; it will restart and may interrupt current connections.',
          'آپدیت رله در صف قرار گرفت؛ ری‌استارت ممکن است اتصال‌های جاری را قطع کند.',
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to request update');
    } finally {
      setBusyNode(null);
    }
  }

  async function chooseProject(node: Node) {
    setBusyNode(node.id);
    try {
      setProjects(await api.projects.list());
      setUsingNode(node);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setBusyNode(null);
    }
  }

  async function copyInstallCommand() {
    if (!installCommand) return;
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      toast.success(
        tx(
          'Install command copied to clipboard',
          'دستور نصب در کلیپ‌بورد کپی شد',
        ),
      );
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error(
        lang === 'fa'
          ? 'کپی خودکار انجام نشد؛ دستور را دستی کپی کنید.'
          : 'Could not copy automatically; copy the command manually.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(lang, 'nodes.title')}
        description={tx(
          'Connect your own servers as exit relays or forwarders in the ProxyNet pool.',
          'ثبت سرور شما برای پیوستن به شبکه؛ پس از نصب ایجنت و تأیید ادمین قابل استفاده می‌شود.',
        )}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(false, true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              <span>{t(lang, 'nodes.refresh')}</span>
            </Button>
            <Button
              onClick={() => {
                setAddError('');
                setShowAdd(true);
              }}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              <span>{t(lang, 'nodes.add')}</span>
            </Button>
          </div>
        }
      />

      {error && <Alert message={error} type="error" />}

      <details
        className="rounded-lg border border-border/80 bg-card p-4 text-xs leading-6"
        open={nodes.length === 0}
      >
        <summary className="cursor-pointer font-semibold">
          {tx(
            'Connect your server in three steps (optional)',
            'اتصال سرور شخصی در سه مرحله (اختیاری)',
          )}
        </summary>
        <p className="mt-2 text-muted-foreground">
          {tx(
            'You can use platform proxies without adding a server. This section is for servers you own.',
            'برای استفاده از پراکسی‌های سامانه نیازی به افزودن سرور ندارید. این بخش برای سرور متعلق به خود شماست.',
          )}
        </p>
        <ol className="mt-2 list-decimal list-inside space-y-1">
          <li>
            {tx(
              'Register the server name, actual hosting country and sharing choice.',
              'نام سرور، کشور واقعی و سطح دسترسی را ثبت کنید.',
            )}
          </li>
          <li>
            {tx(
              'Run the installation command on your Linux server with sudo.',
              'دستور نصب را با دسترسی sudo روی سرور لینوکسی خود اجرا کنید.',
            )}
          </li>
          <li>
            {tx(
              'After administrator approval, select Use in project.',
              'پس از تأیید ادمین، «استفاده در پروژه» را بزنید.',
            )}
          </li>
        </ol>
        <p className="mt-2 text-muted-foreground">
          {tx(
            'Private by default. Public sharing requires your request and administrator approval.',
            'نود پیش‌فرض خصوصی است. اشتراک عمومی به درخواست شما و تأیید ادمین نیاز دارد.',
          )}
        </p>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-primary"
        >
          {t(lang, 'nodes.view_guide')}
          <ExternalLink className="h-3 w-3" />
        </a>
      </details>
      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="p-4 border-border/70">
          <span className="text-xs font-medium text-muted-foreground">
            {t(lang, 'nodes.total')}
          </span>
          <div className="text-2xl font-bold mt-1">
            {lang === 'fa' ? toPersianDigits(stats.total) : stats.total}
          </div>
        </Card>
        <Card className="p-4 border-border/70">
          <span className="text-xs font-medium text-muted-foreground">
            {tx('Ready to use', 'آماده استفاده')}
          </span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {lang === 'fa' ? toPersianDigits(stats.healthy) : stats.healthy}
          </div>
        </Card>
        <Card className="p-4 border-border/70">
          <span className="text-xs font-medium text-muted-foreground">
            {tx('Awaiting installation / review', 'در انتظار نصب یا بررسی')}
          </span>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {lang === 'fa' ? toPersianDigits(stats.pending) : stats.pending}
          </div>
        </Card>
      </div>

      {/* New Node Install Token Banner */}
      {newToken && (
        <Card className="border-2 border-primary bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">
                  {t(lang, 'nodes.install_title')}
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewToken(null)}
                aria-label={tx('Close installation command', 'بستن دستور نصب')}
                className="text-muted-foreground"
              >
                ✕
              </Button>
            </div>
            <CardDescription className="text-xs">
              {tx(
                `Run on your server. Node #${newToken.nodeId}; token is one-time use.`,
                `روی سرور خود اجرا کنید. نود شماره ${newToken.nodeId}؛ توکن یک‌بارمصرف است.`,
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div
              className="rounded-xl border border-zinc-800 bg-[#0d1117] text-zinc-100 overflow-hidden shadow-md text-left"
              dir="ltr"
            >
              <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/95 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500/80 inline-block" />
                  <span className="h-2 w-2 rounded-full bg-amber-500/80 inline-block" />
                  <span className="h-2 w-2 rounded-full bg-emerald-500/80 inline-block" />
                  <span className="text-zinc-300 font-sans text-xs">
                    terminal — bash
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyInstallCommand}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-all active:scale-95 ${
                    copied
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 hover:text-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">
                        {t(lang, 'nodes.copied')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t(lang, 'nodes.copy_cmd')}</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all text-zinc-200">
                {installCommand}
              </pre>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1 font-mono">
                <Clock3 className="h-3.5 w-3.5" />
                {t(lang, 'nodes.expires')}:{' '}
                {formatDate(newToken.expiresAt, lang)}
              </span>
              <span>·</span>
              <span>{t(lang, 'nodes.approval_hint')}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Node Registration Modal Dialog */}
      {showAdd && (
        <Modal
          title={t(lang, 'nodes.add')}
          description={tx(
            'Register a server you own, then install the agent and wait for review.',
            'سرور متعلق به خود را ثبت کنید؛ سپس ایجنت را نصب کنید و منتظر بررسی بمانید.',
          )}
          onClose={() => setShowAdd(false)}
          open={showAdd}
        >
          <form
            className="space-y-4 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addNode();
            }}
          >
            {addError && <Alert type="error" message={addError} />}
            <Input
              label={tx('Node Label / Hostname', 'برچسب یا نام سرور')}
              placeholder="e.g. Frankfurt-Relay-01"
              value={label}
              onChange={setLabel}
              required
              disabled={creating}
            />

            <div className="space-y-1.5">
              <label
                htmlFor="node-country"
                className="text-xs font-medium text-foreground"
              >
                {tx('Country Location', 'موقعیت کشور سرور')}
              </label>
              <select
                id="node-country"
                required
                disabled={creating || countries.length === 0}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">
                  {tx('Select Country…', 'انتخاب کشور…')}
                </option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {displayCountry(c, lang)}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-muted-foreground">
              {countries.length
                ? tx(
                    'Choose the actual location of your server, not the country you want to browse from.',
                    'کشور واقعی میزبانی سرور را انتخاب کنید؛ نه کشوری که می‌خواهید از آن اینترنت بگیرید.',
                  )
                : tx(
                    'Countries could not be loaded. Close this form and refresh the page.',
                    'فهرست کشورها در دسترس نیست. فرم را ببندید و صفحه را تازه‌سازی کنید.',
                  )}
            </p>
            <label className="block space-y-2 text-xs">
              <span className="font-medium">
                {tx('Who can use this node?', 'چه کسی از نود استفاده کند؟')}
              </span>
              <select
                disabled={creating}
                value={sharing}
                onChange={(e) => setSharing(e.target.value as typeof sharing)}
                className="w-full rounded-md border bg-background p-2"
              >
                <option value="private">
                  {tx('Only my account', 'فقط حساب من')}
                </option>
                <option value="request-public">
                  {tx('Request public sharing', 'درخواست اشتراک در شبکه عمومی')}
                </option>
              </select>
              <span className="block text-muted-foreground">
                {tx(
                  'Public sharing remains private until approved. SOCKS5 still requires client credentials and quota.',
                  'تا پیش از تأیید ادمین خصوصی می‌ماند. کاربران SOCKS5 همچنان به اعتبارنامه و سهمیه نیاز دارند.',
                )}
              </span>
            </label>
            {sharing === 'request-public' && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-6">
                {tx(
                  'After approval, other authorized users can use this server bandwidth and public IP. You can withdraw sharing later.',
                  'پس از تأیید، کاربران مجاز دیگر از پهنای باند و IP این سرور استفاده می‌کنند. بعداً می‌توانید اشتراک را لغو کنید.',
                )}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={creating}
                onClick={() => setShowAdd(false)}
              >
                {t(lang, 'cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating || !label.trim() || !countryCode}
              >
                {creating ? '...' : t(lang, 'nodes.add')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Nodes List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {t(lang, 'nodes.your_nodes')}
          </h2>
          <span className="text-xs text-muted-foreground">
            {lang === 'fa' ? toPersianDigits(nodes.length) : nodes.length}{' '}
            {tx('nodes total', 'نود')}
          </span>
        </div>

        {loading ? (
          <Spinner />
        ) : nodes.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground space-y-3">
            <Server className="h-8 w-8 mx-auto text-muted-foreground/60" />
            <p className="font-semibold">{t(lang, 'nodes.empty')}</p>
            <p className="text-xs">{t(lang, 'nodes.empty_msg')}</p>
            <Button
              onClick={() => {
                setAddError('');
                setShowAdd(true);
              }}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              <span>{t(lang, 'nodes.add')}</span>
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pagination.paginatedItems.map((node) => {
                const healthy = node.status === 'healthy' && !node.userPaused;
                const socksEndpoint = socksEndpoints.find(
                  (endpoint) => endpoint.nodeId === node.id,
                );
                const ip = node.ipv4Address || node.ipv6Address || '';
                const nextStep = node.userPaused
                  ? tx(
                      'Resume this node from Manage to use it again.',
                      'برای استفاده دوباره، از «مدیریت» ادامه استفاده را بزنید.',
                    )
                  : !node.enrolled && node.status === 'pending'
                    ? tx(
                        'Get the installation command and run it on your server.',
                        'دستور نصب را دریافت و روی سرور خود اجرا کنید.',
                      )
                    : node.status === 'pending'
                      ? tx(
                          'Installation received. Waiting for administrator approval.',
                          'نصب ثبت شده است؛ منتظر تأیید ادمین بمانید.',
                        )
                      : node.httpReady
                        ? tx(
                            'Select a project to create a proxy or forwarder on this node.',
                            'برای ساخت پراکسی یا فورواردر با این نود، پروژه را انتخاب کنید.',
                          )
                        : tx(
                            'This node is not ready. Check its status or contact support.',
                            'نود آماده نیست؛ وضعیت را بررسی کنید یا با پشتیبانی تماس بگیرید.',
                          );
                const statusLabel =
                  node.status === 'pending'
                    ? node.enrolled
                      ? tx('Awaiting admin approval', 'در انتظار تأیید ادمین')
                      : tx('Awaiting agent installation', 'در انتظار نصب ایجنت')
                    : t(lang, `nodes.status.${node.status}`);
                const uptimeText = formatUptime(
                  node.uptimeSeconds,
                  lang === 'fa',
                );

                return (
                  <Card
                    key={node.id}
                    className="overflow-hidden border-border/80 shadow-xs hover:border-border transition-colors"
                  >
                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/15">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CountryFlag code={node.countryCode} size={20} />
                            <span className="font-bold text-sm text-foreground">
                              {node.label}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border">
                              #{node.id}
                            </span>
                          </div>
                          <CardDescription className="text-xs">
                            {displayCountry(
                              {
                                code: node.countryCode,
                                name: node.countryCode,
                              },
                              lang,
                            )}{' '}
                            · {t(lang, 'nodes.created')}:{' '}
                            {formatDate(node.createdAt, lang)}
                          </CardDescription>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              healthy
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${healthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}
                            />
                            <span>
                              {node.userPaused
                                ? tx('Paused by you', 'متوقف‌شده توسط شما')
                                : statusLabel}
                            </span>
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3 text-xs">
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded border px-2 py-1">
                          {node.visibility === 'public'
                            ? tx('Shared network', 'شبکه عمومی')
                            : tx('Only my account', 'فقط حساب من')}
                        </span>
                        {node.sharingRequested && (
                          <span className="text-amber-600">
                            {tx(
                              'Sharing awaiting approval',
                              'اشتراک در انتظار تأیید',
                            )}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {tx('Last agent contact:', 'آخرین تماس ایجنت:')}{' '}
                          {node.heartbeats?.[0]?.reportedAt
                            ? new Date(
                                node.heartbeats[0].reportedAt,
                              ).toLocaleString(
                                lang === 'fa' ? 'fa-IR' : 'en-US',
                              )
                            : '—'}
                        </span>
                      </div>
                      <p className="rounded-md bg-muted/30 p-2 text-xs leading-6">
                        {nextStep}
                      </p>
                      {node.updateStatus && (
                        <p className="text-xs text-muted-foreground">
                          {tx('Relay update:', 'آپدیت رله:')}{' '}
                          {node.updateStatus}
                          {node.updateMessage ? ` · ${node.updateMessage}` : ''}
                        </p>
                      )}
                      {/* IP & Hostname Bar */}
                      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/70 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Server className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] text-muted-foreground block">
                              {tx('Public IP / Host', 'آدرس آی‌پی عمومی سرور')}
                            </span>
                            <span
                              className="font-mono font-semibold text-foreground text-xs"
                              dir="ltr"
                            >
                              {ip || tx('Not reported yet', 'هنوز گزارش نشده')}
                            </span>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!ip}
                          className="h-7 px-2 gap-1 text-[11px]"
                          onClick={() => {
                            navigator.clipboard.writeText(ip);
                            setCopiedNodeIp(node.id);
                            toast.success(tx('IP copied', 'آدرس IP کپی شد'));
                            setTimeout(() => setCopiedNodeIp(null), 2000);
                          }}
                        >
                          {copiedNodeIp === node.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                              <span className="text-emerald-600 font-semibold">
                                {tx('Copied', 'کپی شد')}
                              </span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>{tx('Copy', 'کپی')}</span>
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Hardware & System Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-muted/20 border border-border/50 space-y-0.5">
                          <span className="text-[11px] text-muted-foreground block">
                            {tx('Hostname / OS', 'میزبان و سیستم‌عامل')}
                          </span>
                          <span className="font-medium text-foreground truncate block font-mono text-[11px]">
                            {node.hostname || '—'} · {node.osName || '—'}
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-muted/20 border border-border/50 space-y-0.5">
                          <span className="text-[11px] text-muted-foreground block">
                            {tx('CPU & Uptime', 'پردازنده و آپ‌تایم')}
                          </span>
                          <span className="font-medium text-foreground truncate block">
                            {node.cpuCores
                              ? `${lang === 'fa' ? toPersianDigits(node.cpuCores) : node.cpuCores} Cores`
                              : '—'}
                            {uptimeText ? ` · ${uptimeText}` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Roles & Protocols Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[11px] text-muted-foreground font-medium mr-1">
                          {tx('Protocols:', 'پروتکل‌ها:')}
                        </span>
                        {socksEndpoint ? (
                          <span
                            className="rounded border px-2 py-0.5"
                            dir="ltr"
                          >
                            SOCKS5 :{socksEndpoint.port}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {tx(
                              'SOCKS5 endpoint unavailable / plan required',
                              'آدرس SOCKS5 در دسترس نیست / نیازمند پلن',
                            )}
                          </span>
                        )}
                        {node.httpReady && (
                          <span className="rounded border px-2 py-0.5">
                            HTTP Relay
                          </span>
                        )}
                        {node.roles?.map((role) => (
                          <span
                            key={role}
                            className="px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground border"
                          >
                            {role}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 border-t pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyNode === node.id}
                          onClick={() => {
                            setManaging(node);
                            setManageLabel(node.label);
                          }}
                        >
                          {tx('Manage', 'مدیریت')}
                        </Button>
                        <Button
                          size="sm"
                          disabled={busyNode === node.id || !node.httpReady}
                          onClick={() => chooseProject(node)}
                        >
                          {tx('Use in project', 'استفاده در پروژه')}
                        </Button>
                        {!node.enrolled && node.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyNode === node.id}
                            onClick={() => renewToken(node)}
                          >
                            {tx('Get installation command', 'دریافت دستور نصب')}
                          </Button>
                        )}
                      </div>
                      {/* Action Bar */}
                      <div className="pt-2 border-t border-border/60">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 text-xs text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/10"
                          disabled={!socksEndpoint || node.userPaused}
                          onClick={() => setTelegramNode(node)}
                        >
                          <Send className="h-3.5 w-3.5 text-sky-500" />
                          <span>
                            {tx(
                              'Telegram & Client Setup Guide',
                              'راهنمای اتصال به تلگرام و سرور',
                            )}
                          </span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

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
      </div>
      {managing && (
        <Modal
          open
          description={managing.label}
          title={tx('Manage my node', 'مدیریت نود من')}
          onClose={() => setManaging(null)}
        >
          <div className="space-y-4">
            <Input
              label={tx('Name', 'نام')}
              value={manageLabel}
              onChange={setManageLabel}
            />
            <Button
              disabled={busyNode === managing.id || !manageLabel.trim()}
              onClick={() => mutateNode(managing, { label: manageLabel })}
            >
              {tx('Save name', 'ذخیره نام')}
            </Button>
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs leading-6 text-muted-foreground">
                {tx(
                  'Update the relay to the version provided by the panel. The service restarts and current connections may close.',
                  'رله به نسخه ارائه‌شده توسط پنل به‌روز می‌شود. سرویس ری‌استارت می‌شود و ممکن است اتصال‌های جاری قطع شوند.',
                )}
              </p>
              <Button
                variant="outline"
                disabled={
                  busyNode === managing.id ||
                  !managing.enrolled ||
                  !['pending', 'active', 'healthy', 'degraded'].includes(
                    managing.status,
                  )
                }
                onClick={() => updateSoftware(managing)}
              >
                {tx('Update relay', 'آپدیت رله')}
              </Button>
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs leading-6 text-muted-foreground">
                {tx(
                  'Pause stops new HTTP requests and SOCKS5 access through this node. Existing SOCKS5 sessions are rechecked within 30 seconds with the updated relay. Resuming does not override administrator restrictions.',
                  'توقف، درخواست‌های جدید HTTP و دسترسی SOCKS5 را قطع می‌کند. اتصال‌های SOCKS5 با نسخه جدید رله حداکثر طی ۳۰ ثانیه بررسی می‌شوند. ادامه استفاده محدودیت ادمین را تغییر نمی‌دهد.',
                )}
              </p>
              <Button
                variant="outline"
                disabled={busyNode === managing.id}
                onClick={() =>
                  mutateNode(managing, { userPaused: !managing.userPaused })
                }
              >
                {managing.userPaused
                  ? tx('Resume use', 'ادامه استفاده')
                  : tx('Pause use', 'توقف استفاده')}
              </Button>
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs leading-6 text-muted-foreground">
                {tx(
                  'Sharing lets other authorized accounts use your server bandwidth and public IP. Making it private withdraws their access. Public requests require administrator approval.',
                  'با اشتراک عمومی، حساب‌های مجاز دیگر از پهنای باند و IP سرور شما استفاده می‌کنند. خصوصی‌کردن این دسترسی را پس می‌گیرد. عمومی‌شدن نیاز به تأیید ادمین دارد.',
                )}
              </p>
              {managing.visibility === 'public' || managing.sharingRequested ? (
                <Button
                  variant="outline"
                  disabled={busyNode === managing.id}
                  onClick={() => mutateNode(managing, { sharing: 'private' })}
                >
                  {managing.sharingRequested
                    ? tx('Cancel public request', 'لغو درخواست عمومی‌شدن')
                    : tx('Make private', 'خصوصی‌کردن نود')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={
                    busyNode === managing.id || managing.status === 'disabled'
                  }
                  onClick={() =>
                    mutateNode(managing, { sharing: 'request-public' })
                  }
                >
                  {tx('Request public sharing', 'درخواست اشتراک عمومی')}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {usingNode && (
        <Modal
          open
          description={usingNode.label}
          title={tx('Choose a project', 'انتخاب پروژه')}
          onClose={() => setUsingNode(null)}
        >
          <div className="space-y-3">
            <p className="text-xs leading-6 text-muted-foreground">
              {tx(
                'Create a SOCKS5 credential or HTTP forwarder bound to this node. Existing plan and wallet requirements apply.',
                'یک اعتبارنامه SOCKS5 یا فورواردر HTTP با انتخاب همین نود بسازید. شرایط پلن و کیف پول همچنان برقرار است.',
              )}
            </p>
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/user/projects/${project.id}?node=${usingNode.id}&add=1`}
                className="block rounded-lg border p-3 text-sm hover:border-primary"
              >
                {project.name}
              </Link>
            ))}
            {!projects.length && (
              <Link
                href={`/user/projects?node=${usingNode.id}&create=1`}
                className="text-primary text-sm"
              >
                {tx('Create a project first', 'ابتدا یک پروژه بسازید')}
              </Link>
            )}
          </div>
        </Modal>
      )}
      {/* Telegram & Client Setup Guide Modal */}
      {telegramNode && (
        <TelegramGuideModal
          open={!!telegramNode}
          onClose={() => setTelegramNode(null)}
          nodeIp={
            socksEndpoints.find(
              (endpoint) => endpoint.nodeId === telegramNode.id,
            )?.host || ''
          }
          nodePort={
            socksEndpoints.find(
              (endpoint) => endpoint.nodeId === telegramNode.id,
            )?.port
          }
          lang={lang}
        />
      )}
    </div>
  );
}
