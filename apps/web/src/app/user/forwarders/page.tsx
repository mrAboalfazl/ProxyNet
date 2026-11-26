'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  api,
  AvailableUpstreamTunnel,
  Forwarder,
  getPublicApiBase,
} from '../../../lib/api';
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
import { CountryFlag } from '../../../components/country-flag';
import { useLang } from '../../../lib/lang-context';
import { t, Lang } from '../../../lib/i18n';
import {
  AiGatewayExamplesPanel,
  CodeExamplesPanel,
  buildForwarderSnippets,
} from '../../../lib/code-examples';
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
  Cable,
  Zap,
  Sparkles,
  Route,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type RoutingMode = 'auto' | 'country' | 'tunnel' | 'direct';

type TestState =
  | { loading: true }
  | {
      loading: false;
      ok: boolean;
      status?: number;
      timeMs?: number;
      msg?: string;
    };

const AI_PRESETS = [
  { id: 'openai', label: 'OpenAI', targetUrl: 'https://api.openai.com' },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    targetUrl: 'https://openrouter.ai/api',
  },
  { id: 'opencode', label: 'OpenCode', targetUrl: 'https://opencode.ai/zen' },
  {
    id: 'anthropic',
    label: 'Anthropic',
    targetUrl: 'https://api.anthropic.com',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    targetUrl: 'https://generativelanguage.googleapis.com',
  },
] as const;

function TestBadge({ state }: { state: TestState | undefined }) {
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
      {state.timeMs !== undefined && (
        <span className="opacity-80">· {state.timeMs}ms</span>
      )}
      {state.msg && <span title={state.msg}>· {state.msg.slice(0, 20)}</span>}
    </span>
  );
}

