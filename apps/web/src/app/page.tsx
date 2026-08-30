'use client';

import Link from 'next/link';
import { colors } from '../lib/ui';
import { useLang } from '../lib/lang-context';
import { t } from '../lib/i18n';

const NAV_H = 64;

function Shield() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export default function LandingPage() {
  const { lang, setLang } = useLang();
  const isFA = lang === 'fa';

  const features = [
    { icon: '🔒', title: t(lang, 'feat.0.title'), desc: t(lang, 'feat.0.desc') },
    { icon: '🌍', title: t(lang, 'feat.1.title'), desc: t(lang, 'feat.1.desc') },
    { icon: '⚡', title: t(lang, 'feat.2.title'), desc: t(lang, 'feat.2.desc') },
    { icon: '🛡️', title: t(lang, 'feat.3.title'), desc: t(lang, 'feat.3.desc') },
    { icon: '📊', title: t(lang, 'feat.4.title'), desc: t(lang, 'feat.4.desc') },
    { icon: '🔑', title: t(lang, 'feat.5.title'), desc: t(lang, 'feat.5.desc') },
  ];

  const steps = [
    { n: '01', title: t(lang, 'step.1.title'), desc: t(lang, 'step.1.desc') },
    { n: '02', title: t(lang, 'step.2.title'), desc: t(lang, 'step.2.desc') },
    { n: '03', title: t(lang, 'step.3.title'), desc: t(lang, 'step.3.desc') },
  ];

  return (
    <div style={{ color: colors.text, backgroundColor: '#fff' }}>
      {/* Navbar */}
      <nav style={{
        height: NAV_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 40px',
        borderBottom: `1px solid ${colors.border}`,
        position: 'sticky',
        top: 0,
        backgroundColor: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, backgroundColor: colors.navy, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <Shield />
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, color: colors.navy }}>{t(lang, 'brand')}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => setLang(isFA ? 'en' : 'fa')}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 700,
              color: colors.textMuted, background: 'none',
              border: `1px solid ${colors.border}`, borderRadius: 6, cursor: 'pointer',
            }}
          >
            {isFA ? 'EN' : 'فا'}
          </button>
          <Link href="/login" style={{
            padding: '8px 18px', fontSize: 14, fontWeight: 500,
            color: colors.navy, textDecoration: 'none',
            border: `1px solid ${colors.border}`, borderRadius: 7,
          }}>
            {t(lang, 'nav.signin')}
          </Link>
          <Link href="/register" style={{
            padding: '8px 18px', fontSize: 14, fontWeight: 600,
            color: '#fff', textDecoration: 'none',
            backgroundColor: colors.primary, borderRadius: 7,
          }}>
            {t(lang, 'nav.getstarted')}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        background: `linear-gradient(135deg, ${colors.navy} 0%, #1e3a70 100%)`,
        color: '#fff',
        padding: '100px 40px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.12)', borderRadius: 100,
            padding: '6px 16px', fontSize: 13, fontWeight: 500, marginBottom: 28,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#4ade80', display: 'inline-block' }} />
            {t(lang, 'hero.badge')}
          </div>
          <h1 style={{ margin: '0 0 20px', fontSize: 48, fontWeight: 800, lineHeight: 1.2, letterSpacing: isFA ? 0 : '-1px' }}>
            {t(lang, 'hero.title')}
          </h1>
          <p style={{ margin: '0 0 40px', fontSize: 18, opacity: 0.8, lineHeight: 1.7 }}>
            {t(lang, 'hero.subtitle')}
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{
              padding: '14px 32px', fontSize: 16, fontWeight: 700,
              backgroundColor: colors.primary, color: '#fff',
              borderRadius: 9, textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(37,99,235,0.4)',
            }}>
              {t(lang, 'hero.cta_primary')}
            </Link>
            <Link href="/login" style={{
              padding: '14px 32px', fontSize: 16, fontWeight: 600,
              backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff',
              borderRadius: 9, textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.25)',
            }}>
              {t(lang, 'hero.cta_secondary')}
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', margin: '0 0 12px', fontSize: 34, fontWeight: 700, color: colors.navy }}>
          {t(lang, 'features.title')}
        </h2>
        <p style={{ textAlign: 'center', margin: '0 0 56px', fontSize: 16, color: colors.textMuted }}>
          {t(lang, 'features.subtitle')}
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 24,
        }}>
          {features.map((f) => (
            <div key={f.title} style={{
              padding: '28px 28px',
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: colors.navy }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 14, color: colors.textMuted, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '60px 40px 80px', backgroundColor: colors.bg }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', margin: '0 0 12px', fontSize: 34, fontWeight: 700, color: colors.navy }}>
            {t(lang, 'steps.title')}
          </h2>
          <p style={{ textAlign: 'center', margin: '0 0 56px', fontSize: 16, color: colors.textMuted }}>
            {t(lang, 'steps.subtitle')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {steps.map((s) => (
              <div key={s.n} style={{
                display: 'flex', alignItems: 'flex-start', gap: 24,
                padding: '24px 28px', backgroundColor: '#fff',
                borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  fontSize: 28, fontWeight: 800, color: colors.primary,
                  minWidth: 52, lineHeight: 1,
                }}>
                  {s.n}
                </div>
                <div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: colors.navy }}>{s.title}</h3>
                  <p style={{ margin: 0, fontSize: 14, color: colors.textMuted }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '80px 40px',
        background: `linear-gradient(135deg, ${colors.navy} 0%, #1e3a70 100%)`,
        textAlign: 'center',
        color: '#fff',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 38, fontWeight: 800 }}>{t(lang, 'cta.title')}</h2>
        <p style={{ margin: '0 0 36px', fontSize: 17, opacity: 0.8 }}>{t(lang, 'cta.subtitle')}</p>
        <Link href="/register" style={{
          padding: '15px 40px', fontSize: 16, fontWeight: 700,
          backgroundColor: '#fff', color: colors.navy,
          borderRadius: 9, textDecoration: 'none',
          display: 'inline-block',
        }}>
          {t(lang, 'cta.btn')}
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '28px 40px',
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 13,
        color: colors.textMuted,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span>{t(lang, 'footer.rights')}</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link href="/login" style={{ color: colors.textMuted, textDecoration: 'none' }}>{t(lang, 'footer.signin')}</Link>
          <Link href="/register" style={{ color: colors.textMuted, textDecoration: 'none' }}>{t(lang, 'footer.register')}</Link>
        </div>
      </footer>
    </div>
  );
}
