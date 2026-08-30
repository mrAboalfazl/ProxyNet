'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { colors } from '../../lib/ui';
import { clearToken, getToken } from '../../lib/api';
import { useLang } from '../../lib/lang-context';
import { t } from '../../lib/i18n';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, isRTL } = useLang();

  const navLinks = [
    { href: '/user/dashboard', key: 'user.nav.dashboard' },
    { href: '/user/credentials', key: 'user.nav.credentials' },
    { href: '/user/nodes', key: 'user.nav.nodes' },
    { href: '/user/profile', key: 'user.nav.profile' },
  ];

  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: 220, minHeight: '100vh', backgroundColor: colors.navy,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        order: isRTL ? 1 : 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '20px 20px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            width: 32, height: 32, backgroundColor: colors.primary, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{t(lang, 'user.panel')}</span>
          <button
            onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.12)', border: 'none',
              borderRadius: 5, color: '#fff', fontSize: 11, fontWeight: 700,
              padding: '3px 8px', cursor: 'pointer',
            }}
          >
            {lang === 'en' ? 'فا' : 'EN'}
          </button>
        </div>

        <div style={{ paddingTop: 12 }}>
          {navLinks.map(({ href, key }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px', fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? '#fff' : colors.textNav,
                textDecoration: 'none',
                backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                borderLeft: isRTL ? 'none' : (active ? `3px solid ${colors.primary}` : '3px solid transparent'),
                borderRight: isRTL ? (active ? `3px solid ${colors.primary}` : '3px solid transparent') : 'none',
              }}>
                {t(lang, key)}
              </Link>
            );
          })}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={handleLogout} style={{
            width: '100%', background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
            color: '#fca5a5', fontSize: 13, padding: '9px 12px',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: 8, flexDirection: isRTL ? 'row-reverse' : 'row',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t(lang, 'user.signout')}
          </button>
        </div>
      </nav>

      <main style={{
        flex: 1, backgroundColor: colors.bg, padding: 28,
        minHeight: '100vh', overflowY: 'auto',
        order: isRTL ? 0 : 1,
      }}>
        {children}
      </main>
    </div>
  );
}
