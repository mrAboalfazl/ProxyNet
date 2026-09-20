'use client';

import { useEffect, useState } from 'react';
import { api, PricingResponse } from '../../../lib/api';
import { PageHeader, Card, Button, Alert, Spinner, colors } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';

export default function AdminPricingPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => lang === 'fa' ? fa : en;
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
      <PageHeader title={tx('Pricing', 'قیمت‌گذاری')} />

      {error && <Alert message={error} />}

      <Card style={{ padding: '24px 28px', marginBottom: 16, maxWidth: 640 }}>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: colors.textMuted, lineHeight: 1.6 }}>
          {tx('Set the per-request and per-MB charge for every service call. Changes take effect within 60 seconds. All values are in toman (integer, no decimals).', 'هزینه هر درخواست و هر مگابایت را تنظیم کنید. تغییرات حداکثر طی ۶۰ ثانیه اعمال می‌شوند و همه مقادیر به تومان و بدون اعشار هستند.')}
        </p>

        <Field
          label={tx('Per request', 'هزینه هر درخواست')}
          value={form.perRequestToman}
          onChange={(v) => setForm((f) => ({ ...f, perRequestToman: v }))}
          hint={tx('Charged for every call regardless of size.', 'برای هر درخواست، صرف‌نظر از اندازه آن، محاسبه می‌شود.')}
        />
        <Field
          label={tx('Per MB transferred', 'هزینه هر مگابایت انتقال')}
          value={form.perMbToman}
          onChange={(v) => setForm((f) => ({ ...f, perMbToman: v }))}
          hint={tx('Applied to ceil((bytesIn + bytesOut) / 1MB). A 500KB call = 1MB.', 'بر اساس سقف مجموع داده ورودی و خروجی محاسبه می‌شود؛ یک درخواست ۵۰۰ کیلوبایتی برابر یک مگابایت است.')}
        />
        <Field
          label={tx('Minimum balance to make a call', 'حداقل موجودی برای درخواست')}
          value={form.minBalanceToman}
          onChange={(v) => setForm((f) => ({ ...f, minBalanceToman: v }))}
          hint={tx('Users with less than this in their wallet cannot make new requests.', 'کاربرانی که موجودی کیف پولشان کمتر از این مقدار باشد نمی‌توانند درخواست جدید ارسال کنند.')}
        />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
          <Button onClick={save} disabled={busy || !dirty}>
            {busy ? tx('Saving…', 'در حال ذخیره…') : tx('Save', 'ذخیره')}
          </Button>
          {dirty && !busy && (
            <button onClick={() => setForm(current)} style={{
              background: 'none', border: 'none', color: colors.textMuted, fontSize: 13, cursor: 'pointer',
            }}>
              {tx('Reset', 'بازنشانی')}
            </button>
          )}
          {saved && <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>✓ {tx('Saved', 'ذخیره شد')}</span>}
        </div>
      </Card>

      <Card style={{ padding: '18px 22px', background: '#f8fafc', maxWidth: 640 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 8 }}>
          {tx('Example: a call that returns 250 KB of data', 'نمونه: درخواستی که ۲۵۰ کیلوبایت داده برمی‌گرداند')}
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
