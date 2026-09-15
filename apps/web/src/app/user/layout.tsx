'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BadgeDollarSign, Boxes, ChevronLeft, ChevronRight, CircleUserRound, KeyRound, LayoutDashboard, LogOut, Menu, Network, ShieldCheck, X } from 'lucide-react';
import { clearToken, getToken } from '../../lib/api';
import { useLang } from '../../lib/lang-context';
import { t } from '../../lib/i18n';
import { Tooltip } from '../../components/user-ui';
import './user-panel.css';

const navigation = [
  { href: '/user/dashboard', key: 'user.nav.dashboard', icon: LayoutDashboard },
  { href: '/user/wallet', key: 'user.nav.wallet', icon: BadgeDollarSign },
  { href: '/user/forwarders', key: 'user.nav.forwarders', icon: Network },
  { href: '/user/credentials', key: 'user.nav.credentials', icon: KeyRound },
  { href: '/user/nodes', key: 'user.nav.nodes', icon: Boxes },
  { href: '/user/profile', key: 'user.nav.profile', icon: CircleUserRound },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, isRTL } = useLang();
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => { if (!getToken()) router.replace('/login'); }, [router]);
  useEffect(() => { setNavigationOpen(false); }, [pathname]);

  function handleLogout() { clearToken(); router.push('/login'); }
  function switchLanguage() { setLang(lang === 'en' ? 'fa' : 'en'); }
  const chevron = isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />;

  return (
    <div data-user-panel dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="user-mobile-bar">
        <Tooltip content={isRTL ? 'باز کردن منو' : 'Open menu'}>
          <button className="user-icon-button" onClick={() => setNavigationOpen(true)} aria-label={isRTL ? 'باز کردن منو' : 'Open menu'}><Menu size={20} /></button>
        </Tooltip>
        <div className="user-brand-mark"><ShieldCheck size={18} /></div>
        <span className="user-mobile-title">{t(lang, 'user.panel')}</span>
        <button className="user-button user-button--secondary user-button--sm user-mobile-language" onClick={switchLanguage}>{lang === 'en' ? 'فا' : 'EN'}</button>
      </div>
      <div className="user-shell">
        <aside className={`user-sidebar${navigationOpen ? ' is-open' : ''}`} aria-label={isRTL ? 'ناوبری پنل کاربری' : 'User panel navigation'}>
          <div className="user-brand">
            <div className="user-brand-mark"><ShieldCheck size={19} /></div>
            <span className="user-brand-name">{t(lang, 'user.panel')}</span>
            <button className="user-button user-button--sm user-language" onClick={switchLanguage}>{lang === 'en' ? 'فا' : 'EN'}</button>
            <button className="user-icon-button" onClick={() => setNavigationOpen(false)} aria-label={isRTL ? 'بستن منو' : 'Close menu'}><X size={18} /></button>
          </div>
          <nav className="user-nav">
            {navigation.map(({ href, key, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return <Link href={href} key={href} data-active={active} className="user-nav-link"><Icon size={18} strokeWidth={active ? 2.25 : 1.85} /><span>{t(lang, key)}</span>{active && <span style={{ marginInlineStart: 'auto' }}>{chevron}</span>}</Link>;
            })}
          </nav>
          <div className="user-sidebar-footer">
            <button className="user-button user-button--danger" style={{ width: '100%' }} onClick={handleLogout}><LogOut size={17} />{t(lang, 'user.signout')}</button>
          </div>
        </aside>
        <main className="user-main"><div className="user-content">{children}</div></main>
      </div>
    </div>
  );
}
