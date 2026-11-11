'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  User as UserIcon,
  Mail,
  Phone,
  Lock,
  KeyRound,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { api, setToken } from '../../lib/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '../../lib/ui';
import { t } from '../../lib/i18n';
import { useLang } from '../../lib/lang-context';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const isRTL = lang === 'fa';
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

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

  const copy =
    lang === 'fa'
      ? {
          phoneRequired: 'شماره موبایل جهت ارسال پیامک تایید و احراز هویت الزامی است.',
          codeTitle: 'تأیید شماره موبایل',
          codeHint: 'کد ارسال‌شده به شماره همراه شما را وارد کنید.',
          codeLabel: 'کد تأیید',
          codePlaceholder: '۱۲۳۴۵۶',
          send: 'ثبت‌نام و دریافت کد',
          verify: 'تأیید نهایی و ورود به پنل',
          sending: 'در حال ارسال کد…',
          verifying: 'در حال بررسی…',
          change: 'ویرایش اطلاعات و ارسال مجدد',
        }
      : {
          phoneRequired: 'A mobile phone number is required for verification.',
          codeTitle: 'Verify your phone number',
          codeHint: 'Enter the verification code sent to your phone.',
          codeLabel: 'Verification code',
          codePlaceholder: '123456',
          send: 'Continue & Send Code',
          verify: 'Verify & Enter Dashboard',
          sending: 'Sending code…',
          verifying: 'Verifying…',
          change: 'Edit details & resend',
        };

  async function startRegistration(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError(t(lang, 'reg.err.mismatch'));
      toast.error(t(lang, 'reg.err.mismatch'));
      return;
    }
    if (password.length < 6) {
      setError(t(lang, 'reg.err.short'));
      toast.error(t(lang, 'reg.err.short'));
      return;
    }
    if (!phone.trim()) {
      setError(copy.phoneRequired);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await api.startRegistration({ displayName, email, phone, password });
      setRegistrationId(result.registrationId);
      toast.success(tx('Verification code sent successfully', 'کد تأیید برای شما ارسال شد'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration could not be started';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function confirmRegistration(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await api.confirmRegistration(registrationId, code.trim());
      setToken(accessToken);
      toast.success(tx('Account created successfully!', 'حساب کاربری با موفقیت ساخته شد!'));
      router.push('/user/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-background to-muted/20 flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Top Floating Language Switcher */}
      <div className="w-full max-w-md flex justify-between items-center mb-4">
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          {isRTL ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          <span>{tx('Back to Home', 'بازگشت به صفحه اصلی')}</span>
        </Link>

        <button
          onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
        >
          <Globe2 className="h-3.5 w-3.5" />
          <span>{lang === 'en' ? 'فارسی' : 'EN'}</span>
        </button>
      </div>

      <Card className="w-full max-w-md shadow-xl border-border/80 overflow-hidden">
        {/* Header */}
        <CardHeader className="text-center pb-4 pt-6 bg-muted/20 border-b border-border/40">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mb-3 shadow-inner">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {verifying ? copy.codeTitle : t(lang, 'reg.title')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-1">
            {verifying ? copy.codeHint : t(lang, 'reg.subtitle')}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          {error && <Alert message={error} type="error" />}

          {!verifying ? (
            <form onSubmit={startRegistration} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t(lang, 'reg.name')}</span>
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t(lang, 'reg.name.placeholder')}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t(lang, 'reg.email')}</span>
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t(lang, 'reg.email.placeholder')}
                  dir="ltr"
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t(lang, 'reg.phone')}</span>
                </label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t(lang, 'reg.phone.placeholder')}
                  dir="ltr"
                  className="font-mono text-xs"
                  required
                />
                <p className="text-[11px] text-muted-foreground">{copy.phoneRequired}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t(lang, 'reg.password')}</span>
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t(lang, 'reg.password.placeholder')}
                    dir="ltr"
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t(lang, 'reg.confirm')}</span>
                  </label>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={t(lang, 'reg.confirm.placeholder')}
                    dir="ltr"
                    className="text-xs"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || !displayName.trim() || !email.trim() || !phone.trim() || !password.trim()}
                className="w-full gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{copy.sending}</span>
                  </>
                ) : (
                  <>
                    <span>{copy.send}</span>
                    {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={confirmRegistration} className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{copy.codeHint}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{copy.codeLabel}</span>
                </label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={copy.codePlaceholder}
                  dir="ltr"
                  className="text-center tracking-widest text-lg h-11 font-bold"
                  required
                />
              </div>

              <Button type="submit" disabled={loading || !code.trim()} className="w-full gap-2 mt-2">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{copy.verifying}</span>
                  </>
                ) : (
                  <span>{copy.verify}</span>
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setRegistrationId('');
                  setCode('');
                  setError('');
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
              >
                {copy.change}
              </button>
            </form>
          )}
        </CardContent>

        {!verifying && (
          <CardFooter className="p-4 bg-muted/10 border-t border-border/50 text-center justify-center text-xs text-muted-foreground">
            <span>
              {t(lang, 'reg.have_account')}{' '}
              <Link href="/login" className="text-primary font-semibold hover:underline">
                {t(lang, 'signin')}
              </Link>
            </span>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
