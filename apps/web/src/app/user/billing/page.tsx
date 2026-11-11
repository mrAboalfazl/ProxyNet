'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, FinancialReport } from '../../../lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Alert,
  Spinner,
  Button,
  Badge,
  Table,
  Tr,
  Td,
  Pagination,
  BilingualDatePicker,
  formatDate,
  formatDateTime,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import {
  ReceiptText,
  Calendar,
  Layers,
  RotateCcw,
  TrendingDown,
} from 'lucide-react';

const labels: Record<string, [string, string]> = {
  requests: ['Requests', 'درخواست‌ها'],
  proxy_bandwidth: ['Proxy Bandwidth', 'پهنای‌باند پروکسی'],
  forwarding: ['Forwarding', 'فورواردینگ'],
  credentials: ['Credentials', 'اعتبارنامه‌ها'],
  other: ['Other Fees', 'سایر هزینه‌ها'],
};

function fmtNum(v: string | number, lang: string) {
  return Number(v).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
}

function fmtBytes(v: string, lang: string) {
  let x = Number(v);
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (x >= 1024 && i < 3) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i ? 2 : 0)} ${u[i]}`;
}

export default function BillingPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [report, setReport] = useState<FinancialReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [usagePage, setUsagePage] = useState(1);
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = () =>
    api
      .financialReport({
        page,
        usagePage,
        category,
        from,
        to,
        limit: 20,
        usageLimit: 20,
      })
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'));

  useEffect(() => {
    setError(null);
    load();
  }, [page, usagePage, category, from, to]);

  const maxDaily = useMemo(
    () =>
      Math.max(
        1,
        ...(report?.dailySpending.map((d) => Number(d.spentToman)) ?? [1])
      ),
    [report]
  );

  if (error) return <Alert message={error} type="error" />;
  if (!report) return <Spinner />;

  function resetFilters() {
    setCategory('');
    setFrom('');
    setTo('');
    setPage(1);
    setUsagePage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={tx('Usage & Financial Reports', 'گزارش مصرف و مالی')}
        description={tx(
          'Track itemized financial deductions, daily spending, and bandwidth logs.',
          'بررسی ریز هزینه‌های کسر شده، هزینه‌کرد روزانه و لاگ‌های ترافیک مصرفی.'
        )}
      />

      {/* Filter Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
            <div className="space-y-1.5 flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                <span>{tx('Category', 'دسته‌بندی')}</span>
              </label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                  setUsagePage(1);
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{tx('All Categories', 'همه دسته‌ها')}</option>
                {Object.entries(labels)
                  .filter(([k]) => k !== 'other')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v[lang === 'fa' ? 1 : 0]}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>{tx('From Date', 'از تاریخ')}</span>
              </label>
              <BilingualDatePicker
                value={from}
                onChange={(val) => {
                  setFrom(val);
                  setPage(1);
                  setUsagePage(1);
                }}
                lang={lang}
              />
            </div>

            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>{tx('To Date', 'تا تاریخ')}</span>
              </label>
              <BilingualDatePicker
                value={to}
                onChange={(val) => {
                  setTo(val);
                  setPage(1);
                  setUsagePage(1);
                }}
                lang={lang}
              />
            </div>

            <Button
              onClick={resetFilters}
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{tx('Clear Filters', 'پاک کردن فیلترها')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Daily Spending Visualization Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                {tx('Daily Spending — Last 30 Days', 'هزینه روزانه — ۳۰ روز اخیر')}
              </CardTitle>
              <CardDescription className="text-xs">
                {tx(
                  'Breakdown of daily proxy traffic and forwarding charges in Toman',
                  'نمودار مبالغ کسر شده بابت درخواست‌ها و ترافیک در روزهای گذشته'
                )}
              </CardDescription>
            </div>
            <TrendingDown className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-44 flex items-end gap-1.5 border-b border-border/80 pb-2 px-1">
            {report.dailySpending.map((d) => {
              const spent = Number(d.spentToman);
              const heightPct = Math.max(4, Math.round((spent / maxDaily) * 100));
              return (
                <div
                  key={d.day}
                  title={`${d.day}: ${fmtNum(d.spentToman, lang)} ${t(lang, 'wallet.currency')}`}
                  className="group relative flex-1 min-w-[6px] rounded-t bg-primary/70 hover:bg-primary transition-all cursor-pointer"
                  style={{ height: `${heightPct}%` }}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-white shadow-lg pointer-events-none">
                    {d.day}: {fmtNum(d.spentToman, lang)} {t(lang, 'wallet.currency')}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground pt-2">
            <span>{report.dailySpending[0]?.day ? formatDate(report.dailySpending[0].day, lang, { format: 'short' }) : '—'}</span>
            <span>{report.dailySpending.at(-1)?.day ? formatDate(report.dailySpending.at(-1)!.day, lang, { format: 'short' }) : '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Financial Deductions Table Card */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">
              {tx('Financial Transactions', 'تراکنش‌های مالی')}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {tx(`Total: ${report.transactionsTotal}`, `مجموع: ${report.transactionsTotal}`)}
          </span>
        </div>

        <Card className="overflow-hidden">
          <Table
            headers={[
              tx('Category', 'دسته‌بندی'),
              tx('Description', 'شرح تراکنش'),
              tx('Amount', 'مبلغ'),
              tx('Date', 'تاریخ'),
            ]}
          >
            {report.transactions.length === 0 ? (
              <Tr>
                <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  {tx('No financial transactions found.', 'تراکنشی در این بازه یافت نشد.')}
                </td>
              </Tr>
            ) : (
              report.transactions.map((txn) => {
                const amount = Number(txn.amountToman);
                const isCredit = amount >= 0;
                return (
                  <Tr key={txn.id}>
                    <Td>
                      <Badge
                        label={labels[txn.type]?.[lang === 'fa' ? 1 : 0] ?? txn.type}
                        variant="secondary"
                      />
                    </Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">
                        {txn.description || '—'}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className={`text-xs font-bold ${
                          isCredit ? 'text-emerald-600' : 'text-destructive'
                        }`}
                        dir="ltr"
                      >
                        {isCredit ? '+' : ''}
                        {fmtNum(txn.amountToman, lang)} {t(lang, 'wallet.currency')}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(txn.createdAt, lang)}
                      </span>
                    </Td>
                  </Tr>
                );
              })
            )}
          </Table>

          <Pagination
            currentPage={page}
            totalItems={report.transactionsTotal}
            pageSize={15}
            onPageChange={setPage}
            lang={lang}
          />
        </Card>
      </div>

      {/* Usage Events Table Card */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">
              {tx('Raw Usage Logs', 'سوابق ترافیک عبوری')}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {tx(`Total: ${report.usageTotal}`, `مجموع: ${report.usageTotal}`)}
          </span>
        </div>

        <Card className="overflow-hidden">
          <Table
            headers={[
              tx('Protocol', 'پروتکل'),
              tx('Event Type', 'نوع رویداد'),
              tx('Bandwidth In/Out', 'حجم منتقل‌شده'),
              tx('Timestamp', 'زمان وقوع'),
            ]}
          >
            {report.usage.length === 0 ? (
              <Tr>
                <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  {tx('No usage records found.', 'لاگی در این بازه یافت نشد.')}
                </td>
              </Tr>
            ) : (
              report.usage.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted">
                      {u.protocol.toUpperCase()}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-muted-foreground">{u.eventType}</span>
                  </Td>
                  <Td>
                    <span className="text-xs font-medium" dir="ltr">
                      {fmtBytes(String(Number(u.bytesIn) + Number(u.bytesOut)), lang)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(u.occurredAt, lang)}
                    </span>
                  </Td>
                </Tr>
              ))
            )}
          </Table>

          <Pagination
            currentPage={usagePage}
            totalItems={report.usageTotal}
            pageSize={25}
            onPageChange={setUsagePage}
            lang={lang}
          />
        </Card>
      </div>
    </div>
  );
}
