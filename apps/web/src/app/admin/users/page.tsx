'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api, User } from '../../../lib/api';
import {
  PageHeader,
  Card,
  Table,
  Tr,
  Td,
  Badge,
  Button,
  Alert,
  Spinner,
  Input,
  Pagination,
  formatDateTime,
  toPersianDigits,
} from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';
import { toast } from 'sonner';
import {
  RefreshCw,
  ExternalLink,
  PauseCircle,
  CheckCircle2,
  UserX,
  Mail,
  Calendar,
} from 'lucide-react';

export default function AdminUsersPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function load(p = page, showToast = false) {
    setLoading(true);
    try {
      const data = await api.users.list(p);
      if (Array.isArray(data)) {
        setUsers(data as unknown as User[]);
        setTotal((data as unknown as User[]).length);
      } else {
        setUsers(data.users);
        setTotal(data.total);
      }
      setError('');
      if (showToast) {
        toast.success(tx('Users list updated', 'فهرست کاربران به‌روزرسانی شد'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load users';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(userId: string, status: string) {
    setActionBusy(userId);
    try {
      await api.users.setStatus(userId, status);
      toast.success(
        tx(
          `User status changed to ${status}`,
          `وضعیت کاربر به ${status === 'active' ? 'فعال' : status === 'suspended' ? 'معلق' : 'مسدود'} تغییر یافت`
        )
      );
      await load(page);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update user';
      setError(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.displayName && u.displayName.toLowerCase().includes(q))
    );
  }, [users, search]);

  const pageSize = 20;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${tx('Registered Users', 'مدیریت کاربران')} (${lang === 'fa' ? toPersianDigits(total) : total})`}
        description={tx(
          'View, inspect, suspend, or ban customer accounts.',
          'مشاهده، بازرسی سهمیه، تعلیق و مسدودسازی حساب‌های کاربری پلتفرم.'
        )}
        action={
          <Button onClick={() => load(page, true)} variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4" />
            {tx('Refresh', 'تازه‌سازی')}
          </Button>
        }
      />

      {error && <Alert message={error} type="error" />}

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Input
            placeholder={tx('Search email or name…', 'جستجوی ایمیل یا نام کاربر…')}
            value={search}
            onChange={setSearch}
          />
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {tx(`Showing ${filtered.length} users`, `نمایش ${toPersianDigits(filtered.length)} کاربر`)}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table
              headers={[
                tx('Email / Account', 'ایمیل / حساب'),
                tx('Display Name', 'نام نمایشی'),
                tx('Status', 'وضعیت'),
                tx('Joined Date', 'تاریخ عضویت'),
                tx('Actions', 'عملیات'),
              ]}
            >
              {filtered.length === 0 ? (
                <Tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {tx('No users found matching criteria.', 'کاربری با این مشخصات یافت نشد.')}
                  </td>
                </Tr>
              ) : (
                filtered.map((user) => (
                  <Tr key={user.id}>
                    <Td>
                      <div className="flex items-center gap-2 font-medium">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{user.email}</span>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-muted-foreground">
                        {user.displayName || '—'}
                      </span>
                    </Td>
                    <Td>
                      <Badge
                        label={
                          user.status === 'active'
                            ? tx('Active', 'فعال')
                            : user.status === 'suspended'
                            ? tx('Suspended', 'معلق')
                            : user.status === 'banned'
                            ? tx('Banned', 'مسدود')
                            : user.status
                        }
                        variant={
                          user.status === 'active'
                            ? 'success'
                            : user.status === 'suspended'
                            ? 'warning'
                            : 'destructive'
                        }
                      />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDateTime(user.createdAt, lang)}</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/users/${user.id}`}>
                          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs font-medium">
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{tx('Details', 'جزئیات')}</span>
                          </Button>
                        </Link>
                        {user.status === 'active' && (
                          <Button
                            onClick={() => setStatus(user.id, 'suspended')}
                            disabled={actionBusy === user.id}
                            variant="secondary"
                            size="sm"
                            className="gap-1.5 h-8 text-xs font-medium border border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                            <span>{tx('Suspend', 'تعلیق')}</span>
                          </Button>
                        )}
                        {user.status === 'suspended' && (
                          <Button
                            onClick={() => setStatus(user.id, 'active')}
                            disabled={actionBusy === user.id}
                            variant="primary"
                            size="sm"
                            className="gap-1.5 h-8 text-xs font-medium"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>{tx('Restore', 'فعال‌سازی')}</span>
                          </Button>
                        )}
                        {user.status !== 'banned' && (
                          <Button
                            onClick={() => setStatus(user.id, 'banned')}
                            disabled={actionBusy === user.id}
                            variant="danger"
                            size="sm"
                            className="gap-1.5 h-8 text-xs font-medium"
                          >
                            <UserX className="h-3.5 w-3.5" />
                            <span>{tx('Ban', 'مسدود')}</span>
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </Table>

            <Pagination
              currentPage={page}
              totalItems={total}
              pageSize={pageSize}
              onPageChange={(p) => {
                setPage(p);
                load(p);
              }}
              lang={lang}
            />
          </Card>
        </>
      )}
    </div>
  );
}
