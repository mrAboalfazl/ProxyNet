'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, Boxes, ChevronLeft, ChevronRight, Globe2, LayoutDashboard, LogOut, Menu, ReceiptText, ShieldCheck, Users, X } from 'lucide-react';
import { clearToken, getToken } from '../../lib/api';
import { useLang } from '../../lib/lang-context';
import { t } from '../../lib/i18n';
import './admin-panel.css';

const navigation = [
  { href: '/admin/dashboard', key: 'admin.nav.dashboard', icon: LayoutDashboard },
  { href: '/admin/statistics', key: 'admin.nav.statistics', icon: BarChart3 },
  { href: '/admin/nodes', key: 'admin.nav.nodes', icon: Boxes },
  { href: '/admin/users', key: 'admin.nav.users', icon: Users },
  { href: '/admin/plans', key: 'admin.nav.plans', icon: ReceiptText },
  { href: '/admin/pricing', key: 'admin.nav.pricing', icon: BarChart3 },
  { href: '/admin/countries', key: 'admin.nav.countries', icon: Globe2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const { lang, setLang, isRTL } = useLang(); const [open, setOpen] = useState(false);
  useEffect(() => { const token = getToken(); if (!token) { router.replace('/login'); return; } try { const payload = JSON.parse(atob(token.split('.')[1])); if (payload.role !== 'admin') router.replace('/user/dashboard'); } catch { router.replace('/login'); } }, [router]);
  useEffect(() => { setOpen(false); }, [pathname]);
  const switchLanguage = () => setLang(lang === 'en' ? 'fa' : 'en'); const logout = () => { clearToken(); router.push('/login'); }; const chevron = isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />;
  return <div data-admin-panel dir={isRTL ? 'rtl' : 'ltr'}>
    <div className="admin-mobile-bar"><button className="admin-icon-button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="admin-brand-mark"><ShieldCheck size={18} /></div><span className="admin-mobile-title">{t(lang, 'admin.panel')}</span><button className="admin-button admin-button--secondary admin-button--sm admin-mobile-language" onClick={switchLanguage}>{lang === 'en' ? 'فا' : 'EN'}</button></div>
    <div className="admin-shell"><aside className={`admin-sidebar${open ? ' is-open' : ''}`}>
      <div className="admin-brand"><div className="admin-brand-mark"><ShieldCheck size={19} /></div><span className="admin-brand-name">{t(lang, 'admin.panel')}</span><button className="admin-button admin-button--sm admin-language" onClick={switchLanguage}>{lang === 'en' ? 'فا' : 'EN'}</button><button className="admin-icon-button admin-close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <nav className="admin-nav">{navigation.map(({ href, key, icon: Icon }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link href={href} key={href} data-active={active} className="admin-nav-link"><Icon size={18} strokeWidth={active ? 2.2 : 1.8} /><span>{t(lang, key)}</span>{active && <span className="admin-nav-arrow">{chevron}</span>}</Link>; })}</nav>
      <div className="admin-sidebar-footer"><button className="admin-button admin-button--danger" style={{ width: '100%' }} onClick={logout}><LogOut size={17} />{t(lang, 'admin.signout')}</button></div>
    </aside><main className="admin-main"><div className="admin-content">{children}</div></main></div>
  </div>;
}
