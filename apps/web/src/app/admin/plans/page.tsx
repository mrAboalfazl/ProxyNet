'use client';

import { useEffect, useState } from 'react';
import { api, Plan } from '../../../lib/api';
import { PageHeader, Card, Table, Tr, Td, Button, Input, Alert, Spinner, Modal, colors } from '../../../lib/ui';

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [bandwidthGb, setBandwidthGb] = useState('100');
  const [maxSessions, setMaxSessions] = useState('10');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setPlans(await api.adminPlans.list());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }

  async function createPlan() {
    setCreating(true);
    try {
      await api.plans.create({ name, monthlyBandwidthGb: Number(bandwidthGb), maxConcurrentSessions: Number(maxSessions) });
      setShowCreate(false);
      setName(''); setBandwidthGb('100'); setMaxSessions('10');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create plan');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Plans" action={<Button onClick={() => setShowCreate(true)}>+ Create Plan</Button>} />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {loading ? <Spinner /> : (
        <Card>
          <Table headers={['Name', 'Bandwidth', 'Max Sessions', 'Protocols']}>
            {plans.length === 0 ? (
              <Tr>
                <td colSpan={4} style={{ padding: '32px 16px', color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
                  No plans yet.
                </td>
              </Tr>
            ) : plans.map((plan) => (
              <Tr key={plan.id}>
                <Td style={{ fontWeight: 600 }}>{plan.name}</Td>
                <Td>
                  <span style={{ fontWeight: 600, color: colors.navy }}>{plan.monthlyBandwidthGb} GB</span>
                  <span style={{ color: colors.textMuted, fontSize: 12, marginLeft: 6 }}>/mo</span>
                </Td>
                <Td>{plan.maxConcurrentSessions}</Td>
                <Td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(plan.allowedProtocols || []).map((p) => (
                      <span key={p} style={{ fontSize: 11, background: '#f0fdf4', color: '#166534', borderRadius: 4, padding: '2px 8px', fontWeight: 500 }}>
                        {p}
                      </span>
                    ))}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}

      {showCreate && (
        <Modal title="Create Plan" onClose={() => setShowCreate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="Plan name" value={name} onChange={setName} placeholder="Pro 100GB" required />
            <Input label="Monthly bandwidth (GB)" type="number" value={bandwidthGb} onChange={setBandwidthGb} placeholder="100" />
            <Input label="Max concurrent sessions" type="number" value={maxSessions} onChange={setMaxSessions} placeholder="10" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button onClick={() => setShowCreate(false)} variant="secondary">Cancel</Button>
              <Button onClick={createPlan} disabled={creating || !name}>{creating ? 'Creating…' : 'Create Plan'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
