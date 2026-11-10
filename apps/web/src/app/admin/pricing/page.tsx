'use client';

import { useEffect, useState } from 'react';
import { api, PricingResponse } from '../../../lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Alert,
  Spinner,
  Input,
  Badge,
} from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';
import { toast } from 'sonner';
import {
  Coins,
  Save,
  RotateCcw,
  Calculator,
  CheckCircle2,
} from 'lucide-react';

export default function AdminPricingPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);
  const [current, setCurrent] = useState<PricingResponse | null>(null);
  const [form, setForm] = useState<PricingResponse>({
    perRequestToman: '',
    perMbToman: '',
    minBalanceToman: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const p = await api.adminPricing.get();
      setCurrent(p);
      setForm(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pricing');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const p = await api.adminPricing.update({
        perRequestToman: form.perRequestToman,
        perMbToman: form.perMbToman,
        minBalanceToman: form.minBalanceToman,
      });
      setCurrent(p);
      setForm(p);
      toast.success(tx('Pricing updated successfully', 'تعرفه‌ها با موفقیت ذخیره شدند'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!current) return <Spinner />;

  const dirty =
    form.perRequestToman !== current.perRequestToman ||
    form.perMbToman !== current.perMbToman ||
    form.minBalanceToman !== current.minBalanceToman;

  // Real-time calculation example
  const reqCost = Number(form.perRequestToman) || 0;
  const mbCost = Number(form.perMbToman) || 0;
  const exampleTotal = reqCost + mbCost;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={tx('Pricing & Quotas', 'مدیریت تعرفه‌ها و سهمیه‌ها')}
        description={tx(
          'Set global per-request and per-MB pricing applied to all proxy traffic.',
          'تعیین هزینه هر درخواست و هر مگابایت ترافیک عبوری در کل پلتفرم.'
        )}
      />

      {error && <Alert message={error} type="error" />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Pricing Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">
                {tx('Active Tariff Rules', 'تنظیم نرخ پایه')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {tx(
                'Changes take effect globally across all nodes within 60 seconds. All values are in Toman.',
                'تغییرات حداکثر طی ۶۰ ثانیه در تمامی نودها اعمال می‌شوند. تمام مبالغ به تومان است.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label={tx('Per Request (Toman)', 'هزینه هر درخواست (تومان)')}
              type="number"
              value={form.perRequestToman}
              onChange={(v) => setForm((f) => ({ ...f, perRequestToman: v }))}
              hint={tx(
                'Charged for every call regardless of payload size (e.g. 10 Toman).',
                'برای هر درخواست، بدون توجه به اندازه پاسخ، از کیف پول کسر می‌شود.'
              )}
            />

            <Input
              label={tx('Per Megabyte Transferred (Toman)', 'هزینه هر مگابایت انتقال (تومان)')}
              type="number"
              value={form.perMbToman}
              onChange={(v) => setForm((f) => ({ ...f, perMbToman: v }))}
              hint={tx(
                'Applied to ceil((bytesIn + bytesOut) / 1MB). A 500KB call = 1MB.',
                'سقف حجم ورودی و خروجی گرد شده به مگابایت؛ مثلاً درخواست ۵۰۰ کیلوبایتی معادل ۱ مگابایت محاسبه می‌شود.'
              )}
            />

            <Input
              label={tx('Minimum Balance Required (Toman)', 'حداقل موجودی برای ثبت درخواست (تومان)')}
              type="number"
              value={form.minBalanceToman}
              onChange={(v) => setForm((f) => ({ ...f, minBalanceToman: v }))}
              hint={tx(
                'Users with less than this balance cannot open new proxy connections.',
                'کاربرانی که موجودی حسابشان کمتر از این سقف باشد، مجاز به ارسال ترافیک جدید نخواهند بود.'
              )}
            />
          </CardContent>
          <CardFooter className="flex items-center justify-between border-t border-border/50 pt-4">
            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={busy || !dirty}>
                <Save className="h-4 w-4" />
                {busy ? tx('Saving…', 'در حال ذخیره…') : tx('Save Changes', 'ذخیره تغییرات')}
              </Button>
              {dirty && !busy && (
                <Button
                  onClick={() => setForm(current)}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  <RotateCcw className="h-4 w-4" />
                  {tx('Reset', 'بازنشانی')}
                </Button>
              )}
            </div>
            {dirty && (
              <Badge label={tx('Unsaved Changes', 'تغییرات ذخیره‌نشده')} variant="warning" />
            )}
          </CardFooter>
        </Card>

        {/* Live Calculation Preview Card */}
        <div className="space-y-4">
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  {tx('Live Cost Simulator', 'شبیه‌ساز هزینه نمونه')}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                {tx(
                  'Example: A proxy request that transfers 250 KB of payload:',
                  'نمونه: یک درخواست پروکسی با ۲۵۰ کیلوبایت ترافیک ردوبدل‌شده:'
                )}
              </p>
              <div className="space-y-1.5 p-3 rounded-lg border bg-background font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tx('Base request fee:', 'کارمزد پایه درخواست:')}</span>
                  <span className="font-semibold">{reqCost.toLocaleString()} تومان</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tx('1 MB bandwidth ceil:', 'سقف ۱ مگابایت ترافیک:')}</span>
                  <span className="font-semibold">{mbCost.toLocaleString()} تومان</span>
                </div>
                <div className="border-t pt-1.5 flex justify-between font-bold text-foreground">
                  <span>{tx('Total Cost:', 'هزینه کل کسر شده:')}</span>
                  <span className="text-primary">{exampleTotal.toLocaleString()} تومان</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{tx('HTTP Gateway Accounting', 'محاسبه لحظه‌ای درگاه HTTP')}</span>
              </div>
              <p>
                {tx(
                  'Outbound requests sent via POST /api/gateway/fetch are automatically authenticated and billed against these rules in real-time.',
                  'درخواست‌های ارسالی از طریق درگاه HTTP با این تعرفه‌ها به صورت لحظه‌ای محاسبه و در دفتر تراکنش‌ها ثبت می‌شوند.'
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
