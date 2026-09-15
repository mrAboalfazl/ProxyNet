'use client';

import { useEffect, useState } from 'react';
import { api, Country } from '../../../lib/api';
import { PageHeader, Card, Table, Tr, Td, Badge, Button, Alert, Spinner, colors } from '../../../lib/ui';

export default function AdminCountriesPage() {
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
        statusMap[entry.countryCode] = { totalNodes: entry.totalNodes, healthyNodes: entry.healthyNodes };
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
      <PageHeader title={`Countries (${enabled.length} active)`} action={<Button onClick={load} variant="secondary" size="sm">Refresh</Button>} />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {loading ? <Spinner /> : (
        <Card>
          <Table headers={['Code', 'Name', 'Nodes', 'Healthy', 'Status', 'Actions']}>
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
                  <Td><Badge label={country.enabled ? 'enabled' : 'disabled'} /></Td>
                  <Td>
                    <Button onClick={() => toggle(country.code, country.enabled)} disabled={toggling === country.code} variant={country.enabled ? 'secondary' : 'primary'} size="sm">
                      {toggling === country.code ? '…' : country.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </Td>
                </Tr>
              );
            })}
            {countries.length === 0 && (
              <Tr>
                <td colSpan={6} style={{ padding: '32px 16px', color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
                  No countries configured.
                </td>
              </Tr>
            )}
          </Table>
        </Card>
      )}
    </div>
  );
}
