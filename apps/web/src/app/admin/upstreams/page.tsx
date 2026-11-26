'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  Country,
  Node,
  UpstreamProtocol,
  UpstreamTunnel,
  WireguardJunkConfig,
} from '../../../lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
  Table,
  Td,
  Tr,
  formatDateTime,
  toPersianDigits,
  usePagination,
} from '../../../lib/ui';
import { CountryFlag } from '../../../components/country-flag';
import { useLang } from '../../../lib/lang-context';
import {
  Activity,
  Cable,
  CheckCircle2,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

type ModePreset = 'wg' | 'wg-junk' | 'amneziawg' | 'socks5' | 'http';

interface FormState {
  label: string;
  mode: ModePreset;
  hostNodeId: string;
  countryCode: string;
  rawConfig: string;
  mtu: string;
  priority: string;
  enabled: boolean;
  // Anti-DPI Junk fields
  jc: string;
  jmin: string;
  jmax: string;
  s1: string;
  s2: string;
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  i1: string;
}

const DEFAULT_FORM: FormState = {
  label: '',
  mode: 'wg-junk',
  hostNodeId: '',
  countryCode: 'DE',
  rawConfig: '',
  mtu: '1280',
  priority: '100',
  enabled: true,
  jc: '4',
  jmin: '50',
  jmax: '1000',
  s1: '0',
  s2: '0',
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
  i1: '',
};

function formatBytes(raw: string | number | undefined): string {
  const n = Number(raw || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val < 10 && idx > 0 ? val.toFixed(1) : Math.round(val)} ${units[idx]}`;
}

function parseClientConfPreview(raw: string): {
  endpoint?: string;
  address?: string;
  mtu?: string;
  hasAwgHeaders?: boolean;
  jc?: string;
  jmin?: string;
  jmax?: string;
  s1?: string;
  s2?: string;
  h1?: string;
  h2?: string;
  h3?: string;
  h4?: string;
  i1?: string;
} {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.split('#')[0].trim();
    const eq = clean.indexOf('=');
    if (eq <= 0) continue;
    const k = clean.slice(0, eq).trim().toLowerCase();
    const v = clean.slice(eq + 1).trim();
    if (v) out[k] = v;
  }
  const hasAwgHeaders = Boolean(
    (out.s1 && out.s1 !== '0') ||
      (out.s2 && out.s2 !== '0') ||
      (out.h1 && out.h1 !== '1') ||
      (out.h2 && out.h2 !== '2') ||
      (out.h3 && out.h3 !== '3') ||
      (out.h4 && out.h4 !== '4'),
  );
  return {
    endpoint: out.endpoint,
    address: out.address,
    mtu: out.mtu,
    hasAwgHeaders,
    jc: out.jc,
    jmin: out.jmin,
    jmax: out.jmax,
    s1: out.s1,
    s2: out.s2,
    h1: out.h1,
    h2: out.h2,
    h3: out.h3,
    h4: out.h4,
    i1: out.i1,
  };
}

function protocolBadge(t: UpstreamTunnel) {
  if (t.protocol === 'amneziawg') {
    return <Badge label="AmneziaWG" variant="default" />;
  }
  if (t.protocol === 'wireguard') {
    return (
      <Badge
        label={t.hasJunkObfuscation ? 'WG + Anti-DPI' : 'WireGuard'}
        variant={t.hasJunkObfuscation ? 'success' : 'outline'}
      />
    );
  }
  return <Badge label={t.protocol.toUpperCase()} variant="secondary" />;
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case 'healthy':
      return 'success';
    case 'degraded':
    case 'pending':
      return 'warning';
    case 'unhealthy':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function AiBadge({ name, ok }: { name: string; ok?: boolean }) {
  if (ok === undefined) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
        {name}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        ok
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
          : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-2.5 w-2.5" />
      ) : (
        <XCircle className="h-2.5 w-2.5" />
      )}
      {name}
    </span>
  );
}

export default function AdminUpstreamsPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [tunnels, setTunnels] = useState<UpstreamTunnel[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<UpstreamTunnel | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pagination = usePagination(tunnels, 10);

  async function load() {
    setLoading(true);
    try {
      const [ups, nds, ctrs] = await Promise.all([
        api.upstreams.listAdmin(),
        api.nodes.list().catch(() => [] as Node[]),
        api.countries.listAdmin().catch(() => [] as Country[]),
      ]);
      setTunnels(ups);
      setNodes(nds);
      setCountries(ctrs);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to load upstream tunnels',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const healthy = tunnels.filter((t) => t.status === 'healthy').length;
    const wgCount = tunnels.filter(
      (t) => t.protocol === 'wireguard' || t.protocol === 'amneziawg',
    ).length;
    const totalReq = tunnels.reduce(
      (sum, t) => sum + Number(t.requestCount || 0),
      0,
    );
    return { total: tunnels.length, healthy, wgCount, totalReq };
  }, [tunnels]);

  const preview = useMemo(() => {
    if (form.mode === 'socks5' || form.mode === 'http') return null;
    if (!form.rawConfig.trim()) return null;
    return parseClientConfPreview(form.rawConfig);
  }, [form.rawConfig, form.mode]);

  function openCreate() {
    setEditing(null);
    const defaultNode =
      nodes.find((n) => n.countryCode === 'IR' && n.status === 'active') ??
      nodes.find((n) => n.status === 'active') ??
      nodes[0];
    const defaultCountry =
      countries.find((c) => c.code === 'DE' && c.enabled)?.code ??
      countries.find((c) => c.enabled)?.code ??
      'DE';
    setForm({
      ...DEFAULT_FORM,
      hostNodeId: defaultNode?.id ?? '',
      countryCode: defaultCountry,
    });
    setShowModal(true);
  }

  function openEdit(t: UpstreamTunnel) {
    setEditing(t);
    let mode: ModePreset = 'wg';
    if (t.protocol === 'amneziawg') mode = 'amneziawg';
    else if (t.protocol === 'wireguard')
      mode = t.hasJunkObfuscation ? 'wg-junk' : 'wg';
    else if (t.protocol === 'socks5') mode = 'socks5';
    else mode = 'http';

    setForm({
      ...DEFAULT_FORM,
      label: t.label,
      mode,
      hostNodeId: t.hostNodeId ?? '',
      countryCode: t.countryCode,
      rawConfig: '',
      mtu: String(t.mtu ?? 1280),
      priority: String(t.priority ?? 100),
      enabled: t.enabled,
    });
    setShowModal(true);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseClientConfPreview(content);
      setForm((prev) => {
        const nextMode: ModePreset = parsed.hasAwgHeaders
          ? 'amneziawg'
          : prev.mode === 'socks5' || prev.mode === 'http'
            ? 'wg-junk'
            : prev.mode;
        const baseName = file.name.replace(/\.(conf|txt)$/i, '');
        return {
          ...prev,
          label: prev.label || baseName,
          mode: nextMode,
          rawConfig: content,
          mtu: parsed.mtu || prev.mtu,
          jc: parsed.jc || prev.jc,
          jmin: parsed.jmin || prev.jmin,
          jmax: parsed.jmax || prev.jmax,
          s1: parsed.s1 || prev.s1,
          s2: parsed.s2 || prev.s2,
          h1: parsed.h1 || prev.h1,
          h2: parsed.h2 || prev.h2,
          h3: parsed.h3 || prev.h3,
          h4: parsed.h4 || prev.h4,
          i1: parsed.i1 || prev.i1,
        };
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function buildPayload() {
    const protocol: UpstreamProtocol =
      form.mode === 'wg' || form.mode === 'wg-junk' ? 'wireguard' : form.mode;
    const isWg = protocol === 'wireguard' || protocol === 'amneziawg';

    let junk: WireguardJunkConfig | null | undefined = undefined;
    if (form.mode === 'wg-junk') {
      junk = {
        jc: Number(form.jc) || 4,
        jmin: Number(form.jmin) || 50,
        jmax: Number(form.jmax) || 1000,
        ...(form.i1.trim() ? { i1: form.i1.trim() } : {}),
      };
    } else if (form.mode === 'amneziawg') {
      junk = {
        jc: Number(form.jc) || 0,
        jmin: Number(form.jmin) || 0,
        jmax: Number(form.jmax) || 0,
        s1: Number(form.s1) || 0,
        s2: Number(form.s2) || 0,
        h1: Number(form.h1) || 1,
        h2: Number(form.h2) || 2,
        h3: Number(form.h3) || 3,
        h4: Number(form.h4) || 4,
        ...(form.i1.trim() ? { i1: form.i1.trim() } : {}),
      };
    } else if (form.mode === 'wg') {
      junk = null;
    }

    const mtu = isWg ? Number(form.mtu) || 1280 : null;
    const priority = Number(form.priority) || 100;

    return {
      label: form.label.trim(),
      protocol,
      hostNodeId: form.hostNodeId || null,
      countryCode: form.countryCode.trim().toUpperCase(),
      rawConfig: form.rawConfig.trim(),
      junk,
      mtu,
      priority,
      enabled: form.enabled,
    };
  }

  async function save() {
    const payload = buildPayload();
    if (!payload.label || !payload.countryCode) return;
    if (!editing && !payload.rawConfig) return;

    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editing) {
        const patch: Parameters<typeof api.upstreams.update>[1] = {
          label: payload.label,
          protocol: payload.protocol,
          hostNodeId: payload.hostNodeId,
          countryCode: payload.countryCode,
          priority: payload.priority,
          enabled: payload.enabled,
          mtu: payload.mtu,
        };
        if (payload.rawConfig) {
          patch.rawConfig = payload.rawConfig;
          patch.junk = payload.junk;
        }
        await api.upstreams.update(editing.id, patch);
        setNotice(
          tx(
            'Upstream tunnel updated. Host node will apply changes within 30s.',
            'تانل خروجی ویرایش شد. نود میزبان حداکثر تا ۳۰ ثانیه تغییرات را اعمال می‌کند.',
          ),
        );
      } else {
        await api.upstreams.create(payload);
        setNotice(
          tx(
            'Upstream tunnel created! Host node will sync it within 30s — you can also click "Test" now.',
            'تانل خروجی ثبت شد! نود میزبان تا ۳۰ ثانیه آن را همگام‌سازی می‌کند — می‌توانید هم‌اکنون دکمه «تست» را بزنید.',
          ),
        );
      }
      setShowModal(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save tunnel');
    } finally {
      setSaving(false);
    }
  }

  async function runTest(t: UpstreamTunnel) {
    setTestingId(t.id);
    setError('');
    setNotice('');
    try {
      const res = await api.upstreams.test(t.id);
      if (res.ok) {
        setNotice(
          tx(
            `Tunnel "${t.label}" is healthy — Exit IP: ${res.exitIp ?? '?'} (${res.latencyMs ?? '?'}ms)`,
            `تانل «${t.label}» سالم است — آی‌پی خروجی: ${res.exitIp ?? '?'} (${res.latencyMs ?? '?'}ms)`,
          ),
        );
      } else {
        setError(
          tx(
            `Probe failed for "${t.label}": ${res.error || 'unknown error'}`,
            `تست تانل «${t.label}» ناموفق بود: ${res.error || 'خطای نامشخص'}`,
          ),
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Live probe failed');
    } finally {
      setTestingId(null);
    }
  }

  async function toggleEnabled(t: UpstreamTunnel) {
    setError('');
    try {
      await api.upstreams.update(t.id, { enabled: !t.enabled });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle tunnel');
    }
  }

  async function removeTunnel(t: UpstreamTunnel) {
    if (
      !confirm(
        tx(
          `Delete upstream tunnel "${t.label}"?`,
          `تانل خروجی «${t.label}» حذف شود؟`,
        ),
      )
    ) {
      return;
    }
    setError('');
    try {
      await api.upstreams.remove(t.id);
      setNotice(tx(`Deleted "${t.label}"`, `تانل «${t.label}» حذف شد.`));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete tunnel');
    }
  }

  const isWgMode =
    form.mode === 'wg' || form.mode === 'wg-junk' || form.mode === 'amneziawg';

  return (
    <div>
      <PageHeader
        title={tx('Upstream Tunnels (WireGuard / AmneziaWG / SOCKS5)', 'تانل‌های خروجی (WireGuard / AmneziaWG / SOCKS5)')}
        description={tx(
          'Import third-party WireGuard .conf files (with optional Anti-DPI Junk packets) or SOCKS5 proxies and attach them to your Iran/host nodes for high-speed AI Gateway streaming.',
          'فایل‌های کانفیگ WireGuard خریداری‌شده (با قابلیت ضد فیلتر AmneziaWG Junk) یا پروکسی‌های SOCKS5 را وارد کرده و روی نود ایران/میزبان فعال کنید.',
        )}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              <span>{tx('Refresh', 'بروزرسانی')}</span>
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              <span>{tx('Add Tunnel', 'افزودن تانل')}</span>
            </Button>
          </div>
        }
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert message={error} type="error" />
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 16 }}>
          <Alert message={notice} type="success" />
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={tx('Total Tunnels', 'کل تانل‌ها')}
          value={lang === 'fa' ? toPersianDigits(stats.total) : stats.total}
          icon={Cable}
        />
        <StatCard
          label={tx('Healthy', 'سالم و فعال')}
          value={lang === 'fa' ? toPersianDigits(stats.healthy) : stats.healthy}
          color="#16a34a"
          icon={Activity}
        />
        <StatCard
          label={tx('WireGuard / AWG', 'وایرگارد / AWG')}
          value={lang === 'fa' ? toPersianDigits(stats.wgCount) : stats.wgCount}
          icon={Shield}
        />
        <StatCard
          label={tx('Total Requests', 'کل درخواست‌ها')}
          value={
            lang === 'fa'
              ? toPersianDigits(stats.totalReq)
              : stats.totalReq.toLocaleString()
          }
        />
      </div>

      {loading ? (
        <Spinner />
      ) : tunnels.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            {tx(
              'No upstream tunnels configured yet. Add a WireGuard .conf or SOCKS5 proxy to start routing AI Gateways.',
              'هنوز هیچ تانل خروجی ثبت نشده است. اولین کانفیگ WireGuard یا SOCKS5 خود را اضافه کنید.',
            )}
          </p>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span>{tx('Add First Tunnel', 'افزودن اولین تانل')}</span>
          </Button>
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <Table
              headers={[
                tx('Label / Endpoint', 'عنوان / مقصد'),
                tx('Protocol', 'پروتکل'),
                tx('Host Node', 'نود میزبان'),
                tx('Country', 'کشور'),
                tx('Exit IP / Ping', 'آی‌پی خروج / پینگ'),
                tx('AI Gateways', 'دسترسی هوش مصنوعی'),
                tx('Status', 'وضعیت'),
                tx('Usage', 'مصرف'),
                tx('Actions', 'عملیات'),
              ]}
            >
              {pagination.paginatedItems.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    <div className="font-semibold text-sm">{t.label}</div>
                    <div
                      className="text-xs text-muted-foreground font-mono"
                      dir="ltr"
                    >
                      {t.endpointPreview}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {tx(`Priority ${t.priority}`, `اولویت ${t.priority}`)}
                      {t.mtu ? ` · MTU ${t.mtu}` : ''}
                    </div>
                  </Td>
                  <Td>{protocolBadge(t)}</Td>
                  <Td>
                    {t.hostNode ? (
                      <div>
                        <div className="text-xs font-medium">
                          {t.hostNode.label}
                        </div>
                        <div
                          className="text-[11px] text-muted-foreground font-mono"
                          dir="ltr"
                        >
                          {t.hostNode.ipv4Address || t.hostNode.countryCode}:
                          {t.hostNode.tunnelProxyPort || 9444}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {tx('Local Engine', 'موتور محلی')}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono">
                      <CountryFlag code={t.countryCode} size={16} />
                      <span>{t.countryCode}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="font-mono text-xs" dir="ltr">
                      {t.exitIp || '—'}
                    </div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">
                      {t.latencyMs !== null && t.latencyMs !== undefined
                        ? `${t.latencyMs} ms`
                        : '—'}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <AiBadge name="OpenAI" ok={t.aiCheckStatus?.openai} />
                      <AiBadge
                        name="OpenRouter"
                        ok={t.aiCheckStatus?.openrouter}
                      />
                      <AiBadge name="OpenCode" ok={t.aiCheckStatus?.opencode} />
                    </div>
                  </Td>
                  <Td>
                    <Badge
                      label={t.status}
                      variant={statusVariant(t.status)}
                    />
                    {t.lastError && (
                      <div
                        className="text-[11px] text-destructive max-w-[180px] truncate mt-1"
                        title={t.lastError}
                        dir="ltr"
                      >
                        {t.lastError}
                      </div>
                    )}
                    {t.lastCheckedAt && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDateTime(t.lastCheckedAt, lang)}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div className="text-xs font-medium">
                      {Number(t.requestCount || 0).toLocaleString()}{' '}
                      {tx('req', 'درخواست')}
                    </div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">
                      ↓ {formatBytes(t.bytesOut)} · ↑ {formatBytes(t.bytesIn)}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testingId === t.id}
                        onClick={() => runTest(t)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>
                          {testingId === t.id
                            ? tx('Testing…', 'در حال تست…')
                            : tx('Test', 'تست')}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleEnabled(t)}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => removeTunnel(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>

          <div className="mt-4">
            <Pagination
              currentPage={pagination.page}
              totalItems={pagination.total}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              lang={lang}
            />
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={
            editing
              ? tx(`Edit Tunnel: ${editing.label}`, `ویرایش تانل: ${editing.label}`)
              : tx('Add Upstream Tunnel', 'افزودن تانل خروجی جدید')
          }
          description={tx(
            'Secrets (PrivateKey / proxy password) are encrypted at rest with AES-256-GCM and synced only to the selected host node.',
            'اطلاعات حساس (PrivateKey یا پسورد پروکسی) با AES-256-GCM رمزنگاری شده و فقط به نود میزبان انتخاب‌شده ارسال می‌شود.',
          )}
          className="sm:max-w-[660px]"
        >
          <div className="space-y-4">
            {/* Protocol Mode Tabs */}
            <div>
              <label className="text-xs font-semibold text-foreground/90 block mb-1.5">
                {tx('Protocol & Anti-DPI Mode', 'پروتکل و حالت ضد فیلتر')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {(
                  [
                    {
                      id: 'wg-junk',
                      en: 'WG + Anti-DPI',
                      fa: 'WG + ضد DPI',
                    },
                    {
                      id: 'wg',
                      en: 'WG Standard',
                      fa: 'WG استاندارد',
                    },
                    {
                      id: 'amneziawg',
                      en: 'AmneziaWG',
                      fa: 'AmneziaWG کامل',
                    },
                    { id: 'socks5', en: 'SOCKS5', fa: 'SOCKS5' },
                    { id: 'http', en: 'HTTP Proxy', fa: 'HTTP' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, mode: tab.id }))}
                    className={`px-2.5 py-2 rounded-md border text-xs font-medium transition-colors ${
                      form.mode === tab.id
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border hover:border-primary/40 text-muted-foreground'
                    }`}
                  >
                    {lang === 'fa' ? tab.fa : tab.en}
                  </button>
                ))}
              </div>
              {form.mode === 'wg-junk' && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1.5">
                  {tx(
                    'Safe for standard third-party WireGuard servers: sends random pre-handshake junk packets (Jc/Jmin/Jmax/I1) while keeping S1=0, S2=0, H1..H4=1..4.',
                    'سازگار با سرورهای استاندارد وایرگارد خریداری‌شده: پکت‌های Junk قبل از Handshake ارسال می‌کند در حالی که S1/S2=0 و H1..H4=1..4 ثابت می‌ماند.',
                  )}
                </p>
              )}
              {form.mode === 'amneziawg' && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
                  {tx(
                    'Requires an AmneziaWG server with matching S1/S2/H1..H4 parameters.',
                    'نیازمند سرور AmneziaWG با مقادیر یکسان S1/S2/H1..H4 در سمت سرور است.',
                  )}
                </p>
              )}
            </div>

            {/* Label & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label={tx('Label', 'عنوان تانل')}
                  placeholder={tx(
                    'e.g. Germany WireGuard #1 (Hetzner)',
                    'مثال: وایرگارد آلمان #۱ (هتزنر)',
                  )}
                  value={form.label}
                  onChange={(v) => setForm((f) => ({ ...f, label: v }))}
                  required
                />
              </div>
              <Input
                label={tx('Priority (lower = first)', 'اولویت (کمتر = اول)')}
                type="number"
                value={form.priority}
                onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
                dir="ltr"
              />
            </div>

            {/* Host Node & Exit Country */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-foreground/90">
                  {tx('Host Node (runs the tunnel)', 'نود میزبان (اجراکننده تانل)')}
                </label>
                <select
                  value={form.hostNodeId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hostNodeId: e.target.value }))
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="">
                    {tx('Local Engine (127.0.0.1:9444)', 'موتور محلی (127.0.0.1:9444)')}
                  </option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      #{n.id} — {n.label} ({n.countryCode}) [{n.status}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-foreground/90">
                  {tx('Exit Country', 'کشور خروجی تانل')}
                  <span className="text-destructive ms-1">*</span>
                </label>
                <select
                  value={form.countryCode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, countryCode: e.target.value }))
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                  {!countries.some((c) => c.code === form.countryCode) &&
                    form.countryCode && (
                      <option value={form.countryCode}>
                        {form.countryCode}
                      </option>
                    )}
                </select>
              </div>
            </div>

            {/* Raw Config Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-foreground/90">
                  {isWgMode
                    ? tx('WireGuard / AmneziaWG .conf', 'فایل کانفیگ WireGuard / AmneziaWG')
                    : tx('Proxy URL', 'آدرس پروکسی')}
                  {!editing && <span className="text-destructive ms-1">*</span>}
                </label>
                {isWgMode && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".conf,.txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{tx('Upload .conf file', 'آپلود فایل .conf')}</span>
                    </Button>
                  </>
                )}
              </div>

              {isWgMode ? (
                <textarea
                  rows={7}
                  dir="ltr"
                  value={form.rawConfig}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rawConfig: e.target.value }))
                  }
                  placeholder={
                    editing
                      ? 'Leave blank to keep existing encrypted .conf (or paste new .conf to replace)'
                      : `[Interface]\nPrivateKey = ...\nAddress = 10.66.66.2/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ...\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 0.0.0.0/0`
                  }
                  className="w-full rounded-md border border-input bg-background p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (
                <Input
                  value={form.rawConfig}
                  onChange={(v) => setForm((f) => ({ ...f, rawConfig: v }))}
                  placeholder={
                    editing
                      ? 'Leave blank to keep existing encrypted proxy URL'
                      : form.mode === 'socks5'
                        ? 'socks5://username:password@1.2.3.4:1080'
                        : 'http://username:password@1.2.3.4:8080'
                  }
                  dir="ltr"
                  required={!editing}
                />
              )}

              {preview && (preview.endpoint || preview.address) && (
                <div
                  className="rounded-md bg-muted/60 border border-border/70 px-3 py-2 text-[11px] font-mono flex flex-wrap gap-x-4 gap-y-1"
                  dir="ltr"
                >
                  {preview.endpoint && (
                    <span>
                      <strong>Endpoint:</strong> {preview.endpoint}
                    </span>
                  )}
                  {preview.address && (
                    <span>
                      <strong>Address:</strong> {preview.address}
                    </span>
                  )}
                  {preview.mtu && (
                    <span>
                      <strong>MTU:</strong> {preview.mtu}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* MTU & Anti-DPI Junk Settings */}
            {isWgMode && (
              <div className="rounded-lg border border-border/70 p-3 space-y-3 bg-muted/20">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="grid gap-1">
                    <label className="text-[11px] font-semibold">MTU</label>
                    <select
                      value={form.mtu}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, mtu: e.target.value }))
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono"
                    >
                      <option value="1280">1280 (IR / Recommended)</option>
                      <option value="1360">1360</option>
                      <option value="1420">1420 (Default WG)</option>
                    </select>
                  </div>

                  {(form.mode === 'wg-junk' || form.mode === 'amneziawg') && (
                    <>
                      <Input
                        label="Jc (Junk count)"
                        type="number"
                        value={form.jc}
                        onChange={(v) => setForm((f) => ({ ...f, jc: v }))}
                        dir="ltr"
                      />
                      <Input
                        label="Jmin (bytes)"
                        type="number"
                        value={form.jmin}
                        onChange={(v) => setForm((f) => ({ ...f, jmin: v }))}
                        dir="ltr"
                      />
                      <Input
                        label="Jmax (bytes)"
                        type="number"
                        value={form.jmax}
                        onChange={(v) => setForm((f) => ({ ...f, jmax: v }))}
                        dir="ltr"
                      />
                    </>
                  )}
                </div>

                {(form.mode === 'wg-junk' || form.mode === 'amneziawg') && (
                  <Input
                    label={tx(
                      'I1 Custom Pre-Handshake Signature (optional, e.g. <b 0xc700000001><r 32>)',
                      'امضای سفارشی I1 قبل از Handshake (اختیاری)',
                    )}
                    value={form.i1}
                    onChange={(v) => setForm((f) => ({ ...f, i1: v }))}
                    placeholder="<r 64>"
                    dir="ltr"
                  />
                )}

                {form.mode === 'amneziawg' && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 border-t border-border/50">
                    <Input
                      label="S1"
                      type="number"
                      value={form.s1}
                      onChange={(v) => setForm((f) => ({ ...f, s1: v }))}
                      dir="ltr"
                    />
                    <Input
                      label="S2"
                      type="number"
                      value={form.s2}
                      onChange={(v) => setForm((f) => ({ ...f, s2: v }))}
                      dir="ltr"
                    />
                    <Input
                      label="H1"
                      type="number"
                      value={form.h1}
                      onChange={(v) => setForm((f) => ({ ...f, h1: v }))}
                      dir="ltr"
                    />
                    <Input
                      label="H2"
                      type="number"
                      value={form.h2}
                      onChange={(v) => setForm((f) => ({ ...f, h2: v }))}
                      dir="ltr"
                    />
                    <Input
                      label="H3"
                      type="number"
                      value={form.h3}
                      onChange={(v) => setForm((f) => ({ ...f, h3: v }))}
                      dir="ltr"
                    />
                    <Input
                      label="H4"
                      type="number"
                      value={form.h4}
                      onChange={(v) => setForm((f) => ({ ...f, h4: v }))}
                      dir="ltr"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowModal(false)}
              >
                {tx('Cancel', 'انصراف')}
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={
                  saving ||
                  !form.label.trim() ||
                  !form.countryCode.trim() ||
                  (!editing && !form.rawConfig.trim())
                }
              >
                {saving
                  ? '...'
                  : editing
                    ? tx('Save Changes', 'ذخیره تغییرات')
                    : tx('Create Tunnel', 'ثبت تانل')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
