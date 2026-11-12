'use client';

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
import { api, Country, Node } from '../../../lib/api';
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
  'curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh | sudo bash -s -- --panel https://panel.civonex.ir --token';
const DOCS_URL = 'https://github.com/mrAboalfazl/ProxyNet#readme';

const faCountryNames: Record<string, string> = {
  DE: 'آلمان',
  FR: 'فرانسه',
  NL: 'هلند',
  TR: 'ترکیه',
  GB: 'بریتانیا',
  US: 'ایالات متحده',
};

function displayCountry(country: { code: string; name?: string }, lang: string) {
  return lang === 'fa' ? faCountryNames[country.code] ?? (country.name || country.code) : (country.name || country.code);
}

function getCountryFlag(code?: string) {
  if (!code || code.length !== 2) return '🌐';
  const offset = 127397;
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + offset))
    .join('');
}

function formatUptime(secondsStr?: string | null, isFa = false) {
  if (!secondsStr) return null;
  const sec = parseInt(secondsStr, 10);
  if (isNaN(sec) || sec <= 0) return null;
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  if (days > 0) {
    return isFa ? `${toPersianDigits(days)} روز و ${toPersianDigits(hours)} ساعت` : `${days}d ${hours}h`;
  }
  const mins = Math.floor((sec % 3600) / 60);
  return isFa ? `${toPersianDigits(hours)} ساعت و ${toPersianDigits(mins)} دقیقه` : `${hours}h ${mins}m`;
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
  const [newToken, setNewToken] = useState<{
    nodeId: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load(showSpinner = true, showToast = false) {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await api.myNodes.list();
      setNodes(result);
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
      .then(setCountries)
      .catch(() => setCountries([]));
  }, []);

  const stats = useMemo(
    () => ({
      total: nodes.length,
      healthy: nodes.filter((node) => node.status === 'healthy').length,
      pending: nodes.filter((node) => node.status === 'pending' || !node.nodeSecretHash).length,
    }),
    [nodes]
  );

  const installCommand = newToken ? `${INSTALL_COMMAND} ${newToken.token}` : '';

  async function addNode() {
    if (!label.trim() || !countryCode) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.myNodes.create({
        label: label.trim(),
        countryCode,
      });
      setNewToken({
        nodeId: res.node.id,
        token: res.token,
        expiresAt: res.expiresAt,
      });
      setShowAdd(false);
      setLabel('');
      setCountryCode('');
      toast.success(tx('Node registered successfully', 'نود با موفقیت ثبت شد'));
      await load(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add node';
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function copyInstallCommand() {
    if (!installCommand) return;
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      toast.success(tx('Install command copied to clipboard', 'دستور نصب در کلیپ‌بورد کپی شد'));
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error(
        lang === 'fa'
          ? 'کپی خودکار انجام نشد؛ دستور را دستی کپی کنید.'
          : 'Could not copy automatically; copy the command manually.'
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(lang, 'nodes.title')}
        description={tx(
          'Connect your own servers as exit relays or forwarders in the ProxyNet pool.',
          'اتصال سرورهای اختصاصی خود به عنوان نودهای خروج یا رله در استخر شبکه پروکسی‌نت.'
        )}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(false, true)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{t(lang, 'nodes.refresh')}</span>
            </Button>
            <Button onClick={() => setShowAdd(true)} size="sm">
              <Plus className="h-4 w-4" />
              <span>{t(lang, 'nodes.add')}</span>
            </Button>
          </div>
        }
      />

      {error && <Alert message={error} type="error" />}

      {/* Hero Intro Card */}
      <Card className="bg-gradient-to-br from-primary/5 via-card to-card border-border/80">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
                <Server className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  {t(lang, 'nodes.kicker')}
                </span>
                <h2 className="text-lg font-bold">{t(lang, 'nodes.hero_title')}</h2>
                <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
                  {t(lang, 'nodes.hero_desc')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <Button onClick={() => setShowAdd(true)} size="sm">
                <Plus className="h-4 w-4" />
                <span>{t(lang, 'nodes.add')}</span>
              </Button>
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <span>{t(lang, 'nodes.view_guide')}</span>
                  <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            {t(lang, 'nodes.healthy_count')}
          </span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {lang === 'fa' ? toPersianDigits(stats.healthy) : stats.healthy}
          </div>
        </Card>
        <Card className="p-4 border-border/70">
          <span className="text-xs font-medium text-muted-foreground">
            {t(lang, 'nodes.pending_count')}
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
                <CardTitle className="text-base">{t(lang, 'nodes.install_title')}</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewToken(null)}
                className="text-muted-foreground"
              >
                ✕
              </Button>
            </div>
            <CardDescription className="text-xs">{t(lang, 'nodes.install_hint')}</CardDescription>
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
                  <span className="text-zinc-300 font-sans text-xs">terminal — bash</span>
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
                      <span className="text-emerald-400">{t(lang, 'nodes.copied')}</span>
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
                {t(lang, 'nodes.expires')}: {formatDate(newToken.expiresAt, lang)}
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
          onClose={() => setShowAdd(false)}
          open={showAdd}
        >
          <div className="space-y-4 pt-2">
            <Input
              label={tx('Node Label / Hostname', 'برچسب یا نام سرور')}
              placeholder="e.g. Frankfurt-Relay-01"
              value={label}
              onChange={setLabel}
              required
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {tx('Country Location', 'موقعیت کشور سرور')}
              </label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{tx('Select Country…', 'انتخاب کشور…')}</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {displayCountry(c, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>
                {t(lang, 'cancel')}
              </Button>
              <Button size="sm" onClick={addNode} disabled={creating || !label.trim() || !countryCode}>
                {creating ? '...' : t(lang, 'nodes.add')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Nodes List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t(lang, 'nodes.your_nodes')}</h2>
          <span className="text-xs text-muted-foreground">
            {lang === 'fa' ? toPersianDigits(nodes.length) : nodes.length} {tx('nodes total', 'نود')}
          </span>
        </div>

        {loading ? (
          <Spinner />
        ) : nodes.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground space-y-3">
            <Server className="h-8 w-8 mx-auto text-muted-foreground/60" />
            <p className="font-semibold">{t(lang, 'nodes.empty')}</p>
            <p className="text-xs">{t(lang, 'nodes.empty_msg')}</p>
            <Button onClick={() => setShowAdd(true)} size="sm">
              <Plus className="h-4 w-4" />
              <span>{t(lang, 'nodes.add')}</span>
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pagination.paginatedItems.map((node) => {
                const healthy = node.status === 'healthy';
                const ip = node.ipv4Address || '91.223.61.106';
                const uptimeText = formatUptime(node.uptimeSeconds, lang === 'fa');

                return (
                  <Card key={node.id} className="overflow-hidden border-border/80 shadow-xs hover:border-border transition-colors">
                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/15">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base" role="img" aria-label={node.countryCode}>
                              {getCountryFlag(node.countryCode)}
                            </span>
                            <span className="font-bold text-sm text-foreground">{node.label}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border">
                              #{node.id}
                            </span>
                          </div>
                          <CardDescription className="text-xs">
                            {displayCountry({ code: node.countryCode, name: node.countryCode }, lang)} · {t(lang, 'nodes.created')}: {formatDate(node.createdAt, lang)}
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
                            <span className={`h-2 w-2 rounded-full ${healthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                            <span>{healthy ? tx('Online', 'آنلاین و فعال') : node.status}</span>
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3 text-xs">
                      {/* IP & Hostname Bar */}
                      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/70 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Server className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] text-muted-foreground block">{tx('Public IP / Host', 'آدرس آی‌پی عمومی سرور')}</span>
                            <span className="font-mono font-semibold text-foreground text-xs" dir="ltr">{ip}</span>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
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
                              <span className="text-emerald-600 font-semibold">{tx('Copied', 'کپی شد')}</span>
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
                          <span className="text-[11px] text-muted-foreground block">{tx('Hostname / OS', 'میزبان و سیستم‌عامل')}</span>
                          <span className="font-medium text-foreground truncate block font-mono text-[11px]">
                            {node.hostname || 'webdade'} · {node.osName || 'linux'}
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-muted/20 border border-border/50 space-y-0.5">
                          <span className="text-[11px] text-muted-foreground block">{tx('CPU & Uptime', 'پردازنده و آپ‌تایم')}</span>
                          <span className="font-medium text-foreground truncate block">
                            {node.cpuCores ? `${lang === 'fa' ? toPersianDigits(node.cpuCores) : node.cpuCores} Cores` : '2 Cores'}
                            {uptimeText ? ` · ${uptimeText}` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Roles & Protocols Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[11px] text-muted-foreground font-medium mr-1">
                          {tx('Protocols:', 'پروتکل‌ها:')}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20">
                          <span>SOCKS5</span>
                          <span className="font-mono text-[10px] opacity-75">:1080</span>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                          <span>HTTP Relay</span>
                        </span>
                        {node.roles?.map((role) => (
                          <span key={role} className="px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground border">
                            {role}
                          </span>
                        ))}
                      </div>

                      {/* Action Bar */}
                      <div className="pt-2 border-t border-border/60">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 text-xs text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/10"
                          onClick={() => setTelegramNode(node)}
                        >
                          <Send className="h-3.5 w-3.5 text-sky-500" />
                          <span>{tx('Telegram & Client Setup Guide', 'راهنمای اتصال به تلگرام و سرور')}</span>
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
      {/* Telegram & Client Setup Guide Modal */}
      {telegramNode && (
        <TelegramGuideModal
          open={!!telegramNode}
          onClose={() => setTelegramNode(null)}
          nodeIp={telegramNode.ipv4Address || '91.223.61.106'}
          nodePort={1080}
          lang={lang}
        />
      )}
    </div>
  );
}
