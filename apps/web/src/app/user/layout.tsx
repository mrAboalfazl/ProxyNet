'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { clearToken, getToken } from '../../lib/api';
import { useLang } from '../../lib/lang-context';
import { t } from '../../lib/i18n';
import { Tooltip } from '../../components/user-ui';
import { AccountStatusStrip } from '../../lib/account-status';
import './user-panel.css';

const navigation = [
  {
    href: '/user/dashboard',
    key: 'user.nav.dashboard',
    icon: LayoutDashboard,
    section: 'overview',
  },
  {
    href: '/user/projects',
    key: 'user.nav.projects',
    icon: Layers,
    section: 'services',
  },
  {
    href: '/user/nodes',
    key: 'user.nav.nodes',
    icon: Boxes,
    section: 'services',
  },
  {
    href: '/user/wallet',
    key: 'user.nav.wallet',
    icon: BadgeDollarSign,
    section: 'billing',
  },
  {
    href: '/user/plans',
    key: 'user.nav.plans',
    icon: CreditCard,
    section: 'billing',
  },
  {
    href: '/user/billing',
    key: 'user.nav.billing',
    icon: ReceiptText,
    section: 'billing',
  },
  {
    href: '/user/profile',
    key: 'user.nav.profile',
    icon: CircleUserRound,
    section: 'account',
  },
];

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, isRTL } = useLang();
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);
  useEffect(() => {
    setNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current
      ?.querySelector<HTMLButtonElement>('button[aria-label]')
      ?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNavigationOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        ) ?? [],
      );
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    function onResize() {
      if (window.innerWidth > 800) setNavigationOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      menuButton.current?.focus();
    };
  }, [navigationOpen]);

  function handleLogout() {
    clearToken();
    router.push('/login');
  }
  function switchLanguage() {
    setLang(lang === 'en' ? 'fa' : 'en');
  }
  const chevron = isRTL ? (
    <ChevronLeft size={16} />
  ) : (
    <ChevronRight size={16} />
  );

  return (
    <div data-user-panel dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="user-mobile-bar">
        <Tooltip content={isRTL ? 'باز کردن منو' : 'Open menu'}>
          <button
            ref={menuButton}
            aria-expanded={navigationOpen}
            aria-controls="user-sidebar"
            className="user-icon-button"
            onClick={() => setNavigationOpen(true)}
            aria-label={isRTL ? 'باز کردن منو' : 'Open menu'}
          >
            <Menu size={20} />
          </button>
        </Tooltip>
        <div className="user-brand-mark">
          <ShieldCheck size={18} />
        </div>
        <span className="user-mobile-title">{t(lang, 'user.panel')}</span>
        <button
          className="user-button user-button--secondary user-button--sm user-mobile-language"
          onClick={switchLanguage}
        >
          {lang === 'en' ? 'فا' : 'EN'}
        </button>
      </div>
      <div className="user-shell">
        <aside
          ref={sidebar}
          id="user-sidebar"
          role={navigationOpen ? 'dialog' : undefined}
          aria-modal={navigationOpen || undefined}
          className={`user-sidebar${navigationOpen ? ' is-open' : ''}`}
          aria-label={isRTL ? 'ناوبری پنل کاربری' : 'User panel navigation'}
        >
          <div className="user-brand">
            <div className="user-brand-mark">
              <ShieldCheck size={19} />
            </div>
            <span className="user-brand-name">{t(lang, 'user.panel')}</span>
            <button
              className="user-button user-button--sm user-language"
              onClick={switchLanguage}
            >
              {lang === 'en' ? 'فا' : 'EN'}
            </button>
            <button
              className="user-icon-button"
              onClick={() => setNavigationOpen(false)}
              aria-label={isRTL ? 'بستن منو' : 'Close menu'}
            >
              <X size={18} />
            </button>
          </div>
          <nav className="user-nav">
            {navigation.map(({ href, key, icon: Icon, section }, index) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <div key={href}>
                  {index > 0 && navigation[index - 1].section !== section && (
                    <p className="user-nav-section">
                      {section === 'services'
                        ? isRTL
                          ? 'سرویس‌ها'
                          : 'Services'
                        : section === 'billing'
                          ? isRTL
                            ? 'حساب و پرداخت'
                            : 'Plans & payments'
                          : isRTL
                            ? 'تنظیمات'
                            : 'Settings'}
                    </p>
                  )}
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    data-active={active}
                    className="user-nav-link"
                  >
                    <Icon size={18} strokeWidth={active ? 2.25 : 1.85} />
                    <span>{t(lang, key)}</span>
                    {active && (
                      <span style={{ marginInlineStart: 'auto' }}>
                        {chevron}
                      </span>
                    )}
                  </Link>
                </div>
              );
            })}
          </nav>
          <div className="user-sidebar-footer">
            <button
              className="user-button user-button--danger"
              style={{ width: '100%' }}
              onClick={handleLogout}
            >
              <LogOut size={17} />
              {t(lang, 'user.signout')}
            </button>
          </div>
        </aside>
        {navigationOpen && (
          <button
            tabIndex={-1}
            className="user-mobile-backdrop"
            aria-label={isRTL ? 'بستن منو' : 'Close menu'}
            onClick={() => setNavigationOpen(false)}
          />
        )}
        <main className="user-main" inert={navigationOpen}>
          <div className="user-content">
            <AccountStatusStrip lang={lang} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
