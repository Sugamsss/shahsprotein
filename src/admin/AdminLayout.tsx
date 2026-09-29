import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, CookingPot, Home, LogOut, MoreHorizontal, Package, Plus, Search, Settings, Users } from 'lucide-react';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { getOverview } from './api';
import { signOut, useAdminMe } from './auth';
import { adminCopy as copy } from '../data/adminCopy';
import { AdminLink, useQueryText } from './router';
import { namesOneOrder, searchFor } from './orders/model';
import { Logo } from './Splash';
import { ToastProvider } from './toast';
import { useRpc } from './useRpc';
import { useAppUpdates } from './update/appUpdate';
import { WhatsNewDialog } from './update/WhatsNewDialog';

type OverviewState = ReturnType<typeof useRpc<Awaited<ReturnType<typeof getOverview>>>>;
const OverviewContext = createContext<OverviewState | null>(null);

/** Home reuses the overview the badge already loads, and screens call reload() after a change. */
export const useOverview = (): OverviewState => {
  const overview = useContext(OverviewContext);
  if (!overview) throw new Error('useOverview must be used inside AdminLayout');
  return overview;
};

/**
 * The cook's one action, "Log cooking", sits in the laptop header where "Add order" is for
 * Sunit. It opens the sheet on Home: a tap sends her there with { logCooking: true }, and Home
 * opens it (useLogCookingAsk). Home says when there's nothing left to cook, so the pill goes quiet.
 */
const LogCookingQuiet = createContext<(quiet: boolean) => void>(() => {});
export const useLogCookingQuiet = (quiet: boolean) => {
  const set = useContext(LogCookingQuiet);
  useEffect(() => { set(quiet); return () => set(false); }, [set, quiet]);
};
export const LOG_COOKING_STATE = { logCooking: true };

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
      <span className="visually-hidden">, {copy.nav.toPack(count)}</span>
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

const Header: React.FC<{ badge: number; logQuiet: boolean }> = ({ badge, logQuiet }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const search = useRef<HTMLInputElement>(null);
  const cook = useAdminMe().home_view === 'cook';
  const [query, setQuery] = useState('');
  const [boardQuery, setBoardQuery] = useQueryText('/admin/orders');
  // On the board the field filters it live, through ?q=. Elsewhere Enter takes you there.
  const onBoard = /^\/admin\/orders\/?$/.test(pathname);
  const value = onBoard ? boardQuery : query;

  // "/" finds, N adds an order: not while typing, and not over a popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      if (e.key === '/') search.current?.focus();
      else if (e.key.toLowerCase() === 'n') navigate('/admin/orders/new');
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  // A pasted message (or a whole code) away from the board goes straight there, to its order.
  const onChange = (raw: string) => {
    const text = searchFor(raw);
    if (onBoard) setBoardQuery(text);
    else if (text !== raw && namesOneOrder(text)) {
      navigate(`/admin/orders?q=${encodeURIComponent(text)}`);
      setQuery('');
    } else setQuery(text);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onBoard || !query.trim()) return;
    navigate(`/admin/orders?q=${encodeURIComponent(query.trim())}`);
    setQuery('');
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
            {to === '/admin/orders' && <OrdersBadge count={badge} />}
          </NavItem>
        ))}
      </nav>
      <form className="adm-search" role="search" onSubmit={onSubmit}>
        <Search size={18} aria-hidden="true" />
        <input ref={search} className="adm-input" type="search" placeholder={copy.header.find}
          aria-label={copy.header.findLabel} value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && value && (onBoard ? setBoardQuery : setQuery)('')} />
        <kbd aria-hidden="true">/</kbd>
      </form>
      {/* The cook adds orders from the Orders page; her one action, Log cooking, takes this spot. */}
      {cook ? (
        <button type="button" className={`adm-btn adm-btn--${logQuiet ? 'tonal' : 'primary'} adm-btn--sm`}
          onClick={() => navigate('/admin', { state: LOG_COOKING_STATE })}>
          <CookingPot size={18} aria-hidden="true" /><span className="adm-btn__text">{copy.kitchen.logCooking}</span>
        </button>
      ) : (
        <AdminLink to="/admin/orders/new" className="adm-btn adm-btn--primary adm-btn--sm">
          <Plus size={18} aria-hidden="true" /><span className="adm-btn__text">{copy.header.addOrder}</span>
        </AdminLink>
      )}
      <AccountMenu />
    </header>
  );
};

/** The page's name for the browser tab, from the path after /admin. */
const tabPage = (pathname: string): string => {
  const [section = '', sub = '', action = ''] = pathname.split('/').filter(Boolean).slice(1);
  const p = copy.tabPages;
  if (section === 'orders') return sub === 'done' ? p.done : sub === 'new' ? p.newOrder : action === 'edit' ? p.editOrder : p.orders;
  const names: Record<string, string> = {
    products: p.products, customers: p.customers, coupons: p.coupons, 'email-list': p.emailList, settings: p.settings, more: p.more,
  };
  return names[section] ?? p.home;
};

const MORE_PATHS = /^\/admin\/(more|coupons|email-list|settings)(\/|$)/;

const TabBar: React.FC<{ badge: number }> = ({ badge }) => {
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
          {to === '/admin/orders' && <OrdersBadge count={badge} />}
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
  // New builds install themselves at a safe moment; "What's new" shows on Home afterwards.
  useAppUpdates();
  // The Orders badge is what's waiting on Sunit: orders to pack. The cook gets none; her Home answers her.
  const cook = useAdminMe().home_view === 'cook';
  const badge = cook ? 0 : overview.data?.queue.packing.count ?? 0;
  // "(3) Orders · Shah's": the same count as the Orders badge. AdminApp puts the site's title back.
  const { pathname } = useLocation();
  useEffect(() => { document.title = copy.tabTitle(tabPage(pathname), badge); }, [pathname, badge]);
  const [logQuiet, setLogQuiet] = useState(false);

  return (
    <ToastProvider>
    <div className="adm">
      <a href="#adm-main" className="skip-link">{copy.skipLink}</a>
      <Header badge={badge} logQuiet={cook && logQuiet} />
      <main id="adm-main" className="adm-main" tabIndex={-1}>
        <LogCookingQuiet.Provider value={setLogQuiet}>
          <OverviewContext.Provider value={overview}>{children}</OverviewContext.Provider>
        </LogCookingQuiet.Provider>
      </main>
      <TabBar badge={badge} />
      <WhatsNewDialog />
    </div>
    </ToastProvider>
  );
};
