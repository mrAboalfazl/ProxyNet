'use client';

import { useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { api } from '../../../lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Alert,
  Spinner,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';

interface Me {
  id: string;
  displayName: string | null;
  email: string | null;
  status: string;
}

export default function UserProfilePage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .me()
      .then((profile) => {
        setMe(profile as Me);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={t(lang, 'prof.title')}
        description={tx(
          'Manage your account profile and personal identity.',
          'مدیریت اطلاعات کاربری و هویت در سامانه.'
        )}
      />

      {error && <Alert message={error} type="error" />}

      {/* Account Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t(lang, 'prof.account')}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {tx('Registered account credentials and role', 'اطلاعات هویت کاربری و نقش در سامانه')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t(lang, 'prof.name')}
              </span>
              <p className="text-sm font-medium">{me?.displayName || '—'}</p>
            </div>

            <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t(lang, 'prof.email')}
              </span>
              <p className="text-sm font-medium font-mono" dir="ltr">
                {me?.email || '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
