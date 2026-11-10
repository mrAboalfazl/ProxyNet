'use client';

import { useEffect, useState } from 'react';
import { api, WalletMeResponse, WalletTransaction } from '../../../lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Alert,
  Spinner,
  Badge,
  Table,
  Tr,
  Td,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import { AccountStatusStrip } from '../../../lib/account-status';
import {
  Wallet,
  Coins,
  AlertCircle,
  Receipt,
  Sparkles,
} from 'lucide-react';

function fmtNum(n: string | number, lang: string): string {
  const num = typeof n === 'string' ? Number(n) : n;
  return num.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
}

export default function WalletPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);
  const [wallet, setWallet] = useState<WalletMeResponse | null>(null);
  const [txns, setTxns] = useState<WalletTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.wallet.me(), api.wallet.transactions(50)])
      .then(([w, t]) => {
        setWallet(w);
        setTxns(t);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'));
  }, []);

  if (error) return <Alert message={error} type="error" />;
  if (!wallet || !txns) return <Spinner />;

  const balance = BigInt(wallet.balanceToman);
  const minBalance = BigInt(wallet.pricing.minBalanceToman);
  const belowMin = balance < minBalance;

  return (
    <div className="space-y-6">
      <AccountStatusStrip lang={lang} />

      <PageHeader
        title={t(lang, 'wallet.title')}
        description={tx(
          'View your prepaid credit balance, platform tariffs, and ledger history.',
          'مشاهده اعتبار پیش‌پرداخت، نرخ‌های فعال سامانه و صورت‌حساب ریز تراکنش‌ها.'
        )}
      />

      {/* Main Balance Banner Card */}
      <Card
        className={`border-2 ${
          belowMin
            ? 'border-destructive/40 bg-gradient-to-br from-destructive/10 via-background to-background'
            : 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-background to-background'
        }`}
      >
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <span>{t(lang, 'wallet.balance')}</span>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span
                  className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
                    belowMin ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                  dir="ltr"
                >
                  {fmtNum(wallet.balanceToman, lang)}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {t(lang, 'wallet.currency')}
                </span>
              </div>
            </div>

            <Badge
              label={belowMin ? tx('Low Balance', 'نیازمند شارژ') : tx('Good Standing', 'موجودی کافی')}
              variant={belowMin ? 'destructive' : 'success'}
              className="self-start sm:self-auto py-1 px-3 text-xs"
            />
          </div>

          {belowMin && (
            <div className="mt-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-xs sm:text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {balance === 0n
                  ? t(lang, 'wallet.zero_balance').replace(
                      '{min}',
                      fmtNum(wallet.pricing.minBalanceToman, lang)
                    )
                  : t(lang, 'wallet.low_balance_warning')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Rates Overview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t(lang, 'wallet.pricing_title')}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {tx(
              'Automated billing rules applied on every forwarder and gateway request.',
              'نرخ‌های کسر اعتبار به ازای هر درخواست و ترافیک ارسالی.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t(lang, 'wallet.pricing_per_request')}
              </span>
              <div className="flex items-baseline gap-1 pt-1 font-mono">
                <span className="text-xl font-bold">
                  {fmtNum(wallet.pricing.perRequestToman, lang)}
                </span>
                <span className="text-xs text-muted-foreground">{t(lang, 'wallet.currency')}</span>
              </div>
            </div>

            <div className="p-4 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t(lang, 'wallet.pricing_per_mb')}
              </span>
              <div className="flex items-baseline gap-1 pt-1 font-mono">
                <span className="text-xl font-bold">
                  {fmtNum(wallet.pricing.perMbToman, lang)}
                </span>
                <span className="text-xs text-muted-foreground">{t(lang, 'wallet.currency')}</span>
              </div>
            </div>

            <div className="p-4 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t(lang, 'wallet.pricing_min_balance')}
              </span>
              <div className="flex items-baseline gap-1 pt-1 font-mono">
                <span className="text-xl font-bold">
                  {fmtNum(wallet.pricing.minBalanceToman, lang)}
                </span>
                <span className="text-xs text-muted-foreground">{t(lang, 'wallet.currency')}</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border bg-sky-50 dark:bg-sky-950/20 text-xs text-sky-900 dark:text-sky-200 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-600 shrink-0" />
            <span>{t(lang, 'wallet.topup_note')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History Ledger */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t(lang, 'wallet.transactions')}</h2>
        </div>

        {txns.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <p>{t(lang, 'wallet.no_transactions')}</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table
              headers={[
                t(lang, 'wallet.tx.date'),
                t(lang, 'wallet.tx.type'),
                t(lang, 'wallet.tx.description'),
                t(lang, 'wallet.tx.amount'),
                t(lang, 'wallet.tx.balance'),
              ]}
            >
              {txns.map((txItem) => {
                const amount = BigInt(txItem.amountToman);
                const isCredit = amount >= 0n;

                return (
                  <Tr key={txItem.id}>
                    <Td>
                      <span className="text-xs text-muted-foreground">
                        {new Date(txItem.createdAt).toLocaleString(
                          lang === 'fa' ? 'fa-IR' : 'en-US',
                          { dateStyle: 'short', timeStyle: 'short' }
                        )}
                      </span>
                    </Td>
                    <Td>
                      <Badge
                        label={
                          t(lang, `wallet.type.${txItem.type}`) ===
                          `wallet.type.${txItem.type}`
                            ? txItem.type
                            : t(lang, `wallet.type.${txItem.type}`)
                        }
                        variant={isCredit ? 'success' : 'secondary'}
                      />
                    </Td>
                    <Td>
                      <span
                        className="text-xs text-muted-foreground line-clamp-1 max-w-[280px]"
                        title={txItem.description ?? ''}
                      >
                        {txItem.description || '—'}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className={`text-xs font-mono font-bold ${
                          isCredit ? 'text-emerald-600' : 'text-destructive'
                        }`}
                        dir="ltr"
                      >
                        {isCredit ? '+' : ''}
                        {fmtNum(txItem.amountToman, lang)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs font-mono text-muted-foreground" dir="ltr">
                        {fmtNum(txItem.balanceAfterToman, lang)}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
