'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { StatCard, Alert, Spinner, Button, colors } from '../../../lib/ui';

interface DashboardStats {
  totalUsers: number;
  totalNodes: number;
  healthyNodes: number;
  activeCountries: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [snapshotVersion, setSnapshotVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recompiling, setRecompiling] = useState(false);

  async function load() {
    try {
      const [s, snap] = await Promise.all([api.dashboard(), api.snapshot()]);
      setStats(s);
      setSnapshotVersion(snap.version);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function recompile() {
    setRecompiling(true);
    try {
      const snap = await api.recompileSnapshot();
      setSnapshotVersion(snap.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recompile failed');
    } finally {
      setRecompiling(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111' }}>Dashboard</h1>
        <Button onClick={load} variant="secondary" size="sm">Refresh</Button>
      </div>

      {error && <Alert message={error} />}

      {stats && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Active Users" value={stats.totalUsers} />
          <StatCard label="Total Nodes" value={stats.totalNodes} />
          <StatCard label="Healthy Nodes" value={stats.healthyNodes} color={stats.healthyNodes > 0 ? '#16a34a' : '#dc2626'} />
          <StatCard label="Active Countries" value={stats.activeCountries} />
        </div>
      )}

      <div style={{
        backgroundColor: '#fff', borderRadius: 10, padding: '20px 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>
            Routing Snapshot
          </p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.navy }}>
            v{snapshotVersion ?? '—'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: colors.textMuted }}>
            Agents fetch this every 60 s and restart Xray-core on version change
          </p>
        </div>
        <Button onClick={recompile} disabled={recompiling} variant="ghost" size="sm">
          {recompiling ? 'Recompiling…' : 'Recompile Now'}
        </Button>
      </div>
    </div>
  );
}
