'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Lock,
  Mail,
  Phone,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Globe2,
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
import { useLang } from '../../lib/lang-context';
import { t } from '../../lib/i18n';
import { toast } from 'sonner';

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
  const isRTL = lang === 'fa';
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

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

  function loginError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : fallback;
    if (lang === 'fa' && message === 'Phone number is not registered') {
      return 'این شماره موبایل ثبت‌نام نشده است.';
    }
    return message;
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await api.login(identifier, password);
      setToken(accessToken);
      const role = getRoleFromToken(accessToken);
      toast.success(tx('Logged in successfully', 'ورود موفقیت‌آمیز بود'));
      router.push(role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
    } catch (err) {
      setError(loginError(err, 'Login failed'));
      toast.error(tx('Login failed', 'ورود ناموفق بود'));
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
        setError(
          lang === 'fa'
            ? 'کدی ارسال نشد. ابتدا با این شماره ثبت‌نام کنید.'
            : 'Code not sent. Please register with this phone number first.'
        );
        return;
      }
      setCodeSent(true);
      toast.success(tx('Verification code sent', 'کد تایید ارسال شد'));
    } catch (err) {
      setError(loginError(err, 'Failed to send code'));
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
      const role = getRoleFromToken(accessToken);
      toast.success(tx('Logged in successfully', 'ورود موفقیت‌آمیز بود'));
      router.push(role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
    } catch (err) {
      setError(loginError(err, 'Invalid code'));
    } finally {
      setLoading(false);
    }
  }

  // Quick fill helper for dev/testing
  function fillCredentials(email: string, pass: string) {
    setTab('password');
    setIdentifier(email);
    setPassword(pass);
    setError('');
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
            <Shield className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {t(lang, 'login.title')}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t(lang, 'login.subtitle')}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          {/* Auth Method Tabs */}
          <div className="flex p-1 bg-muted/60 rounded-lg border border-border/50 text-xs">
            <button
              type="button"
              onClick={() => {
                setTab('password');
                setError('');
              }}
              className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                tab === 'password'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(lang, 'login.tab.password')}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('sms');
                setError('');
                setCodeSent(false);
              }}
              className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                tab === 'sms'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(lang, 'login.tab.sms')}
            </button>
          </div>

          {error && <Alert message={error} type="error" />}

          {/* Password Form */}
          {tab === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t(lang, 'login.email')}</span>
                </label>
                <Input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={t(lang, 'login.email.placeholder')}
                  dir="ltr"
                  className="font-mono text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t(lang, 'login.password')}</span>
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t(lang, 'login.password.placeholder')}
                  dir="ltr"
                  className="text-xs"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !identifier.trim() || !password.trim()}
                className="w-full gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t(lang, 'login.signing')}</span>
                  </>
                ) : (
                  <>
                    <span>{t(lang, 'login.submit')}</span>
                    {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </>
                )}
              </Button>
            </form>
          )}

          {/* SMS OTP Form */}
          {tab === 'sms' && !codeSent && (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t(lang, 'login.phone')}</span>
                </label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t(lang, 'login.phone.placeholder')}
                  dir="ltr"
                  className="font-mono text-xs"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !phone.trim()}
                className="w-full gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t(lang, 'login.sending')}</span>
                  </>
                ) : (
                  <>
                    <span>{t(lang, 'login.sendcode')}</span>
                    {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </>
                )}
              </Button>
            </form>
          )}

          {tab === 'sms' && codeSent && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs">
                {t(lang, 'login.code_sent')}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t(lang, 'login.code')}</span>
                </label>
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t(lang, 'login.code.placeholder')}
                  dir="ltr"
                  className="font-mono text-center tracking-widest text-base"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t(lang, 'login.signing')}</span>
                  </>
                ) : (
                  <span>{t(lang, 'login.verify')}</span>
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                  setError('');
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
              >
                {t(lang, 'login.change_phone')}
              </button>
            </form>
          )}

          {/* Quick-Fill Testing Accounts Box */}
          <div className="pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>{tx('Quick Login for Testing:', 'ورود سریع جهت تست و بررسی:')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('admin@platform.local', 'admin123')}
                className="p-2 rounded-lg border border-border/70 bg-muted/40 hover:bg-muted text-start text-xs transition-colors"
              >
                <div className="font-semibold text-primary truncate">مدیر سیستم (Admin)</div>
                <div className="text-[10px] text-muted-foreground font-mono">admin@platform.local</div>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('bitserver@local.test', 'admin123')}
                className="p-2 rounded-lg border border-border/70 bg-muted/40 hover:bg-muted text-start text-xs transition-colors"
              >
                <div className="font-semibold text-foreground truncate">کاربر تستی (User)</div>
                <div className="text-[10px] text-muted-foreground font-mono">bitserver@local.test</div>
              </button>
            </div>
          </div>
        </CardContent>

        <CardFooter className="p-4 bg-muted/10 border-t border-border/50 text-center justify-center text-xs text-muted-foreground">
          <span>
            {t(lang, 'login.no_account')}{' '}
            <Link href="/register" className="text-primary font-semibold hover:underline">
              {t(lang, 'register')}
            </Link>
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
