'use client';

import { useEffect, useState } from 'react';
import { api, Plan } from '../../../lib/api';
import { PageHeader, Card, Table, Tr, Td, Button, Input, Alert, Spinner, Modal, colors } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';

export default function AdminPlansPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => lang === 'fa' ? fa : en;
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
      <PageHeader title={tx('Plans', 'پلن‌ها')} action={<Button onClick={() => setShowCreate(true)}>+ {tx('Create Plan', 'ایجاد پلن')}</Button>} />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {loading ? <Spinner /> : (
        <Card>
          <Table headers={[tx('Name', 'نام'), tx('Bandwidth', 'پهنای باند'), tx('Max Sessions', 'حداکثر نشست‌ها'), tx('Protocols', 'پروتکل‌ها')]}>
            {plans.length === 0 ? (
              <Tr>
                <td colSpan={4} style={{ padding: '32px 16px', color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
                  {tx('No plans yet.', 'هنوز پلنی وجود ندارد.')}
                </td>
              </Tr>
            ) : plans.map((plan) => (
              <Tr key={plan.id}>
                <Td style={{ fontWeight: 600 }}>{plan.name}</Td>
                <Td>
                  <span style={{ fontWeight: 600, color: colors.navy }}>{plan.monthlyBandwidthGb} GB</span>
                  <span style={{ color: colors.textMuted, fontSize: 12, marginInlineStart: 6 }}>{tx('/mo', '/ماه')}</span>
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
        <Modal title={tx('Create Plan', 'ایجاد پلن')} onClose={() => setShowCreate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label={tx('Plan name', 'نام پلن')} value={name} onChange={setName} placeholder="Pro 100GB" required />
            <Input label={tx('Monthly bandwidth (GB)', 'پهنای باند ماهانه (گیگابایت)')} type="number" value={bandwidthGb} onChange={setBandwidthGb} placeholder="100" />
            <Input label={tx('Max concurrent sessions', 'حداکثر نشست هم‌زمان')} type="number" value={maxSessions} onChange={setMaxSessions} placeholder="10" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button onClick={() => setShowCreate(false)} variant="secondary">{tx('Cancel', 'لغو')}</Button>
              <Button onClick={createPlan} disabled={creating || !name}>{creating ? tx('Creating…', 'در حال ایجاد…') : tx('Create Plan', 'ایجاد پلن')}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
