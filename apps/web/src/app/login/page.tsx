'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setToken } from '../../lib/api';
import { Button, Input, Alert, colors } from '../../lib/ui';
import { useLang } from '../../lib/lang-context';
import { t } from '../../lib/i18n';

function getRoleFromToken(token: string): 'admin' | 'user' {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role === 'admin' ? 'admin' : 'user';
  } catch {
    return 'user';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { lang, setLang } = useLang();

  const [tab, setTab] = useState<'password' | 'sms'>('password');

  // Password tab
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // SMS tab
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await api.login(identifier, password);
      setToken(accessToken);
      router.push(getRoleFromToken(accessToken) === 'admin' ? '/admin/dashboard' : '/user/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.sendOtp(phone.trim(), 'sms_otp');
      if (!result.sent) {
        setError(lang === 'fa'
          ? 'کدی ارسال نشد. ابتدا با این شماره ثبت‌نام کنید.'
          : 'Code not sent. Please register with this phone number first.');
        return;
      }
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await api.verifyOtp(phone.trim(), 'sms_otp', code.trim());
      setToken(accessToken);
      router.push(getRoleFromToken(accessToken) === 'admin' ? '/admin/dashboard' : '/user/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: 'none', background: active ? colors.primary : '#f3f4f6',
    color: active ? '#fff' : colors.textMuted, borderRadius: 6,
    transition: 'all 0.15s',
  });

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: colors.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: 12, padding: 40,
        width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
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
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: colors.text }}>{t(lang, 'login.title')}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textMuted }}>{t(lang, 'login.subtitle')}</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f3f4f6', padding: 4, borderRadius: 8 }}>
          <button style={tabStyle(tab === 'password')} onClick={() => { setTab('password'); setError(''); }}>
            {t(lang, 'login.tab.password')}
          </button>
          <button style={tabStyle(tab === 'sms')} onClick={() => { setTab('sms'); setError(''); setCodeSent(false); }}>
            {t(lang, 'login.tab.sms')}
          </button>
        </div>

        {/* Password tab */}
        {tab === 'password' && (
          <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              label={t(lang, 'login.email')}
              type="text"
              value={identifier}
              onChange={setIdentifier}
              placeholder={t(lang, 'login.email.placeholder')}
              required
            />
            <Input
              label={t(lang, 'login.password')}
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={t(lang, 'login.password.placeholder')}
              required
            />
            {error && <Alert message={error} />}
            <Button type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? t(lang, 'login.signing') : t(lang, 'login.submit')}
            </Button>
          </form>
        )}

        {/* SMS OTP tab */}
        {tab === 'sms' && !codeSent && (
          <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              label={t(lang, 'login.phone')}
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder={t(lang, 'login.phone.placeholder')}
              required
            />
            {error && <Alert message={error} />}
            <Button type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? t(lang, 'login.sending') : t(lang, 'login.sendcode')}
            </Button>
          </form>
        )}

        {tab === 'sms' && codeSent && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, fontSize: 13, color: '#166534',
            }}>
              {t(lang, 'login.code_sent')}
            </div>
            <Input
              label={t(lang, 'login.code')}
              type="text"
              value={code}
              onChange={setCode}
              placeholder={t(lang, 'login.code.placeholder')}
              required
            />
            {error && <Alert message={error} />}
            <Button type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? t(lang, 'login.signing') : t(lang, 'login.verify')}
            </Button>
            <button
              type="button"
              onClick={() => { setCodeSent(false); setCode(''); setError(''); }}
              style={{
                background: 'none', border: 'none', color: colors.textMuted,
                fontSize: 12, cursor: 'pointer', textAlign: 'center',
              }}
            >
              {t(lang, 'login.change_phone')}
            </button>
          </form>
        )}

        <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
          {t(lang, 'login.no_account')}{' '}
          <Link href="/register" style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>
            {t(lang, 'register')}
          </Link>
          {' · '}
          <Link href="/" style={{ color: colors.textMuted, textDecoration: 'none' }}>
            {t(lang, 'login.home')}
          </Link>
        </p>
      </div>
    </div>
  );
}