function CountryPicker({
  value,
  options,
  onChange,
  requiresPlan,
  lang,
}: {
  value: string[];
  options: { code: string; name: string }[];
  onChange: (next: string[]) => void;
  requiresPlan: boolean;
  lang: Lang;
}) {
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const toggle = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter((item) => item !== code));
    } else {
      onChange([...value, code]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <Globe2 className="h-3.5 w-3.5 text-primary" />
        <span>{tx('Exit countries (ordered failover)', 'کشورهای خروج (ترتیب Failover)')}</span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {options.map((country) => {
          const index = value.indexOf(country.code);
          const selected = index >= 0;
          return (
            <button
              type="button"
              key={country.code}
              onClick={() => toggle(country.code)}
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              {selected && (
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {index + 1}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CountryFlag code={country.code} size={16} />
                {country.code} — {country.name}
              </span>
            </button>
          );
        })}
      </div>

      {options.length === 0 && (
        <p className="text-[11px] text-amber-600">
          {tx(
            'No exit countries available yet; switch to Auto mode.',
            'کشوری در دسترس نیست؛ حالت خودکار را انتخاب کنید.',
          )}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {value.length > 0
          ? tx(
              'Tunnels / exit nodes are tried in the numbered order (automatic failover).',
              'تانل‌ها و نودها به ترتیب شماره امتحان می‌شوند (Failover خودکار).',
            )
          : requiresPlan
            ? tx(
                'An active plan may be required to pin countries. Auto mode still works.',
                'برای انتخاب کشور ممکن است به اشتراک فعال نیاز باشد؛ حالت خودکار بدون آن هم کار می‌کند.',
              )
            : tx(
                'Select one or more countries in priority order.',
                'یک یا چند کشور را به ترتیب اولویت انتخاب کنید.',
              )}
      </p>
    </div>
  );
}

function RoutingModeSelector({
  routingMode,
  countryCodes,
  upstreamTunnelId,
  countryOptions,
  tunnels,
  requiresPlan,
  lang,
  onChangeMode,
  onChangeCountries,
  onChangeTunnel,
}: {
  routingMode: RoutingMode;
  countryCodes: string[];
  upstreamTunnelId: string;
  countryOptions: { code: string; name: string }[];
  tunnels: AvailableUpstreamTunnel[];
  requiresPlan: boolean;
  lang: Lang;
  onChangeMode: (mode: RoutingMode) => void;
  onChangeCountries: (codes: string[]) => void;
  onChangeTunnel: (id: string) => void;
}) {
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const modes: Array<{
    id: RoutingMode;
    en: string;
    fa: string;
    descEn: string;
    descFa: string;
  }> = [
    {
      id: 'auto',
      en: 'Auto',
      fa: 'خودکار (Auto)',
      descEn: 'Best healthy WireGuard / SOCKS5 tunnel with automatic failover.',
      descFa: 'بهترین تانل سالم WireGuard یا SOCKS5 با Failover خودکار.',
    },
    {
      id: 'country',
      en: 'Country',
      fa: 'انتخاب کشور',
      descEn: 'Route through specific countries in numbered failover order.',
      descFa: 'عبور از کشورهای انتخابی به ترتیب اولویت.',
    },
    {
      id: 'tunnel',
      en: 'Pinned Tunnel',
      fa: 'تانل اختصاصی',
      descEn: 'Pin requests to a specific WireGuard / AmneziaWG / SOCKS5 tunnel.',
      descFa: 'اتصال ثابت به یک تانل مشخص (وایرگارد، AmneziaWG یا SOCKS5).',
    },
    {
      id: 'direct',
      en: 'Direct',
      fa: 'مستقیم (Direct)',
      descEn: 'Direct server egress without tunnel/proxy (lowest latency).',
      descFa: 'خروج مستقیم بدون تانل و پروکسی (کمترین پینگ برای مقاصد بدون تحریم).',
    },
  ];

  const activeDesc = modes.find((m) => m.id === routingMode);

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3 bg-muted/20">
      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <Route className="h-3.5 w-3.5 text-primary" />
        <span>{tx('Routing Mode', 'حالت مسیریابی')}</span>
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChangeMode(m.id)}
            className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
              routingMode === m.id
                ? 'border-primary bg-primary/10 text-primary font-semibold'
                : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
            }`}
          >
            {lang === 'fa' ? m.fa : m.en}
          </button>
        ))}
      </div>

      {activeDesc && (
        <p className="text-[11px] text-muted-foreground">
          {lang === 'fa' ? activeDesc.descFa : activeDesc.descEn}
        </p>
      )}

      {routingMode === 'country' && (
        <CountryPicker
          value={countryCodes}
          options={countryOptions}
          requiresPlan={requiresPlan}
          lang={lang}
          onChange={onChangeCountries}
        />
      )}

      {routingMode === 'tunnel' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Cable className="h-3.5 w-3.5 text-primary" />
            <span>{tx('Select Upstream Tunnel', 'انتخاب تانل خروجی')}</span>
          </label>
          <select
            value={upstreamTunnelId}
            onChange={(e) => onChangeTunnel(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
          >
            <option value="">
              {tx('— Choose a tunnel —', '— یک تانل انتخاب کنید —')}
            </option>
            {tunnels.map((tun) => {
              const protoLabel =
                tun.protocol === 'wireguard' && tun.hasJunkObfuscation
                  ? 'WG+AntiDPI'
                  : tun.protocol.toUpperCase();
              const ping =
                tun.latencyMs !== null && tun.latencyMs !== undefined
                  ? ` · ${tun.latencyMs}ms`
                  : '';
              return (
                <option key={tun.id} value={tun.id}>
                  {tun.label} [{protoLabel} · {tun.countryCode}
                  {ping}] ({tun.status})
                </option>
              );
            })}
          </select>
          {tunnels.length === 0 && (
            <p className="text-[11px] text-amber-600">
              {tx(
                'No upstream tunnels are available yet. Ask admin to add a WireGuard/SOCKS5 tunnel, or use Auto mode.',
                'هنوز تانل خروجی فعالی ثبت نشده است. از ادمین بخواهید تانل اضافه کند یا حالت Auto را انتخاب کنید.',
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface ForwarderFormState {
  label: string;
  targetUrl: string;
  routingMode: RoutingMode;
  countryCodes: string[];
  upstreamTunnelId: string;
  streamingEnabled: boolean;
  forwardAuthHeader: boolean;
  preservePath: boolean;
  preserveQuery: boolean;
}

const EMPTY_FORM: ForwarderFormState = {
  label: '',
  targetUrl: '',
  routingMode: 'auto',
  countryCodes: [],
  upstreamTunnelId: '',
  streamingEnabled: true,
  forwardAuthHeader: true,
  preservePath: true,
  preserveQuery: true,
};

function inferRoutingMode(fwd: Forwarder): RoutingMode {
  if (
    fwd.routingMode === 'direct' ||
    fwd.routingMode === 'tunnel' ||
    fwd.routingMode === 'country' ||
    fwd.routingMode === 'auto'
  ) {
    return fwd.routingMode;
  }
  if (fwd.upstreamTunnelId) return 'tunnel';
  if (fwd.countryCodes?.length || fwd.countryCode) return 'country';
  return 'auto';
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
  const [availableTunnels, setAvailableTunnels] = useState<
    AvailableUpstreamTunnel[]
  >([]);
  const [countryRequiresPlan, setCountryRequiresPlan] = useState(false);
  const [fwds, setFwds] = useState<Forwarder[]>([]);
  const pagination = usePagination(fwds, 5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState<ForwarderFormState>(EMPTY_FORM);

  const [editingFwd, setEditingFwd] = useState<Forwarder | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editForm, setEditForm] = useState<ForwarderFormState>(EMPTY_FORM);

  const [snippetMode, setSnippetMode] = useState<'ai' | 'generic'>('ai');

  function openEdit(fwd: Forwarder) {
    setEditingFwd(fwd);
    setEditForm({
      label: fwd.label,
      targetUrl: fwd.targetUrl,
      routingMode: inferRoutingMode(fwd),
      countryCodes: fwd.countryCodes?.length
        ? fwd.countryCodes
        : fwd.countryCode
          ? [fwd.countryCode]
          : [],
      upstreamTunnelId: fwd.upstreamTunnelId ?? '',
      streamingEnabled: fwd.streamingEnabled ?? true,
      forwardAuthHeader: fwd.forwardAuthHeader,
      preservePath: fwd.preservePath,
      preserveQuery: fwd.preserveQuery,
    });
  }

  async function handleUpdate() {
    if (!editingFwd || !editForm.label.trim() || !editForm.targetUrl.trim()) {
      return;
    }
    setUpdating(true);
    try {
      await api.forwarders.update(editingFwd.id, {
        label: editForm.label.trim(),
        targetUrl: editForm.targetUrl.trim(),
        routingMode: editForm.routingMode,
        countryCodes:
          editForm.routingMode === 'country' && editForm.countryCodes.length
            ? editForm.countryCodes
            : null,
        upstreamTunnelId:
          editForm.routingMode === 'tunnel' && editForm.upstreamTunnelId
            ? editForm.upstreamTunnelId
            : null,
        streamingEnabled: editForm.streamingEnabled,
        forwardAuthHeader: editForm.forwardAuthHeader,
        preservePath: editForm.preservePath,
        preserveQuery: editForm.preserveQuery,
      });
      setEditingFwd(null);
      toast.success(
        tx('Forwarder updated successfully', 'مسیر با موفقیت ویرایش شد'),
      );
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
      const [data, socks, tunnels] = await Promise.all([
        api.forwarders.list(),
        api.socks5
          .endpoints()
          .catch(() => ({ endpoints: [], requiresActivePlan: false })),
        api.upstreams
          .available()
          .catch(() => [] as AvailableUpstreamTunnel[]),
      ]);
      setUserSlug(data.userSlug);
      setFwds(data.forwarders);
      setAvailableTunnels(tunnels);

      const countries = new Map<string, string>();
      for (const endpoint of socks.endpoints) {
        countries.set(endpoint.countryCode, endpoint.countryName);
      }
      for (const tun of tunnels) {
        if (!countries.has(tun.countryCode)) {
          countries.set(
            tun.countryCode,
            tun.country?.name || tun.countryCode,
          );
        }
      }
      setCountryOptions(
        Array.from(countries, ([code, name]) => ({ code, name })),
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
        routingMode: form.routingMode,
        countryCodes:
          form.routingMode === 'country' && form.countryCodes.length
            ? form.countryCodes
            : null,
        upstreamTunnelId:
          form.routingMode === 'tunnel' && form.upstreamTunnelId
            ? form.upstreamTunnelId
            : null,
        streamingEnabled: form.streamingEnabled,
        forwardAuthHeader: form.forwardAuthHeader,
        preservePath: form.preservePath,
        preserveQuery: form.preserveQuery,
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      toast.success(
        tx('Forwarder created successfully', 'مسیر جدید با موفقیت ایجاد شد'),
      );
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
          : tx('Forwarder deactivated', 'مسیر غیرفعال شد'),
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
                `سرور مقصد (${fwd.targetUrl}) اتصال را رد کرد (ECONNREFUSED). لطفاً مطمئن شوید سرویس مقصد روشن و در دسترس است.`,
              ),
              { duration: 7000 },
            );
            detailMsg = 'ECONNREFUSED';
          } else if (bodyJson.error === 'upstream_relay_error') {
            toast.error(
              tx(
                `Target server is unreachable (${fwd.targetUrl})`,
                `سرور مقصد در دسترس نیست (${fwd.targetUrl})`,
              ),
              { duration: 6000 },
            );
            detailMsg = '502 Unreachable';
          } else {
            toast.error(
              bodyJson.message ||
                bodyJson.error ||
                tx(`HTTP error: ${r.status}`, `خطای پاسخ سرور: ${r.status}`),
            );
          }
        } catch {
          toast.error(
            tx(`HTTP error: ${r.status}`, `خطای پاسخ سرور: ${r.status}`),
          );
        }
      } else {
        toast.success(
          tx(
            `Forwarder OK (${timeMs}ms)`,
            `تست موفق بود (${timeMs} میلی‌ثانیه)`,
          ),
        );
        setTimeout(load, 500);
      }
      setTestResults((s) => ({
        ...s,
        [fwd.id]: {
          loading: false,
          ok: r.ok,
          status: r.status,
          timeMs,
          msg: detailMsg,
        },
      }));
    } catch (e) {
      const timeMs = Math.round(performance.now() - started);
      const errMsg = e instanceof Error ? e.message : 'network error';
      setTestResults((s) => ({
        ...s,
        [fwd.id]: { loading: false, ok: false, timeMs, msg: errMsg },
      }));
      toast.error(
        tx(`Connection failed: ${errMsg}`, `عدم برقراری ارتباط: ${errMsg}`),
      );
    }
  }

  function copyUrl(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(
      tx('Gateway URL copied to clipboard', 'آدرس درگاه در کلیپ‌بورد کپی شد'),
    );
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
    featuredForwarder && userSlug
      ? `${apiBase}/f/${userSlug}/${featuredForwarder.slug}`
      : null;

  function renderRoutingSummary(fwd: Forwarder) {
    const mode = inferRoutingMode(fwd);
    if (mode === 'direct') {
      return (
        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
          <Zap className="h-3.5 w-3.5" />
          {tx('Direct (Local)', 'مستقیم (بدون تانل)')}
        </span>
      );
    }
    if (mode === 'tunnel') {
      const tun =
        fwd.upstreamTunnel ??
        availableTunnels.find((t) => t.id === fwd.upstreamTunnelId);
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-foreground" dir="ltr">
          <Cable className="h-3.5 w-3.5 text-primary" />
          {tun
            ? `${tun.label} (${tun.protocol.toUpperCase()} · ${tun.countryCode})`
            : `#${fwd.upstreamTunnelId}`}
        </span>
      );
    }
    if (mode === 'country') {
      return (
        <span className="font-mono text-foreground" dir="ltr">
          {fwd.countryCodes?.length
            ? fwd.countryCodes.join(' → ')
            : fwd.countryCode || tx('Auto', 'خودکار')}
        </span>
      );
    }
    return (
      <span className="text-foreground font-medium">
        {tx('Auto (Best WireGuard / Tunnel)', 'خودکار (بهترین تانل سالم)')}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(lang, 'fwd.title')}
        description={tx(
          'Create high-speed AI Gateways (OpenAI, OpenRouter, OpenCode) and webhook forwarders routed over WireGuard / AmneziaWG / SOCKS5 with true SSE streaming.',
          'ایجاد درگاه‌های پرسرعت هوش مصنوعی (OpenAI، OpenRouter، OpenCode) و فورواردرها با عبور از تانل‌های WireGuard / AmneziaWG / SOCKS5 و استریم واقعی SSE.',
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
          className="sm:max-w-[600px]"
        >
          <div className="space-y-4 pt-2">
            {/* 1-click AI Gateway Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>
                  {tx('Quick AI Gateway Presets', 'پریست سریع درگاه‌های هوش مصنوعی')}
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AI_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        label: preset.label,
                        targetUrl: preset.targetUrl,
                        streamingEnabled: true,
                        forwardAuthHeader: true,
                        preservePath: true,
                        preserveQuery: true,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                      form.targetUrl === preset.targetUrl
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/40 text-foreground'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

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

            <RoutingModeSelector
              routingMode={form.routingMode}
              countryCodes={form.countryCodes}
              upstreamTunnelId={form.upstreamTunnelId}
              countryOptions={countryOptions}
              tunnels={availableTunnels}
              requiresPlan={countryRequiresPlan}
              lang={lang}
              onChangeMode={(mode) =>
                setForm((f) => ({ ...f, routingMode: mode }))
              }
              onChangeCountries={(codes) =>
                setForm((f) => ({ ...f, countryCodes: codes }))
              }
              onChangeTunnel={(id) =>
                setForm((f) => ({ ...f, upstreamTunnelId: id }))
              }
            />

            <div className="space-y-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="streamingEnabled"
                  checked={form.streamingEnabled}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, streamingEnabled: !!checked }))
                  }
                />
                <label
                  htmlFor="streamingEnabled"
                  className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
                >
                  {tx(
                    'Enable zero-buffer SSE streaming (recommended for AI chat / OpenCode)',
                    'فعال‌سازی استریم زنده SSE بدون بافر (پیشنهادی برای OpenAI / OpenCode)',
                  )}
                </label>
              </div>

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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreate(false)}
              >
                {t(lang, 'cancel')}
              </Button>
              <Button
                size="sm"
                onClick={create}
                disabled={
                  creating ||
                  !form.label.trim() ||
                  !form.targetUrl.trim() ||
                  (form.routingMode === 'tunnel' && !form.upstreamTunnelId)
                }
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
          className="sm:max-w-[600px]"
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
                'e.g. https://api.openai.com or https://openrouter.ai/api',
                'مثال: https://api.openai.com یا https://openrouter.ai/api',
              )}
              dir="ltr"
              required
            />

            <RoutingModeSelector
              routingMode={editForm.routingMode}
              countryCodes={editForm.countryCodes}
              upstreamTunnelId={editForm.upstreamTunnelId}
              countryOptions={countryOptions}
              tunnels={availableTunnels}
              requiresPlan={countryRequiresPlan}
              lang={lang}
              onChangeMode={(mode) =>
                setEditForm((f) => ({ ...f, routingMode: mode }))
              }
              onChangeCountries={(codes) =>
                setEditForm((f) => ({ ...f, countryCodes: codes }))
              }
              onChangeTunnel={(id) =>
                setEditForm((f) => ({ ...f, upstreamTunnelId: id }))
              }
            />

            <div className="space-y-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="editStreamingEnabled"
                  checked={editForm.streamingEnabled}
                  onCheckedChange={(checked) =>
                    setEditForm((f) => ({ ...f, streamingEnabled: !!checked }))
                  }
                />
                <label
                  htmlFor="editStreamingEnabled"
                  className="text-xs font-medium leading-none cursor-pointer select-none text-foreground"
                >
                  {tx(
                    'Enable zero-buffer SSE streaming (recommended for AI chat / OpenCode)',
                    'فعال‌سازی استریم زنده SSE بدون بافر (پیشنهادی برای OpenAI / OpenCode)',
                  )}
                </label>
              </div>

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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingFwd(null)}
              >
                {t(lang, 'cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={
                  updating ||
                  !editForm.label.trim() ||
                  !editForm.targetUrl.trim() ||
                  (editForm.routingMode === 'tunnel' &&
                    !editForm.upstreamTunnelId)
                }
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
            const mode = inferRoutingMode(fwd);

            return (
              <Card key={fwd.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">
                          {fwd.label}
                        </span>
                        <Badge
                          label={
                            fwd.enabled
                              ? tx('Active', 'فعال')
                              : tx('Inactive', 'غیرفعال')
                          }
                          variant={fwd.enabled ? 'success' : 'secondary'}
                        />
                        {fwd.streamingEnabled !== false && (
                          <Badge label="SSE Stream" variant="outline" />
                        )}
                        {mode === 'direct' && (
                          <Badge
                            label={tx('Direct', 'مستقیم')}
                            variant="warning"
                          />
                        )}
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
                      <TestBadge state={testResults[fwd.id]} />
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
                          {fwd.enabled
                            ? t(lang, 'fwd.disable')
                            : t(lang, 'fwd.enable')}
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
                            <span className="text-emerald-600">
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
                      {tx('Route:', 'مسیر خروج:')}
                    </span>
                    {renderRoutingSummary(fwd)}
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              {fwds.length > 1 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t(lang, 'examples.select_forwarder')}:
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs font-normal border-input bg-background"
                      >
                        <span>{featuredForwarder?.label ?? '—'}</span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="min-w-[8rem] p-1"
                    >
                      {fwds.map((f) => {
                        const isSelected =
                          f.id === (featuredForwarder?.id ?? '');
                        return (
                          <DropdownMenuItem
                            key={f.id}
                            onClick={() => setExampleFwdId(f.id)}
                            className={cn(
                              'text-xs cursor-pointer flex items-center justify-between px-2.5 py-1.5',
                              isSelected &&
                                'font-semibold bg-accent text-accent-foreground',
                            )}
                          >
                            <span>{f.label}</span>
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSnippetMode('ai')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    snippetMode === 'ai'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tx('AI Gateway & SSE', 'درگاه هوش مصنوعی / استریم')}
                </button>
                <button
                  type="button"
                  onClick={() => setSnippetMode('generic')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    snippetMode === 'generic'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tx('Generic HTTP', 'HTTP عمومی')}
                </button>
              </div>
            </div>

            {snippetMode === 'ai' ? (
              <AiGatewayExamplesPanel
                lang={lang}
                forwarderUrl={featuredUrl}
                targetUrl={featuredForwarder?.targetUrl}
              />
            ) : (
              <CodeExamplesPanel
                lang={lang}
                intro={t(lang, 'examples.intro.forwarder')}
                snippets={buildForwarderSnippets(featuredUrl)}
              />
            )}
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
