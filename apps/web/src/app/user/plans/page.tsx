'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  api,
  Plan,
  WalletMeResponse,
} from '../../../lib/api';
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
  Badge,
  Modal,
  formatDate,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import { toast } from 'sonner';
import {
  CreditCard,
  CheckCircle2,
  Wallet,
  Globe2,
  Gauge,
  Layers,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';

interface UsageInfo {
  bytesUsed: number | string;
  periodStart: string;
  periodEnd: string;
  subscriptionId?: string | null;
  plan?: {
    id?: string;
    name: string;
    monthlyBandwidthGb: number;
    maxConcurrentSessions?: number;
    priceToman?: string;
    allowedCountries?: string[];
  } | null;
}

function fmtNum(value: string | number | undefined, lang: string) {
  if (value === undefined || value === null || value === '') return '0';
  return Number(value).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
}

export default function UserPlansPage() {
  const { lang, isRTL } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [wallet, setWallet] = useState<WalletMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Plan | null>(null);
  const [buying, setBuying] = useState(false);

  const balance = useMemo(
    () => BigInt(wallet?.balanceToman ?? '0'),
    [wallet],
  );

  async function load() {
    setLoading(true);
    try {
      const [planList, usageData, walletData] = await Promise.all([
        api.plans.list(),
        api.myUsage().catch(() => null),
        api.wallet.me(),
      ]);
      setPlans(planList);
      setUsage(usageData as UsageInfo | null);
      setWallet(walletData);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function purchase() {
    if (!selected) return;
    setBuying(true);
    setError('');
    try {
      await api.plans.purchase(selected.id);
      toast.success(
        tx(
          `${selected.name} activated successfully`,
          `پلن ${selected.name} با موفقیت فعال شد`,
        ),
      );
      setSelected(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Purchase failed';
      setError(msg);
      toast.error(
        msg === 'insufficient_balance'
          ? tx('Insufficient wallet balance', 'موجودی کیف پول کافی نیست')
          : msg,
      );
    } finally {
      setBuying(false);
    }
  }

  if (loading) return <Spinner />;

  const activePlanId = usage?.plan?.id;
  const activePlanName = usage?.plan?.name;
  const selectedPrice = BigInt(selected?.priceToman ?? '0');
  const canAfford = !selected || balance >= selectedPrice;
  const balanceAfter = selected ? balance - selectedPrice : balance;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tx('Plans & Subscription', 'پلن و اشتراک')}
        description={tx(
          'Choose a plan and activate it instantly using your wallet balance.',
          'پلن موردنظر را انتخاب کنید و بلافاصله از موجودی کیف پول فعال کنید.',
        )}
        action={
          <Link href="/user/wallet">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Wallet className="h-4 w-4" />
              <span>{tx('Wallet', 'کیف پول')}</span>
            </Button>
          </Link>
        }
      />

      {error && <Alert message={error} type="error" />}

      {/* Current subscription / wallet summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-primary/25 bg-gradient-to-br from-primary/5 via-card to-card">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tx('Current subscription', 'اشتراک فعلی')}
                </span>
                {usage?.plan ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{activePlanName}</span>
                      <Badge
                        label={tx('Active', 'فعال')}
                        variant="success"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tx('Renews / ends on', 'پایان دوره')}:{' '}
                      {formatDate(usage.periodEnd, lang, { format: 'short' })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-base">
                      {tx('No active plan', 'پلن فعالی ندارید')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tx(
                        'Pick a plan below to unlock SOCKS5 and node access.',
                        'برای دسترسی به SOCKS5 و نودها یکی از پلن‌های زیر را انتخاب کنید.',
                      )}
                    </p>
                  </>
                )}
              </div>
            </div>
            {usage?.plan && (
              <div className="text-left sm:text-right shrink-0">
                <span className="text-xs text-muted-foreground">
                  {tx('Monthly bandwidth', 'پهنای باند ماهانه')}
                </span>
                <div className="font-bold text-lg" dir="ltr">
                  {fmtNum(usage.plan.monthlyBandwidthGb, lang)} GB
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              {tx('Wallet balance', 'موجودی کیف پول')}
            </span>
            <div className="flex items-baseline gap-1 pt-1">
              <span className="text-2xl font-extrabold" dir="ltr">
                {fmtNum(wallet?.balanceToman, lang)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(lang, 'wallet.currency')}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
              {t(lang, 'wallet.topup_note')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isActive = activePlanId && activePlanId === plan.id;
          const price = BigInt(plan.priceToman ?? '0');
          const affordable = balance >= price;
          const countries =
            plan.allowedCountries?.length > 0
              ? plan.allowedCountries.join(' · ')
              : tx('All countries', 'همه کشورها');

          return (
            <Card
              key={plan.id}
              className={`flex flex-col transition-all ${
                isActive
                  ? 'border-2 border-primary shadow-md'
                  : 'hover:border-primary/40'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                  </div>
                  {isActive && (
                    <Badge label={tx('Active', 'فعال')} variant="success" />
                  )}
                </div>
                <CardDescription className="text-xs pt-1">
                  {tx('30-day subscription', 'اشتراک ۳۰ روزه')}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-3 text-xs">
                <div className="flex items-baseline gap-1">
                  {price > 0n ? (
                    <>
                      <span className="text-2xl font-extrabold" dir="ltr">
                        {fmtNum(plan.priceToman, lang)}
                      </span>
                      <span className="text-muted-foreground">
                        {t(lang, 'wallet.currency')}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-extrabold">
                      {tx('Free', 'رایگان')}
                    </span>
                  )}
                </div>

                <div className="h-px bg-border" />

                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Gauge className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>
                      {fmtNum(plan.monthlyBandwidthGb, lang)} GB{' '}
                      {tx('bandwidth / month', 'پهنای باند در ماه')}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>
                      {fmtNum(plan.maxConcurrentSessions, lang)}{' '}
                      {tx('concurrent sessions', 'نشست هم‌زمان')}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Globe2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{countries}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span dir="ltr" className="font-mono text-[11px]">
                      {(plan.allowedProtocols || []).join(' · ')}
                    </span>
                  </li>
                </ul>
              </CardContent>

              <CardFooter className="pt-0">
                <Button
                  className="w-full"
                  variant={isActive ? 'outline' : 'primary'}
                  disabled={!affordable}
                  onClick={() => setSelected(plan)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    {isActive
                      ? tx('Renew for 30 days', 'تمدید ۳۰ روزه')
                      : affordable
                        ? tx('Activate', 'فعال‌سازی')
                        : tx('Insufficient balance', 'موجودی ناکافی')}
                  </span>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {plans.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {tx('No plans are available right now.', 'در حال حاضر پلنی موجود نیست.')}
        </Card>
      )}

      {selected && (
        <Modal
          title={tx('Confirm plan activation', 'تایید فعال‌سازی پلن')}
          onClose={() => setSelected(null)}
          open={!!selected}
        >
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-xl border bg-muted/25 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {tx('Plan', 'پلن')}
                </span>
                <span className="font-bold">{selected.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {tx('Duration', 'مدت')}
                </span>
                <span className="font-medium">
                  {tx('30 days', '۳۰ روز')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {tx('Bandwidth', 'پهنای باند')}
                </span>
                <span className="font-medium">
                  {fmtNum(selected.monthlyBandwidthGb, lang)} GB
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-muted-foreground">
                  {tx('Price', 'مبلغ')}
                </span>
                <span className="font-bold" dir="ltr">
                  {fmtNum(selected.priceToman, lang)}{' '}
                  {t(lang, 'wallet.currency')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {tx('Wallet balance', 'موجودی کیف پول')}
                </span>
                <span className="font-medium" dir="ltr">
                  {fmtNum(wallet?.balanceToman, lang)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {tx('Balance after purchase', 'موجودی پس از خرید')}
                </span>
                <span
                  className={`font-bold ${balanceAfter >= 0n ? 'text-emerald-600' : 'text-destructive'}`}
                  dir="ltr"
                >
                  {fmtNum(balanceAfter.toString(), lang)}
                </span>
              </div>
            </div>

            {!canAfford && (
              <Alert
                type="error"
                message={tx(
                  'Your wallet balance is not enough. Contact support to top up.',
                  'موجودی کیف پول کافی نیست. برای شارژ با پشتیبانی تماس بگیرید.',
                )}
              />
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(null)}
              >
                {t(lang, 'cancel')}
              </Button>
              <Button
                size="sm"
                onClick={purchase}
                disabled={buying || !canAfford}
              >
                {buying
                  ? tx('Activating…', 'در حال فعال‌سازی…')
                  : tx('Pay from wallet', 'پرداخت از کیف پول')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 border rounded-xl px-4 py-3">
        <span>
          {tx(
            'After activation, SOCKS5 endpoints and country routing unlock automatically.',
            'پس از فعال‌سازی، نودهای SOCKS5 و انتخاب کشور به‌صورت خودکار باز می‌شوند.',
          )}
        </span>
        <Link
          href="/user/credentials"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline shrink-0"
        >
          <span>{tx('Go to credentials', 'رفتن به کلیدها')}</span>
          <ArrowLeft className={`h-3.5 w-3.5 ${isRTL ? '' : 'rotate-180'}`} />
        </Link>
      </div>
    </div>
  );
}
