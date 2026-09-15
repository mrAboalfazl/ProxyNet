'use client';

import { useEffect, useState } from 'react';
import { api, PricingResponse } from '../../../lib/api';
import { PageHeader, Card, Button, Alert, Spinner, colors } from '../../../lib/ui';

export default function AdminPricingPage() {
  const [current, setCurrent] = useState<PricingResponse | null>(null);
  const [form, setForm] = useState<PricingResponse>({ perRequestToman: '', perMbToman: '', minBalanceToman: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const p = await api.adminPricing.get();
      setCurrent(p);
      setForm(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pricing');
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      const p = await api.adminPricing.update({
        perRequestToman: form.perRequestToman,
        perMbToman: form.perMbToman,
        minBalanceToman: form.minBalanceToman,
      });
      setCurrent(p); setForm(p); setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  if (!current) return <Spinner />;

  const dirty = form.perRequestToman !== current.perRequestToman
    || form.perMbToman !== current.perMbToman
    || form.minBalanceToman !== current.minBalanceToman;

  return (
    <div>
      <PageHeader title="Pricing" />

      {error && <Alert message={error} />}

      <Card style={{ padding: '24px 28px', marginBottom: 16, maxWidth: 640 }}>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: colors.textMuted, lineHeight: 1.6 }}>
          Set the per-request and per-MB charge for every proxy call (gateway + forwarder). Changes take
          effect within 60 seconds. All values are in toman (integer, no decimals).
        </p>

        <Field
          label="Per request"
          value={form.perRequestToman}
          onChange={(v) => setForm((f) => ({ ...f, perRequestToman: v }))}
          hint="Charged for every call regardless of size."
        />
        <Field
          label="Per MB transferred"
          value={form.perMbToman}
          onChange={(v) => setForm((f) => ({ ...f, perMbToman: v }))}
          hint="Applied to ceil((bytesIn + bytesOut) / 1MB). A 500KB call = 1MB."
        />
        <Field
          label="Minimum balance to make a call"
          value={form.minBalanceToman}
          onChange={(v) => setForm((f) => ({ ...f, minBalanceToman: v }))}
          hint="Users with less than this in their wallet get 402 Payment Required."
        />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
          <Button onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {dirty && !busy && (
            <button onClick={() => setForm(current)} style={{
              background: 'none', border: 'none', color: colors.textMuted, fontSize: 13, cursor: 'pointer',
            }}>
              Reset
            </button>
          )}
          {saved && <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>✓ Saved</span>}
        </div>
      </Card>

      <Card style={{ padding: '18px 22px', background: '#f8fafc', maxWidth: 640 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 8 }}>
          Example: a call that returns 250 KB of data
        </div>
        <div style={{ fontSize: 13, color: colors.text, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          {form.perRequestToman} + ceil(250KB / 1MB) × {form.perMbToman} = {form.perRequestToman} + 1 × {form.perMbToman} = <strong>{Number(form.perRequestToman) + Number(form.perMbToman)}</strong> toman
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, hint }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 14, width: 180, direction: 'ltr' }}
        />
        <span style={{ fontSize: 12, color: colors.textMuted }}>toman</span>
      </div>
      {hint && <p style={{ margin: '4px 0 0', fontSize: 11, color: colors.textMuted }}>{hint}</p>}
    </div>
  );
}
