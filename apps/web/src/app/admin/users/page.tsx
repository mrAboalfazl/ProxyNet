'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, User } from '../../../lib/api';
import { PageHeader, Card, Table, Tr, Td, Badge, Button, Alert, Spinner, colors } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';

export default function AdminUsersPage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => lang === 'fa' ? fa : en;
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(p = page) {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(userId: string, status: string) {
    try {
      await api.users.setStatus(userId, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    }
  }

  useEffect(() => { load(); }, []);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader title={`${tx('Users', 'کاربران')} (${total})`} />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {loading ? <Spinner /> : (
        <>
          <Card>
            <Table headers={[tx('Email', 'ایمیل'), tx('Name', 'نام'), tx('Status', 'وضعیت'), tx('Joined', 'عضویت'), tx('Actions', 'عملیات')]}>
              {users.length === 0 ? (
                <Tr>
                  <td colSpan={5} style={{ padding: '32px 16px', color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
                    {tx('No users found.', 'کاربری پیدا نشد.')}
                  </td>
                </Tr>
              ) : users.map((user) => (
                <Tr key={user.id}>
                  <Td style={{ fontWeight: 500 }}>{user.email}</Td>
                  <Td style={{ color: colors.textMuted }}>{user.displayName || '—'}</Td>
                  <Td><Badge label={user.status} /></Td>
                  <Td style={{ fontSize: 13, color: colors.textMuted }}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link href={`/admin/users/${user.id}`}>
                        <Button variant="primary" size="sm">{tx('Details', 'جزئیات')}</Button>
                      </Link>
                      {user.status === 'active' && (
                        <Button onClick={() => setStatus(user.id, 'suspended')} variant="secondary" size="sm">{tx('Suspend', 'تعلیق')}</Button>
                      )}
                      {user.status === 'suspended' && (
                        <Button onClick={() => setStatus(user.id, 'active')} variant="primary" size="sm">{tx('Restore', 'فعال‌سازی')}</Button>
                      )}
                      {user.status !== 'banned' && (
                        <Button onClick={() => setStatus(user.id, 'banned')} variant="danger" size="sm">{tx('Ban', 'مسدود کردن')}</Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <Button onClick={() => { const p = page - 1; setPage(p); load(p); }} disabled={page <= 1} variant="secondary" size="sm">← Prev</Button>
              <span style={{ padding: '6px 12px', fontSize: 14, color: colors.textMuted }}>Page {page} of {totalPages}</span>
              <Button onClick={() => { const p = page + 1; setPage(p); load(p); }} disabled={page >= totalPages} variant="secondary" size="sm">Next →</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
