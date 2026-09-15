'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, setToken } from '../../lib/api';
import { Alert, Button, colors, Input } from '../../lib/ui';
import { t } from '../../lib/i18n';
import { useLang } from '../../lib/lang-context';

export default function RegisterPage() {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const verifying = Boolean(registrationId);
  const copy = lang === 'fa'
    ? {
        phoneRequired: 'شماره موبایل برای ایجاد حساب الزامی است.',
        codeTitle: 'تأیید شماره موبایل',
        codeHint: 'کد شش‌رقمی ارسال‌شده به شماره شما را وارد کنید.',
        codeLabel: 'کد تأیید',
        codePlaceholder: '۱۲۳۴۵۶',
        send: 'ارسال کد تأیید',
        verify: 'تأیید و ایجاد حساب',
        sending: 'در حال ارسال…',
        verifying: 'در حال تأیید…',
        change: 'ویرایش اطلاعات',
      }
    : {
        phoneRequired: 'A mobile number is required to create an account.',
        codeTitle: 'Verify your mobile number',
        codeHint: 'Enter the six-digit code sent to your phone.',
        codeLabel: 'Verification code',
        codePlaceholder: '123456',
        send: 'Send verification code',
        verify: 'Verify and create account',
        sending: 'Sending…',
        verifying: 'Verifying…',
        change: 'Edit details',
      };

  async function startRegistration(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setError(t(lang, 'reg.err.mismatch')); return; }
    if (password.length < 6) { setError(t(lang, 'reg.err.short')); return; }
    if (!phone.trim()) { setError(copy.phoneRequired); return; }

    setLoading(true);
    setError('');
    try {
      const result = await api.startRegistration({ displayName, email, phone, password });
      setRegistrationId(result.registrationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration could not be started');
    } finally {
      setLoading(false);
    }
  }

  async function confirmRegistration(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await api.confirmRegistration(registrationId, code);
      setToken(accessToken);
      router.push('/user/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 40, width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button onClick={() => setLang(lang === 'en' ? 'fa' : 'en')} style={{ background: 'none', border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 11, fontWeight: 700, padding: '3px 10px', cursor: 'pointer' }}>
            {lang === 'en' ? 'فا' : 'EN'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: colors.text }}>{verifying ? copy.codeTitle : t(lang, 'reg.title')}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textMuted }}>{verifying ? copy.codeHint : t(lang, 'reg.subtitle')}</p>
        </div>

        {!verifying ? (
          <form onSubmit={startRegistration} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label={t(lang, 'reg.name')} value={displayName} onChange={setDisplayName} placeholder={t(lang, 'reg.name.placeholder')} required />
            <Input label={t(lang, 'reg.email')} type="email" value={email} onChange={setEmail} placeholder={t(lang, 'reg.email.placeholder')} required />
            <Input label={t(lang, 'reg.phone')} type="tel" value={phone} onChange={setPhone} placeholder={t(lang, 'reg.phone.placeholder')} required />
            <p style={{ margin: '-8px 0 0', fontSize: 11, color: colors.textMuted }}>{copy.phoneRequired}</p>
            <Input label={t(lang, 'reg.password')} type="password" value={password} onChange={setPassword} placeholder={t(lang, 'reg.password.placeholder')} required />
            <Input label={t(lang, 'reg.confirm')} type="password" value={confirm} onChange={setConfirm} placeholder={t(lang, 'reg.confirm.placeholder')} required />
            {error && <Alert message={error} />}
            <Button type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>{loading ? copy.sending : copy.send}</Button>
          </form>
        ) : (
          <form onSubmit={confirmRegistration} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label={copy.codeLabel} value={code} onChange={setCode} placeholder={copy.codePlaceholder} required />
            {error && <Alert message={error} />}
            <Button type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>{loading ? copy.verifying : copy.verify}</Button>
            <button type="button" onClick={() => { setRegistrationId(''); setCode(''); setError(''); }} style={{ border: 'none', background: 'none', color: colors.textMuted, cursor: 'pointer' }}>{copy.change}</button>
          </form>
        )}
        {!verifying && <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 13, color: colors.textMuted }}>{t(lang, 'reg.have_account')} <Link href="/login" style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>{t(lang, 'signin')}</Link></p>}
      </div>
    </div>
  );
}
