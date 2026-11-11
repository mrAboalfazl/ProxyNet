'use client';

import { useEffect, useState, useMemo } from 'react';
import { api, Country } from '../../../lib/api';
import {
  PageHeader,
  Card,
  Table,
  Tr,
  Td,
  Badge,
  Button,
  Alert,
  Spinner,
  Input,
  Pagination,
  usePagination,
  toPersianDigits,
} from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';
import { toast } from 'sonner';
import { Globe2, RefreshCw, Power } from 'lucide-react';

export default function AdminCountriesPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);
  const [countries, setCountries] = useState<Country[]>([]);
  const [poolStatus, setPoolStatus] = useState<
    Record<string, { totalNodes: number; healthyNodes: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function load(showToast = false) {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        api.countries.listAdmin(),
        api.countries.status().catch(() => []),
      ]);
      setCountries(c);
      const statusMap: typeof poolStatus = {};
      for (const entry of s) {
        statusMap[entry.code] = { totalNodes: entry.total, healthyNodes: entry.healthy };
      }
      setPoolStatus(statusMap);
      setError('');
      if (showToast) {
        toast.success(tx('Countries updated', 'لیست کشورها به‌روزرسانی شد'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load countries';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function toggle(code: string, enabled: boolean) {
    setToggling(code);
    try {
      await api.countries.setEnabled(code, !enabled);
      setCountries((prev) =>
        prev.map((c) => (c.code === code ? { ...c, enabled: !enabled } : c))
      );
      toast.success(
        !enabled
          ? tx(`Location ${code} enabled`, `موقعیت ${code} فعال شد`)
          : tx(`Location ${code} disabled`, `موقعیت ${code} غیرفعال شد`)
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update country';
      setError(msg);
      toast.error(msg);
    } finally {
      setToggling(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return countries;
    const q = search.toLowerCase();
    return countries.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [countries, search]);

  const pagination = usePagination(filtered, 10);
  const enabledCount = countries.filter((c) => c.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${tx('Exit Locations & Countries', 'موقعیت‌های خروج و کشورها')} (${lang === 'fa' ? toPersianDigits(enabledCount) : enabledCount} ${tx('Active', 'فعال')})`}
        description={tx(
          'Manage geographic relay endpoints and enable/disable specific country pools.',
          'مدیریت نقاط خروج جغرافیایی و فعال یا غیرفعال‌سازی استخرهای پروکسی کشورها.'
        )}
        action={
          <Button onClick={() => load(true)} variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4" />
            {tx('Refresh', 'تازه‌سازی')}
          </Button>
        }
      />

      {error && <Alert message={error} type="error" />}

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Input
            placeholder={tx('Search by code or name…', 'جستجو بر اساس نام یا کد کشور…')}
            value={search}
            onChange={setSearch}
          />
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {tx(`Showing ${filtered.length} locations`, `نمایش ${toPersianDigits(filtered.length)} موقعیت`)}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          <Table
            headers={[
              tx('Country Code', 'کد کشور'),
              tx('Location Name', 'نام موقعیت'),
              tx('Total Relays', 'کل نودها'),
              tx('Healthy Relays', 'نودهای آنلاین'),
              tx('Routing Status', 'وضعیت مسیریابی'),
              tx('Actions', 'عملیات'),
            ]}
          >
            {pagination.paginatedItems.map((country) => {
              const pool = poolStatus[country.code] || { totalNodes: 0, healthyNodes: 0 };
              return (
                <Tr key={country.code}>
                  <Td>
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <span className="p-1 px-1.5 rounded bg-muted/60 text-xs font-mono">
                        {country.code}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2 font-medium">
                      <Globe2 className="h-4 w-4 text-muted-foreground" />
                      <span>{country.name}</span>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-muted-foreground font-semibold">
                      {lang === 'fa' ? toPersianDigits(pool.totalNodes) : pool.totalNodes}
                    </span>
                  </Td>
                  <Td>
                    {pool.healthyNodes > 0 ? (
                      <span className="font-semibold text-emerald-600">
                        {lang === 'fa' ? toPersianDigits(pool.healthyNodes) : pool.healthyNodes}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {lang === 'fa' ? '۰' : '0'}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge
                      label={country.enabled ? tx('Active', 'فعال') : tx('Disabled', 'غیرفعال')}
                      variant={country.enabled ? 'success' : 'secondary'}
                    />
                  </Td>
                  <Td>
                    <Button
                      onClick={() => toggle(country.code, country.enabled)}
                      disabled={toggling === country.code}
                      variant={country.enabled ? 'outline' : 'primary'}
                      size="sm"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {toggling === country.code
                        ? '…'
                        : country.enabled
                        ? tx('Disable', 'غیرفعال‌سازی')
                        : tx('Enable', 'فعال‌سازی')}
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Table>
          <Pagination
            currentPage={pagination.page}
            totalItems={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            lang={lang}
          />
        </Card>
      )}
    </div>
  );
}
