'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setToken } from '../../lib/api';
import { Button, Input, Alert, colors } from '../../lib/ui';
import { useLang } from '../../lib/lang-context';
import { t } from '../../lib/i18n';

export default function RegisterPage() {
  const router = useRouter();
  const { lang, setLang } = useLang();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError(t(lang, 'reg.err.mismatch')); return; }
    if (password.length < 6) { setError(t(lang, 'reg.err.short')); return; }
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await api.register(displayName, email, password, phone || undefined);
      setToken(accessToken);
      router.push('/user/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: colors.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: 12, padding: 40,
        width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
      }}>
        {/* Lang toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
            style={{
              background: 'none', border: `1px solid ${colors.border}`, borderRadius: 6,
              color: colors.textMuted, fontSize: 11, fontWeight: 700, padding: '3px 10px', cursor: 'pointer',
            }}
          >
            {lang === 'en' ? 'فا' : 'EN'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, backgroundColor: colors.navy, borderRadius: 12,
            margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: colors.text }}>{t(lang, 'reg.title')}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textMuted }}>{t(lang, 'reg.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input
            label={t(lang, 'reg.name')}
            value={displayName}
            onChange={setDisplayName}
            placeholder={t(lang, 'reg.name.placeholder')}
            required
          />
          <Input
            label={t(lang, 'reg.email')}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder={t(lang, 'reg.email.placeholder')}
            required
          />
          <div>
            <Input
              label={t(lang, 'reg.phone')}
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder={t(lang, 'reg.phone.placeholder')}
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: colors.textMuted }}>
              {t(lang, 'reg.phone.hint')}
            </p>
          </div>
          <Input
            label={t(lang, 'reg.password')}
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={t(lang, 'reg.password.placeholder')}
            required
          />
          <Input
            label={t(lang, 'reg.confirm')}
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder={t(lang, 'reg.confirm.placeholder')}
            required
          />

          {error && <Alert message={error} />}

          <Button type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            {loading ? t(lang, 'reg.creating') : t(lang, 'reg.submit')}
          </Button>
        </form>

        <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
          {t(lang, 'reg.have_account')}{' '}
          <Link href="/login" style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>
            {t(lang, 'signin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
