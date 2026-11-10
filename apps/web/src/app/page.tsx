'use client';

import Link from 'next/link';
import { useLang } from '../lib/lang-context';
import { t } from '../lib/i18n';
import {
  Shield,
  Globe2,
  Zap,
  Activity,
  KeyRound,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Lock,
  Sparkles,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function LandingPage() {
  const { lang, setLang } = useLang();
  const isRTL = lang === 'fa';
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const features = [
    {
      icon: Lock,
      title: t(lang, 'feat.0.title'),
      desc: t(lang, 'feat.0.desc'),
      badge: tx('Encryption', 'رمزنگاری قدرتمند'),
    },
    {
      icon: Globe2,
      title: t(lang, 'feat.1.title'),
      desc: t(lang, 'feat.1.desc'),
      badge: tx('Multi-Region', 'نودهای چندمنطقه‌ای'),
    },
    {
      icon: Zap,
      title: t(lang, 'feat.2.title'),
      desc: t(lang, 'feat.2.desc'),
      badge: tx('Zero Overhead', 'بدون سربار'),
    },
    {
      icon: Activity,
      title: t(lang, 'feat.3.title'),
      desc: t(lang, 'feat.3.desc'),
      badge: tx('Smart Failover', 'پایش خودکار'),
    },
    {
      icon: BarChart3,
      title: t(lang, 'feat.4.title'),
      desc: t(lang, 'feat.4.desc'),
      badge: tx('Real-time Metrics', 'پایش بلادرنگ'),
    },
    {
      icon: KeyRound,
      title: t(lang, 'feat.5.title'),
      desc: t(lang, 'feat.5.desc'),
      badge: tx('Granular Keys', 'اعتبارنامه‌های مجزا'),
    },
  ];

  const steps = [
    {
      step: '۰۱',
      title: t(lang, 'step.1.title'),
      desc: t(lang, 'step.1.desc'),
    },
    {
      step: '۰۲',
      title: t(lang, 'step.2.title'),
      desc: t(lang, 'step.2.desc'),
    },
    {
      step: '۰۳',
      title: t(lang, 'step.3.title'),
      desc: t(lang, 'step.3.desc'),
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center transition-all group-hover:scale-105 shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base sm:text-lg tracking-tight">
                {t(lang, 'brand')}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono leading-none">
                Platform v1.2
              </span>
            </div>
          </Link>

          {/* Quick Nav Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              {t(lang, 'features.title')}
            </a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              {t(lang, 'steps.title')}
            </a>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={() => setLang(isRTL ? 'en' : 'fa')}
              className="px-2 py-1 sm:px-2.5 sm:py-1 rounded-md border border-border bg-card hover:bg-muted text-[11px] sm:text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
            >
              <span className="hidden sm:inline">{isRTL ? 'English' : 'فارسی'}</span>
              <span className="sm:hidden">{isRTL ? 'EN' : 'فا'}</span>
            </button>

            <Link href="/login" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm" className="text-xs">
                {t(lang, 'nav.signin')}
              </Button>
            </Link>

            <Link href="/register">
              <Button size="sm" className="text-xs shadow-sm gap-1 sm:gap-1.5 px-3">
                <span>{t(lang, 'nav.getstarted')}</span>
                {isRTL ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/10 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="container max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t(lang, 'hero.badge')}</span>
          </div>

          {/* Main Hero Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.18] text-balance">
            {t(lang, 'hero.title')}
          </h1>

          {/* Subtitle */}
          <p className="max-w-2xl mx-auto text-muted-foreground text-sm sm:text-lg leading-relaxed text-balance">
            {t(lang, 'hero.subtitle')}
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto text-sm font-semibold gap-2 shadow-lg shadow-primary/25">
                <Sparkles className="h-4 w-4" />
                <span>{t(lang, 'hero.cta_primary')}</span>
                {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </Link>

            <Link href="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-sm font-semibold gap-2">
                <span>{t(lang, 'hero.cta_secondary')}</span>
              </Button>
            </Link>
          </div>

          {/* Technical Code Preview Card */}
          <div className="pt-8 max-w-2xl mx-auto text-left" dir="ltr">
            <div className="rounded-xl border border-zinc-800 bg-[#0d1117] text-zinc-100 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 text-xs font-mono text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-rose-500/80 inline-block" />
                  <span className="h-3 w-3 rounded-full bg-amber-500/80 inline-block" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block" />
                  <span className="ml-2 text-zinc-300 font-sans text-xs">proxynet-request.sh</span>
                </div>
                <span className="text-[10px] uppercase font-bold text-emerald-400">200 OK</span>
              </div>
              <pre className="p-4 text-xs font-mono leading-relaxed text-zinc-200 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <code>{`# Outbound API Request via ProxyNet Gateway
curl -X POST "http://localhost:3000/api/gateway/fetch" \\
  -H "Authorization: Basic base64(uuid:secret)" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://api.ipify.org?format=json"}'

# Verified Response (Status: 200 OK, Latency: 28ms)
{ "ip": "185.220.101.5", "country": "DE", "status": "healthy" }`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Metric Strip */}
      <section className="border-y border-border/60 bg-muted/30 py-8">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-black text-foreground font-mono">۹۹.۹٪</p>
              <p className="text-xs text-muted-foreground">{tx('Uptime SLA', 'پایداری شبکه (SLA)')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-black text-foreground font-mono" dir="ltr">+6</p>
              <p className="text-xs text-muted-foreground">{tx('Global Exit Regions', 'لوکیشن‌های خروج بین‌المللی')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-black text-foreground font-mono" dir="ltr">&lt; 35ms</p>
              <p className="text-xs text-muted-foreground">{tx('Routing Latency', 'میانگین زمان پاسخگویی')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">SOCKS5 / HTTP</p>
              <p className="text-xs text-muted-foreground">{tx('Standard Protocols', 'پروتکل‌های ارتباطی استاندارد')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-16 sm:py-24">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              {t(lang, 'features.title')}
            </h2>
            <p className="text-xs sm:text-base text-muted-foreground">
              {t(lang, 'features.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Card key={idx} className="border-border/80 shadow-sm hover:border-primary/50 transition-all flex flex-col justify-between">
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant="outline" className="text-[11px] font-medium">
                        {item.badge}
                      </Badge>
                    </div>
                    <CardTitle className="text-base sm:text-lg font-bold">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {item.desc}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Steps */}
      <section id="how-it-works" className="py-16 sm:py-24 bg-muted/20 border-t border-border/70">
        <div className="container max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-14 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              {t(lang, 'steps.title')}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t(lang, 'steps.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((st, i) => (
              <div key={i} className="p-6 rounded-2xl border border-border/80 bg-card space-y-3 relative shadow-sm">
                <span className="font-mono text-2xl font-black text-primary/40 block">
                  {st.step}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-foreground">{st.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="py-16 border-t border-border/70 bg-gradient-to-b from-card to-muted/30 text-center">
        <div className="container max-w-3xl mx-auto px-4 space-y-6">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight">
            {t(lang, 'cta.title')}
          </h2>
          <p className="text-xs sm:text-base text-muted-foreground max-w-xl mx-auto">
            {t(lang, 'cta.subtitle')}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link href="/register">
              <Button size="lg" className="shadow-lg gap-2">
                <span>{t(lang, 'cta.btn')}</span>
                {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8 bg-background text-xs text-muted-foreground">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{t(lang, 'brand')}</span>
            <span>·</span>
            <span>{t(lang, 'footer.rights')}</span>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground transition-colors">
              {t(lang, 'footer.signin')}
            </Link>
            <Link href="/register" className="hover:text-foreground transition-colors">
              {t(lang, 'footer.register')}
            </Link>
            <Link href="/user/dashboard" className="hover:text-foreground transition-colors">
              {tx('Dashboard', 'داشبورد')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
