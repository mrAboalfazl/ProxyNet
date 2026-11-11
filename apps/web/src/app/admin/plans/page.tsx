'use client';

import { useEffect, useState } from 'react';
import { api, Plan } from '../../../lib/api';
import { PageHeader, Card, Table, Tr, Td, Button, Input, Alert, Spinner, Modal, colors, Pagination, usePagination, toPersianDigits } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';

export default function AdminPlansPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => lang === 'fa' ? fa : en;
  const [plans, setPlans] = useState<Plan[]>([]);
  const pagination = usePagination(plans, 10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [bandwidthGb, setBandwidthGb] = useState('100');
  const [maxSessions, setMaxSessions] = useState('10');
  const [priceToman, setPriceToman] = useState('100000');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editBandwidth, setEditBandwidth] = useState('');
  const [editSessions, setEditSessions] = useState('');
  const [updating, setUpdating] = useState(false);

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
      await api.plans.create({
        name,
        monthlyBandwidthGb: Number(bandwidthGb),
        maxConcurrentSessions: Number(maxSessions),
        priceToman,
      });
      setShowCreate(false);
      setName(''); setBandwidthGb('100'); setMaxSessions('10'); setPriceToman('100000');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create plan');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setEditName(plan.name);
    setEditPrice(String(plan.priceToman ?? '0'));
    setEditBandwidth(String(plan.monthlyBandwidthGb));
    setEditSessions(String(plan.maxConcurrentSessions));
  }

  async function saveEdit() {
    if (!editing) return;
    setUpdating(true);
    try {
      await api.plans.update(editing.id, {
        name: editName,
        priceToman: editPrice,
        monthlyBandwidthGb: Number(editBandwidth),
        maxConcurrentSessions: Number(editSessions),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update plan');
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title={tx('Plans', 'پلن‌ها')} action={<Button onClick={() => setShowCreate(true)}>+ {tx('Create Plan', 'ایجاد پلن')}</Button>} />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {loading ? <Spinner /> : (
        <Card>
          <Table headers={[tx('Name', 'نام'), tx('Bandwidth', 'پهنای باند'), tx('Price', 'قیمت'), tx('Max Sessions', 'حداکثر نشست‌ها'), tx('Protocols', 'پروتکل‌ها'), tx('Actions', 'عملیات')]}>
            {plans.length === 0 ? (
              <Tr>
                <td colSpan={6} style={{ padding: '32px 16px', color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
                  {tx('No plans yet.', 'هنوز پلنی وجود ندارد.')}
                </td>
              </Tr>
            ) : pagination.paginatedItems.map((plan) => (
              <Tr key={plan.id}>
                <Td style={{ fontWeight: 600 }}>{plan.name}</Td>
                <Td>
                  <span style={{ fontWeight: 600, color: colors.navy }}>
                    {lang === 'fa' ? toPersianDigits(plan.monthlyBandwidthGb) : plan.monthlyBandwidthGb} GB
                  </span>
                  <span style={{ color: colors.textMuted, fontSize: 12, marginInlineStart: 6 }}>{tx('/mo', '/ماه')}</span>
                </Td>
                <Td>
                  <span style={{ fontWeight: 600 }} dir="ltr">
                    {Number(plan.priceToman ?? 0).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US')}
                  </span>
                  <span style={{ color: colors.textMuted, fontSize: 12, marginInlineStart: 4 }}>{tx('toman', 'تومان')}</span>
                </Td>
                <Td>{lang === 'fa' ? toPersianDigits(plan.maxConcurrentSessions) : plan.maxConcurrentSessions}</Td>
                <Td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(plan.allowedProtocols || []).map((p) => (
                      <span key={p} style={{ fontSize: 11, background: '#f0fdf4', color: '#166534', borderRadius: 4, padding: '2px 8px', fontWeight: 500 }}>
                        {p}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td>
                  <Button size="sm" variant="outline" onClick={() => openEdit(plan)}>
                    {tx('Edit', 'ویرایش')}
                  </Button>
                </Td>
              </Tr>
            ))}
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

      {showCreate && (
        <Modal title={tx('Create Plan', 'ایجاد پلن')} onClose={() => setShowCreate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label={tx('Plan name', 'نام پلن')} value={name} onChange={setName} placeholder="Pro 100GB" required />
            <Input label={tx('Monthly bandwidth (GB)', 'پهنای باند ماهانه (گیگابایت)')} type="number" value={bandwidthGb} onChange={setBandwidthGb} placeholder="100" />
            <Input label={tx('Price (Toman)', 'قیمت (تومان)')} type="number" value={priceToman} onChange={setPriceToman} placeholder="100000" />
            <Input label={tx('Max concurrent sessions', 'حداکثر نشست هم‌زمان')} type="number" value={maxSessions} onChange={setMaxSessions} placeholder="10" />
            <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
              <Button onClick={() => setShowCreate(false)} variant="outline" size="sm">{tx('Cancel', 'لغو')}</Button>
              <Button onClick={createPlan} disabled={creating || !name} size="sm">{creating ? tx('Creating…', 'در حال ایجاد…') : tx('Create Plan', 'ایجاد پلن')}</Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={tx('Edit Plan', 'ویرایش پلن')} onClose={() => setEditing(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label={tx('Plan name', 'نام پلن')} value={editName} onChange={setEditName} required />
            <Input label={tx('Monthly bandwidth (GB)', 'پهنای باند ماهانه (گیگابایت)')} type="number" value={editBandwidth} onChange={setEditBandwidth} />
            <Input label={tx('Price (Toman)', 'قیمت (تومان)')} type="number" value={editPrice} onChange={setEditPrice} />
            <Input label={tx('Max concurrent sessions', 'حداکثر نشست هم‌زمان')} type="number" value={editSessions} onChange={setEditSessions} />
            <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
              <Button onClick={() => setEditing(null)} variant="outline" size="sm">{tx('Cancel', 'لغو')}</Button>
              <Button onClick={saveEdit} disabled={updating || !editName} size="sm">{updating ? tx('Saving…', 'در حال ذخیره…') : tx('Save Changes', 'ذخیره تغییرات')}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
