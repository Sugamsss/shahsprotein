import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Home, LogOut, MoreHorizontal, Package, Plus, Search, Settings, Users } from 'lucide-react';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { getOverview } from './api';
import { signOut, useAdminMe } from './auth';
import { adminCopy as copy } from '../data/adminCopy';
import { AdminLink } from './router';
import { Logo } from './Splash';
import { ToastProvider } from './toast';
import { useRpc } from './useRpc';

type OverviewState = ReturnType<typeof useRpc<Awaited<ReturnType<typeof getOverview>>>>;
const OverviewContext = createContext<OverviewState | null>(null);

/** Home reuses the overview the badge already loads, and screens call reload() after a change. */
export const useOverview = (): OverviewState => {
  const overview = useContext(OverviewContext);
  if (!overview) throw new Error('useOverview must be used inside AdminLayout');
  return overview;
};

/** A nav link that says it's the current page: exact for Home, by prefix for the rest. */
const NavItem: React.FC<{ to: string; current?: boolean; children: React.ReactNode }> = ({ to, current, children }) => {
  const { pathname } = useLocation();
  const here = current ?? (to === '/admin' ? /^\/admin\/?$/.test(pathname) : pathname === to || pathname.startsWith(`${to}/`));
  return <AdminLink to={to} aria-current={here ? 'page' : undefined}>{children}</AdminLink>;
};

const OrdersBadge: React.FC<{ count: number }> = ({ count }) =>
  count > 0 ? (
    <>
      <span className="adm-badge" aria-hidden="true">{count > 9 ? '9+' : count}</span>
      <span className="visually-hidden">, {copy.nav.toConfirm(count)}</span>
    </>
  ) : null;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

const AccountMenu: React.FC = () => {
  const me = useAdminMe();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const name = me.display_name || me.email;

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="adm-account" ref={wrap}>
      <button ref={button} type="button" className="adm-avatar" aria-expanded={open} aria-controls="adm-account-menu"
        aria-label={copy.header.accountMenu} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
      </button>
      <div id="adm-account-menu" className="adm-menu" hidden={!open}>
        <p className="adm-menu__who">{copy.header.signedInAs}<strong>{me.email}</strong></p>
        <AdminLink className="adm-menu__item" to="/admin/settings"><Settings size={18} aria-hidden="true" />{copy.nav.settings}</AdminLink>
        <div className="adm-menu__item adm-menu__item--static">{copy.appearance.label}<ThemeToggle /></div>
        <button type="button" className="adm-menu__item" onClick={() => void signOut()}>
          <LogOut size={18} aria-hidden="true" />{copy.signOut}
        </button>
      </div>
    </div>
  );
};

const Header: React.FC<{ toConfirm: number }> = ({ toConfirm }) => {
  const navigate = useNavigate();
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  // "/" jumps to the search field from anywhere that isn't a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      search.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/admin/orders?q=${encodeURIComponent(q)}`);
    setQuery('');
    search.current?.blur();
  };

  const links: [string, string][] = [
    ['/admin', copy.nav.home], ['/admin/orders', copy.nav.orders], ['/admin/products', copy.nav.products],
    ['/admin/customers', copy.nav.customers], ['/admin/coupons', copy.nav.coupons], ['/admin/email-list', copy.nav.emailList],
  ];

  return (
    <header className="adm-header">
      <AdminLink to="/admin" className="adm-header__logo"><Logo /></AdminLink>
      <nav className="adm-header__nav" aria-label={copy.nav.label}>
        {links.map(([to, label]) => (
          <NavItem key={to} to={to}>
            {label}
            {to === '/admin/orders' && <OrdersBadge count={toConfirm} />}
          </NavItem>
        ))}
      </nav>
      <form className="adm-search" role="search" onSubmit={onSubmit}>
        <Search size={18} aria-hidden="true" />
        <input ref={search} className="adm-input" type="search" placeholder={copy.header.find}
          aria-label={copy.header.findLabel} value={query} onChange={(e) => setQuery(e.target.value)} />
        <kbd aria-hidden="true">/</kbd>
      </form>
      <AdminLink to="/admin/orders/new" className="adm-btn adm-btn--primary adm-btn--sm">
        <Plus size={18} aria-hidden="true" /><span className="adm-btn__text">{copy.header.addOrder}</span>
      </AdminLink>
      <AccountMenu />
    </header>
  );
};

const MORE_PATHS = /^\/admin\/(more|coupons|email-list|settings)(\/|$)/;

const TabBar: React.FC<{ toConfirm: number }> = ({ toConfirm }) => {
  const { pathname } = useLocation();
  const tabs = [
    { to: '/admin', label: copy.nav.home, Icon: Home },
    { to: '/admin/orders', label: copy.nav.orders, Icon: ClipboardList },
    { to: '/admin/products', label: copy.nav.products, Icon: Package },
    { to: '/admin/customers', label: copy.nav.customers, Icon: Users },
  ];
  return (
    <nav className="adm-tabbar" aria-label={copy.nav.label}>
      {tabs.map(({ to, label, Icon }) => (
        <NavItem key={to} to={to}>
          <Icon size={22} aria-hidden="true" />
          <span>{label}</span>
          {to === '/admin/orders' && <OrdersBadge count={toConfirm} />}
        </NavItem>
      ))}
      {/* More stays lit on the pages it leads to. */}
      <NavItem to="/admin/more" current={MORE_PATHS.test(pathname)}>
        <MoreHorizontal size={22} aria-hidden="true" />
        <span>{copy.nav.more}</span>
      </NavItem>
    </nav>
  );
};

/** Laptop: the glass pill header. Phone: the same pill as a tab bar at the bottom. */
export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const overview = useRpc(getOverview, [], { refreshOnFocus: true, refreshEveryMs: 60_000 });
  const toConfirm = overview.data?.queue.to_confirm ?? 0;

  return (
    <ToastProvider>
    <div className="adm">
      <a href="#adm-main" className="skip-link">{copy.skipLink}</a>
      <Header toConfirm={toConfirm} />
      <main id="adm-main" className="adm-main" tabIndex={-1}>
        <OverviewContext.Provider value={overview}>{children}</OverviewContext.Provider>
      </main>
      <TabBar toConfirm={toConfirm} />
    </div>
    </ToastProvider>
  );
};
