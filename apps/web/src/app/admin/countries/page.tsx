'use client';

import { useEffect, useState } from 'react';
import { api, Country } from '../../../lib/api';
import { PageHeader, Card, Table, Tr, Td, Badge, Button, Alert, Spinner, colors } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';

export default function AdminCountriesPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => lang === 'fa' ? fa : en;
  const [countries, setCountries] = useState<Country[]>([]);
  const [poolStatus, setPoolStatus] = useState<Record<string, { totalNodes: number; healthyNodes: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([api.countries.listAdmin(), api.countries.status().catch(() => [])]);
      setCountries(c);
      const statusMap: typeof poolStatus = {};
      for (const entry of s) {
        statusMap[entry.code] = { totalNodes: entry.total, healthyNodes: entry.healthy };
      }
      setPoolStatus(statusMap);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load countries');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(code: string, enabled: boolean) {
    setToggling(code);
    try {
      await api.countries.setEnabled(code, !enabled);
      setCountries((prev) => prev.map((c) => c.code === code ? { ...c, enabled: !enabled } : c));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update country');
    } finally {
      setToggling(null);
    }
  }

  useEffect(() => { load(); }, []);

  const enabled = countries.filter((c) => c.enabled);

  return (
    <div>
      <PageHeader title={`${tx('Countries', 'کشورها')} (${enabled.length} ${tx('active', 'فعال')})`} action={<Button onClick={load} variant="secondary" size="sm">{tx('Refresh', 'تازه‌سازی')}</Button>} />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {loading ? <Spinner /> : (
        <Card>
          <Table headers={[tx('Code', 'کد'), tx('Name', 'نام'), tx('Nodes', 'نودها'), tx('Healthy', 'سالم'), tx('Status', 'وضعیت'), tx('Actions', 'عملیات')]}>
            {countries.map((country) => {
              const pool = poolStatus[country.code] || { totalNodes: 0, healthyNodes: 0 };
              return (
                <Tr key={country.code}>
                  <Td><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>{country.code}</span></Td>
                  <Td>{country.name}</Td>
                  <Td style={{ color: pool.totalNodes > 0 ? colors.text : colors.textMuted }}>{pool.totalNodes}</Td>
                  <Td>
                    {pool.healthyNodes > 0
                      ? <span style={{ color: '#16a34a', fontWeight: 600 }}>{pool.healthyNodes}</span>
                      : <span style={{ color: colors.textMuted }}>0</span>}
                  </Td>
                  <Td><Badge label={country.enabled ? tx('enabled', 'فعال') : tx('disabled', 'غیرفعال')} /></Td>
                  <Td>
                    <Button onClick={() => toggle(country.code, country.enabled)} disabled={toggling === country.code} variant={country.enabled ? 'secondary' : 'primary'} size="sm">
                      {toggling === country.code ? '…' : country.enabled ? tx('Disable', 'غیرفعال کردن') : tx('Enable', 'فعال کردن')}
                    </Button>
                  </Td>
                </Tr>
              );
            })}
            {countries.length === 0 && (
              <Tr>
                <td colSpan={6} style={{ padding: '32px 16px', color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
                  {tx('No countries configured.', 'هیچ کشوری پیکربندی نشده است.')}
                </td>
              </Tr>
            )}
          </Table>
        </Card>
      )}
    </div>
  );
}
