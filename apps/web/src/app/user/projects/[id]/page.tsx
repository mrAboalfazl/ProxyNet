'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Globe2,
  KeyRound,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  Server,
} from 'lucide-react';
import {
  api,
  getPublicApiBase,
  Project,
  ProjectRecord,
  Country,
  Socks5Endpoint,
  AvailableNode,
} from '../../../../lib/api';
import { useLang } from '../../../../lib/lang-context';
import {
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Modal,
  Badge,
  Alert,
  Spinner,
  Table,
  Tr,
  Td,
  Checkbox,
  Switch,
  formatDateTime,
} from '../../../../components/user-ui';
import { CountryFlag } from '../../../../components/country-flag';
import { toast } from 'sonner';

function CountrySelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  disabled,
}: {
  value: string;
  options: Country[];
  onChange: (code: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selected = options.find((o) => o.code === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q),
      )
    : options;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex items-center gap-2 truncate">
          {selected ? (
            <>
              <CountryFlag code={selected.code} size={18} />
              <span className="truncate">{selected.name}</span>
              <span className="text-xs text-muted-foreground">
                {selected.code}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border/80 bg-popover text-popover-foreground shadow-lg">
          <div className="border-b border-border/60 p-2">
            <Input
              value={query}
              onChange={setQuery}
              placeholder={searchPlaceholder}
              className="text-xs"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => {
                  onChange(o.code);
                  setOpen(false);
                  setQuery('');
                }}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground ${
                  value === o.code ? 'bg-accent/60 font-medium' : ''
                }`}
              >
                <CountryFlag code={o.code} size={18} />
                <span className="flex-1 truncate text-start">{o.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {o.code}
                </span>
                {value === o.code && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {emptyLabel}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SwitchRow({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

type RecordType = 'forwarder' | 'socks5';

interface FormState {
  exitNodeId: string;
  label: string;
  targetUrl: string;
  auto: boolean;
  countryCode: string;
  preservePath: boolean;
  preserveQuery: boolean;
  forwardAuthHeader: boolean;
  enabled: boolean;
}

const emptyForm: FormState = {
  exitNodeId: '',
  label: '',
  targetUrl: '',
  auto: true,
  countryCode: '',
  preservePath: true,
  preserveQuery: true,
  forwardAuthHeader: true,
  enabled: true,
};

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = String(params?.id ?? '');
  const { lang, isRTL } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userSlug, setUserSlug] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [availableNodes, setAvailableNodes] = useState<AvailableNode[]>([]);
  const [requiresPlan, setRequiresPlan] = useState(false);
  const queryHandled = useRef(false);
  const [endpoints, setEndpoints] = useState<Socks5Endpoint[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<RecordType>('forwarder');
  const [editing, setEditing] = useState<ProjectRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<{
    uuid: string;
    secret: string;
    label: string;
    exitNodeId: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [viewingEndpointsRecord, setViewingEndpointsRecord] =
    useState<ProjectRecord | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [detail, countryList, socks, nodeList] = await Promise.all([
        api.projects.get(projectId),
        api.countries.list().catch(() => [] as Country[]),
        api.socks5
          .endpoints()
          .catch(() => ({ endpoints: [], requiresActivePlan: false })),
        api.myNodes.available(),
      ]);
      setProject(detail.project);
      setRecords(detail.records);
      setUserSlug(detail.userSlug ?? '');
      setCountries(countryList.filter((c) => c.enabled));
      setEndpoints(socks.endpoints);
      setRequiresPlan(socks.requiresActivePlan);
      setAvailableNodes(nodeList);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (loading || error || queryHandled.current) return;
    queryHandled.current = true;
    const query = new URLSearchParams(window.location.search);
    const nodeId = query.get('node');
    if (query.get('add') === '1' && nodeId) {
      if (!availableNodes.some((node) => node.id === nodeId)) {
        toast.error(tx('This node is unavailable', 'این نود در دسترس نیست'));
        return;
      }
      setAddType('forwarder');
      setForm({ ...emptyForm, exitNodeId: nodeId });
      setShowAdd(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, availableNodes]);

  const countryName = useMemo(() => {
    const map = new Map(countries.map((c) => [c.code, c.name]));
    return (code: string | null) => (code ? (map.get(code) ?? code) : '');
  }, [countries]);

  function endpointFor(countryCode: string | null): Socks5Endpoint | null {
    if (!endpoints.length) return null;
    if (countryCode) {
      return endpoints.find((e) => e.countryCode === countryCode) ?? null;
    }
    return endpoints[0];
  }

  function forwarderUrl(slug?: string): string {
    if (!slug || !userSlug) return '';
    return `${getPublicApiBase()}/f/${userSlug}/${slug}`;
  }

  function socksTemplate(record: ProjectRecord): string {
    const ep = record.exitNodeId
      ? endpoints.find((endpoint) => endpoint.nodeId === record.exitNodeId)
      : endpointFor(record.countryCode);
    if (!ep) return '';
    return `socks5://${record.uuid}:YOUR_SECRET@${ep.host.includes(':') ? `[${ep.host}]` : ep.host}:${ep.port}`;
  }

  function copy(text: string, key: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success(tx('Copied', 'کپی شد'));
    setTimeout(() => setCopied(null), 1500);
  }

  function openAdd(type: RecordType) {
    setAddType(type);
    setForm({ ...emptyForm, auto: true });
    setShowAdd(true);
  }

  function openEdit(record: ProjectRecord) {
    setEditing(record);
    setForm({
      exitNodeId: record.exitNodeId ?? '',
      label: record.label,
      targetUrl: record.targetUrl ?? '',
      auto: record.routingMode !== 'country',
      countryCode: record.countryCode ?? '',
      preservePath: record.preservePath ?? true,
      preserveQuery: record.preserveQuery ?? true,
      forwardAuthHeader: record.forwardAuthHeader ?? true,
      enabled: record.enabled,
    });
  }

  async function submitAdd() {
    if (!form.label.trim()) return;
    if (addType === 'forwarder' && !form.targetUrl.trim()) return;
    setSaving(true);
    try {
      if (addType === 'forwarder') {
        await api.forwarders.create({
          label: form.label.trim(),
          targetUrl: form.targetUrl.trim(),
          projectId,
          exitNodeId: form.exitNodeId || null,
          countryCodes:
            form.exitNodeId || form.auto
              ? []
              : form.countryCode
                ? [form.countryCode]
                : [],
          preservePath: form.preservePath,
          preserveQuery: form.preserveQuery,
          forwardAuthHeader: form.forwardAuthHeader,
        });
        toast.success(tx('Forwarder created', 'فوروادر ساخته شد'));
      } else {
        const created = await api.createCredential({
          label: form.label.trim(),
          projectId,
          exitNodeId: form.exitNodeId || null,
          countryCode: null,
        });
        if (created.secret) {
          setNewSecret({
            exitNodeId: form.exitNodeId,
            uuid: created.uuid,
            secret: created.secret,
            label: created.label ?? form.label.trim(),
          });
        }
        toast.success(tx('Credential created', 'اعتبارنامه ساخته شد'));
      }
      setShowAdd(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create record');
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!editing || !form.label.trim()) return;
    setSaving(true);
    try {
      if (editing.type === 'forwarder') {
        await api.forwarders.update(editing.rawId, {
          label: form.label.trim(),
          targetUrl: form.targetUrl.trim(),
          exitNodeId: form.exitNodeId || null,
          countryCodes:
            form.exitNodeId || form.auto
              ? []
              : form.countryCode
                ? [form.countryCode]
                : [],
          preservePath: form.preservePath,
          preserveQuery: form.preserveQuery,
          forwardAuthHeader: form.forwardAuthHeader,
          enabled: form.enabled,
        });
      } else {
        await api.updateCredential(editing.rawId, {
          exitNodeId: form.exitNodeId || null,
          label: form.label.trim(),
          countryCode: null,
          enabled: form.enabled,
        });
      }
      setEditing(null);
      toast.success(tx('Record updated', 'رکورد به‌روزرسانی شد'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update record');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAuto(record: ProjectRecord) {
    if (record.type !== 'forwarder' || record.exitNodeId) return;
    const turningAutoOn = record.routingMode === 'country';
    const fallbackCountry = record.countryCode || countries[0]?.code || '';
    if (!turningAutoOn && !fallbackCountry) {
      toast.error(tx('Add a country first', 'اول یک کشور اضافه کنید'));
      return;
    }

    const nextRoutingMode = turningAutoOn ? 'auto' : 'country';
    const nextCountry = turningAutoOn ? null : fallbackCountry;

    setBusyId(record.id);
    // Optimistic update: only this row changes, no full table reload.
    setRecords((prev) =>
      prev.map((r) =>
        r.id === record.id
          ? {
              ...r,
              routingMode: nextRoutingMode,
              countryCode: nextCountry,
              countryCodes: nextCountry ? [nextCountry] : [],
            }
          : r,
      ),
    );

    try {
      if (record.type === 'forwarder') {
        await api.forwarders.update(record.rawId, {
          countryCodes: turningAutoOn ? [] : [fallbackCountry],
        });
      } else {
        await api.updateCredential(record.rawId, {
          routingMode: nextRoutingMode,
          countryCode: nextCountry,
        });
      }
    } catch (e) {
      // Revert the optimistic change on failure.
      setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
      toast.error(e instanceof Error ? e.message : 'Failed to update routing');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(record: ProjectRecord) {
    if (!confirm(tx(`Delete "${record.label}"?`, `«${record.label}» حذف شود؟`)))
      return;
    setBusyId(record.id);
    try {
      if (record.type === 'forwarder') {
        await api.forwarders.remove(record.rawId);
      } else {
        await api.revokeCredential(record.rawId);
      }
      toast.success(tx('Record deleted', 'رکورد حذف شد'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete record');
    } finally {
      setBusyId(null);
    }
  }

  const isForwarder = (editing?.type ?? addType) === 'forwarder';

  const formNodeOptions = isForwarder
    ? availableNodes
    : availableNodes.filter((node) =>
        endpoints.some((endpoint) => endpoint.nodeId === node.id),
      );
  const newEndpoint = newSecret?.exitNodeId
    ? endpoints.find((endpoint) => endpoint.nodeId === newSecret.exitNodeId)
    : endpoints[0];
  const secretValue = newSecret
    ? newEndpoint
      ? `socks5://${newSecret.uuid}:${newSecret.secret}@${newEndpoint.host.includes(':') ? `[${newEndpoint.host}]` : newEndpoint.host}:${newEndpoint.port}`
      : `${newSecret.uuid}:${newSecret.secret}`
    : '';

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/user/projects"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <BackIcon className="h-3.5 w-3.5" />
          {tx('All projects', 'همه پروژه‌ها')}
        </Link>
      </div>

      <PageHeader
        title={project?.name ?? tx('Project', 'پروژه')}
        description={tx(
          'Add HTTP forwarders or SOCKS5 credentials. SOCKS5 connects directly to the node address you use.',
          'فورواردر HTTP یا اعتبارنامه SOCKS5 اضافه کنید. مسیر SOCKS5 با آدرس نود انتخابی شما تعیین می‌شود.',
        )}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => openAdd('forwarder')}>
              <Plus className="h-4 w-4" />
              <span>{tx('Add', 'افزودن')}</span>
            </Button>
          </div>
        }
      />

      {error && <Alert message={error} type="error" />}

      {newSecret && (
        <Card className="border-2 border-amber-500 bg-amber-500/10">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
              <Lock className="h-4 w-4" />
              {tx(
                'Save this secret now — it is shown only once',
                'این Secret را همین حالا ذخیره کنید — فقط یک‌بار نمایش داده می‌شود',
              )}
            </div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 p-2 rounded-md bg-background text-xs font-mono break-all border"
                dir="ltr"
              >
                {secretValue}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(secretValue, 'new-secret')}
              >
                {copied === 'new-secret' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewSecret(null)}
              >
                {tx('Dismiss', 'بستن')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : records.length === 0 ? (
        <Card className="p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h3 className="mt-3 text-base font-semibold">
            {tx('No records yet', 'هنوز رکوردی ندارید')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx(
              'Add a forwarder or a proxy credential to this project.',
              'یک فوروادر یا اعتبارنامه پراکسی به این پروژه اضافه کنید.',
            )}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => openAdd('forwarder')}>
              <Plus className="h-4 w-4" />
              <span>{tx('Add', 'افزودن')}</span>
            </Button>
          </div>
        </Card>
      ) : (
        <Table
          headers={[
            tx('Type', 'نوع'),
            tx('Label', 'برچسب'),
            tx('Endpoint', 'آدرس'),
            tx('Routing', 'مسیریابی'),
            tx('Status', 'وضعیت'),
            tx('Usage', 'مصرف'),
            tx('Last used', 'آخرین استفاده'),
            tx('Actions', 'عملیات'),
          ]}
        >
          {records.map((record) => {
            const url =
              record.type === 'forwarder'
                ? forwarderUrl(record.slug)
                : socksTemplate(record);
            const isAuto = record.routingMode !== 'country';
            return (
              <Tr key={record.id}>
                <Td>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                    {record.type === 'forwarder' ? (
                      <Globe2 className="h-4 w-4 text-sky-600" />
                    ) : (
                      <KeyRound className="h-4 w-4 text-violet-600" />
                    )}
                    {record.type === 'forwarder'
                      ? tx('Forwarder', 'فوروادر')
                      : 'SOCKS5'}
                  </span>
                </Td>
                <Td className="font-medium">{record.label}</Td>
                <Td>
                  {record.type === 'socks5' && !record.exitNodeId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 font-normal border-primary/30 hover:border-primary hover:bg-primary/5"
                      onClick={() => setViewingEndpointsRecord(record)}
                    >
                      <Server className="h-3.5 w-3.5 text-primary" />
                      <span>{tx('View server addresses', 'مشاهده آدرس سرورها')}</span>
                      <span className="rounded bg-primary/10 text-primary px-1.5 py-0.2 text-[10px] font-mono font-semibold">
                        {endpoints.length}
                      </span>
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 max-w-[280px]">
                      <code
                        className="truncate text-[11px] font-mono text-muted-foreground"
                        dir="ltr"
                      >
                        {url || '—'}
                      </code>
                      {url && (
                        <button
                          type="button"
                          onClick={() => copy(url, record.id)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={tx('Copy', 'کپی')}
                        >
                          {copied === record.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </Td>
                <Td>
                  {record.exitNodeId ? (
                    (() => {
                      const exitNode =
                        availableNodes.find((n) => n.id === record.exitNodeId) ||
                        endpoints.find((e) => e.nodeId === record.exitNodeId);
                      return (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          {exitNode?.countryCode && (
                            <CountryFlag code={exitNode.countryCode} size={16} />
                          )}
                          <span>
                            {exitNode?.label ??
                              tx(
                                'Selected node unavailable',
                                'نود انتخابی در دسترس نیست',
                              )}
                          </span>
                          {exitNode?.countryCode && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              ({exitNode.countryCode})
                            </span>
                          )}
                        </span>
                      );
                    })()
                  ) : record.type === 'socks5' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800/60">
                      <Globe2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      <span>
                        {tx(
                          `Multi-Server (${endpoints.length} locations)`,
                          `چند‌سروره (${endpoints.length} لوکیشن)`,
                        )}
                      </span>
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isAuto}
                        onCheckedChange={() => toggleAuto(record)}
                        disabled={busyId === record.id}
                        aria-label={
                          isAuto
                            ? tx(
                                'Auto routing on — click to fix a country',
                                'مسیریابی خودکار روشن — برای کشور ثابت کلیک کنید',
                              )
                            : tx(
                                'Fixed country — click to enable auto',
                                'کشور ثابت — برای حالت خودکار کلیک کنید',
                              )
                        }
                      />
                      <span className="whitespace-nowrap text-xs">
                        {isAuto ? (
                          <span className="text-muted-foreground">
                            {tx('Auto', 'خودکار')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <CountryFlag code={record.countryCode} size={16} />
                            {countryName(record.countryCode) ||
                              record.countryCode ||
                              '—'}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </Td>
                <Td>
                  <Badge
                    label={
                      record.enabled ? tx('On', 'روشن') : tx('Off', 'خاموش')
                    }
                    variant={record.enabled ? 'success' : 'secondary'}
                  />
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {record.type === 'forwarder'
                    ? `${record.callCount} ${tx('calls', 'درخواست')}`
                    : Number(record.callCount) > 0
                      ? `${record.callCount} ${tx('conns', 'اتصال')}`
                      : '—'}
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {record.lastUsedAt
                    ? formatDateTime(record.lastUsedAt, lang)
                    : tx('never', 'هرگز')}
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(record)}
                      aria-label={tx('Edit', 'ویرایش')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => remove(record)}
                      disabled={busyId === record.id}
                      aria-label={tx('Delete', 'حذف')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </Table>
      )}

      {(showAdd || editing) && (
        <Modal
          title={
            editing
              ? tx('Edit record', 'ویرایش رکورد')
              : addType === 'forwarder'
                ? tx('New forwarder', 'فوروادر جدید')
                : tx('New proxy credential', 'اعتبارنامه پراکسی جدید')
          }
          description={
            isForwarder
              ? tx(
                  'Forward an HTTP endpoint through the proxy network.',
                  'یک endpoint HTTP را از طریق شبکه پراکسی فوروارد کنید.',
                )
              : tx(
                  'Create a SOCKS5 credential for this project.',
                  'یک اعتبارنامه SOCKS5 برای این پروژه بسازید.',
                )
          }
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          open={showAdd || !!editing}
        >
          <div className="space-y-4">
            {!editing && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold">
                  {tx('Connection type', 'نوع اتصال')}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['forwarder', 'socks5'] as const).map((type) => (
                    <label
                      key={type}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${addType === type ? 'border-primary bg-primary/5' : 'border-border'}`}
                    >
                      <input
                        type="radio"
                        name="record-type"
                        checked={addType === type}
                        onChange={() => {
                          setAddType(type);
                          setForm((previous) => ({
                            ...emptyForm,
                            exitNodeId: previous.exitNodeId,
                          }));
                        }}
                      />
                      {type === 'forwarder'
                        ? tx('HTTP forwarder', 'فورواردر HTTP')
                        : tx('SOCKS5 proxy', 'پراکسی SOCKS5')}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Input
              label={tx('Label', 'برچسب')}
              placeholder={tx('e.g. Telegram API', 'مثال: API تلگرام')}
              value={form.label}
              onChange={(v) => setForm((f) => ({ ...f, label: v }))}
              required
            />

            {isForwarder && (
              <Input
                label={tx('Target URL', 'URL مقصد')}
                placeholder="https://api.example.com/data"
                value={form.targetUrl}
                onChange={(v) => setForm((f) => ({ ...f, targetUrl: v }))}
                dir="ltr"
                required
              />
            )}

            <label className="block space-y-2 text-xs">
              <span className="font-semibold">
                {tx('Exit node', 'نود خروجی')}
              </span>
              <select
                value={form.exitNodeId}
                onChange={(e) =>
                  setForm((previous) => ({
                    ...previous,
                    exitNodeId: e.target.value,
                    auto: true,
                    countryCode: '',
                  }))
                }
                className="w-full rounded-md border bg-background p-2 text-sm"
              >
                <option value="">
                  {isForwarder
                    ? tx(
                        'Account routing / eligible network nodes',
                        'مسیریابی حساب / نودهای مجاز شبکه',
                      )
                    : tx(
                        '🌐 All permitted nodes (Multi-Server / All locations)',
                        '🌐 تمام نودهای مجاز (چند‌سروره / همه لوکیشن‌ها)',
                      )}
                </option>
                {form.exitNodeId &&
                  !formNodeOptions.some(
                    (node) => node.id === form.exitNodeId,
                  ) && (
                    <option value={form.exitNodeId}>
                      {tx(
                        'Selected node unavailable',
                        'نود انتخابی در دسترس نیست',
                      )}
                    </option>
                  )}
                {formNodeOptions.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label} · {node.countryCode} ·{' '}
                    {node.visibility === 'private'
                      ? tx('Private', 'خصوصی')
                      : tx('Shared', 'عمومی')}
                  </option>
                ))}
              </select>
              <span className="block leading-6 text-muted-foreground">
                {isForwarder
                  ? tx(
                      'Selecting a node binds this record to it. If it becomes unavailable, no other node is substituted. Only nodes your account can access are listed.',
                      'با انتخاب نود، این فورواردر فقط از همان نود عبور می‌کند. در غیر این صورت از نودهای مجاز شبکه استفاده می‌شود.',
                    )
                  : form.exitNodeId
                    ? tx(
                        'This SOCKS5 credential will strictly connect to this selected server with a fixed IP address shown in the table.',
                        'این اعتبارنامه SOCKS5 اختصاصاً به همین سرور متصل شده و آدرس مستقیم آن در جدول پروژه نمایش داده می‌شود.',
                      )
                    : tx(
                        'Multi-Server access: This credential works across all eligible servers (NL, DE, etc.). In the project table, you can view and copy the address of any server.',
                        'دسترسی چند‌سروره: این اعتبارنامه روی تمام سرورهای مجاز (هلند، آلمان و...) کار می‌کند. در جدول پروژه می‌توانید آدرس تفکیک‌شده هر سرور را کپی کنید.',
                      )}
              </span>
            </label>
            {!isForwarder && requiresPlan && (
              <Alert
                type="info"
                message={tx(
                  'An active plan and quota are required for SOCKS5, including your own node.',
                  'استفاده SOCKS5 حتی روی نود شخصی به پلن فعال و سهمیه نیاز دارد.',
                )}
              />
            )}

            {isForwarder && !form.exitNodeId ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground/90">
                  {tx('Routing', 'مسیریابی')}
                </label>
                <SwitchRow
                  checked={form.auto}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, auto: v }))}
                  label={tx('Auto routing', 'مسیریابی خودکار')}
                  description={tx(
                    'Automatically routes through available healthy exit nodes (uses legacy account preference if previously saved).',
                    'مسیریابی خودکار از میان نودهای خروج سالم و در دسترس (در صورت وجود اولویت قبلی حساب، از آن استفاده می‌شود).',
                  )}
                />
                {!form.auto && (
                  <CountrySelect
                    value={form.countryCode}
                    options={countries}
                    onChange={(code) =>
                      setForm((f) => ({ ...f, countryCode: code }))
                    }
                    placeholder={tx('Select a country', 'یک کشور انتخاب کنید')}
                    searchPlaceholder={tx('Search country…', 'جستجوی کشور…')}
                    emptyLabel={tx('No country found', 'کشوری پیدا نشد')}
                  />
                )}
              </div>
            ) : (
              <p className="rounded-lg border bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
                {isForwarder
                  ? tx(
                      'HTTP requests use only the selected node.',
                      'درخواست‌های HTTP فقط از نود انتخاب‌شده ارسال می‌شوند.',
                    )
                  : form.exitNodeId
                    ? tx(
                        'Direct connection to selected server only. Automatic failover between servers is not supported by SOCKS5.',
                        'اتصال مستقیم فقط به سرور انتخاب‌شده انجام می‌شود. تغییر نود خودکار در پروتکل SOCKS5 وجود ندارد.',
                      )
                    : tx(
                        'Multi-Server access: One username & password works on all eligible servers (NL, DE, etc.). Connections are direct to each node address.',
                        'دسترسی چند‌سروره: همین نام‌کاربری و رمز روی تمام سرورهای مجاز (هلند، آلمان و...) کار می‌کند. اتصال مستقیماً به آدرس هر نود انجام می‌شود.',
                      )}
              </p>
            )}

            {isForwarder && (
              <details className="space-y-2.5 rounded-lg border border-border/70 bg-muted/20 p-3">
                <summary className="cursor-pointer text-xs font-semibold">
                  {tx('Advanced forwarding options', 'تنظیمات پیشرفته فوروارد')}
                </summary>
                <p className="text-xs leading-6 text-muted-foreground">
                  {tx(
                    'Defaults suit most APIs. Change only when your destination requires it.',
                    'پیش‌فرض‌ها برای بیشتر APIها مناسب‌اند؛ فقط در صورت نیاز مقصد تغییر دهید.',
                  )}
                </p>
                {[
                  [
                    'preservePath',
                    tx('Append request path', 'افزودن ادامه مسیر درخواست'),
                    tx(
                      'On: append /users after the forwarder link to the target path. Off: use only the configured target path.',
                      'روشن: مسیر /users در انتهای لینک فورواردر به مسیر مقصد اضافه می‌شود. خاموش: فقط مسیر ثبت‌شده مقصد استفاده می‌شود.',
                    ),
                  ],
                  [
                    'preserveQuery',
                    tx('Send URL parameters', 'ارسال پارامترهای آدرس'),
                    tx(
                      'On: forward parameters such as ?page=2. Off: ignore client parameters. Target URL parameters remain in both cases.',
                      'روشن: پارامترهایی مثل ?page=2 ارسال می‌شوند. خاموش: پارامترهای درخواست حذف می‌شوند. پارامترهای ثبت‌شده در آدرس مقصد همیشه باقی می‌مانند.',
                    ),
                  ],
                  [
                    'forwardAuthHeader',
                    tx('Send API authentication', 'ارسال احراز هویت API'),
                    tx(
                      'On: send the client Authorization header, including Bearer tokens, to the target. Off: remove it. Required for APIs using this header.',
                      'روشن: هدر Authorization درخواست، مثل توکن Bearer، به مقصد ارسال می‌شود. خاموش: این هدر حذف می‌شود. برای APIهایی که با این هدر احراز هویت می‌کنند لازم است.',
                    ),
                  ],
                ].map(([key, label, description]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer select-none items-center gap-2.5 text-xs"
                  >
                    <Checkbox
                      checked={Boolean(form[key as keyof FormState])}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, [key]: v === true }))
                      }
                    />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                        {description}
                      </span>
                    </span>
                  </label>
                ))}
              </details>
            )}

            {editing && (
              <SwitchRow
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                label={tx('Enabled', 'فعال')}
                description={tx(
                  'Disabled records keep their settings but stop serving traffic.',
                  'رکورد غیرفعال تنظیماتش را نگه می‌دارد ولی ترافیک سرو نمی‌کند.',
                )}
              />
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAdd(false);
                  setEditing(null);
                }}
              >
                {tx('Cancel', 'انصراف')}
              </Button>
              <Button
                size="sm"
                onClick={editing ? submitEdit : submitAdd}
                disabled={
                  saving ||
                  (!!form.exitNodeId &&
                    !formNodeOptions.some(
                      (node) => node.id === form.exitNodeId,
                    )) ||
                  !form.label.trim() ||
                  (isForwarder &&
                    (!form.targetUrl.trim() ||
                      (!form.exitNodeId && !form.auto && !form.countryCode)))
                }
              >
                {saving
                  ? '...'
                  : editing
                    ? tx('Save', 'ذخیره')
                    : tx('Create', 'ساخت')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {viewingEndpointsRecord && (
        <Modal
          title={tx('SOCKS5 Server Endpoints', 'آدرس‌های اتصال سرورهای SOCKS5')}
          description={tx(
            `Connection details for "${viewingEndpointsRecord.label}". This credential works across all eligible servers listed below.`,
            `اطلاعات اتصال برای «${viewingEndpointsRecord.label}». این اعتبارنامه روی تمام سرورهای زیر فعال است و می‌توانید به هر کدام متصل شوید.`,
          )}
          onClose={() => setViewingEndpointsRecord(null)}
          open={!!viewingEndpointsRecord}
        >
          <div className="space-y-4">
            <div className="rounded-lg border bg-amber-500/10 border-amber-500/20 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                {tx('Important Note', 'نکته مهم')}
              </div>
              <p className="leading-relaxed">
                {tx(
                  'Replace YOUR_SECRET with the secret password saved when this credential was created.',
                  'در عبارت YOUR_SECRET، رمز عبوری (Secret) که هنگام ساخت این رکورد ذخیره کرده‌اید را جایگزین کنید.',
                )}
              </p>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {endpoints.map((ep) => {
                const epUrl = `socks5://${viewingEndpointsRecord.uuid}:YOUR_SECRET@${ep.host.includes(':') ? `[${ep.host}]` : ep.host}:${ep.port}`;
                const copyKey = `ep-${viewingEndpointsRecord.id}-${ep.nodeId}`;
                return (
                  <div
                    key={ep.nodeId}
                    className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-2 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CountryFlag code={ep.countryCode} size={18} />
                        <span className="text-xs font-semibold">{ep.label}</span>
                        <span className="text-[10px] font-mono rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {ep.countryCode} · {countryName(ep.countryCode) || ep.countryName}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground" dir="ltr">
                        {ep.host}:{ep.port}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <code
                        className="flex-1 p-2 rounded-md bg-background text-[11px] font-mono break-all border select-all"
                        dir="ltr"
                      >
                        {epUrl}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 h-8 text-xs gap-1"
                        onClick={() => copy(epUrl, copyKey)}
                      >
                        {copied === copyKey ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span>{tx('Copied', 'کپی شد')}</span>
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
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const allUrls = endpoints
                    .map(
                      (ep) =>
                        `socks5://${viewingEndpointsRecord.uuid}:YOUR_SECRET@${ep.host.includes(':') ? `[${ep.host}]` : ep.host}:${ep.port}`,
                    )
                    .join('\n');
                  copy(allUrls, `all-${viewingEndpointsRecord.id}`);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>
                  {copied === `all-${viewingEndpointsRecord.id}`
                    ? tx('All copied!', 'همه کپی شدند!')
                    : tx('Copy all servers', 'کپی تمام سرورها')}
                </span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setViewingEndpointsRecord(null)}
              >
                {tx('Close', 'بستن')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
