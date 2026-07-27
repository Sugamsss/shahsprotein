import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { supabase } from '../../services/supabaseClient';
import '../../styles/admin-dashboard.css';

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const signOut = async () => {
    await supabase?.auth.signOut();
    navigate('/admin/login', { replace: true });
  };

  const navItems = [
    { to: '/admin/dashboard', icon: <LayoutDashboard size={17} />, label: 'Dashboard' },
    { to: '/admin/waitlist', icon: <Users size={17} />, label: 'Members' },
    { to: '/admin/campaigns', icon: <Mail size={17} />, label: 'Campaigns' },
    { to: '/admin/analytics', icon: <BarChart3 size={17} />, label: 'Analytics' },
    { to: '/admin/settings', icon: <Settings size={17} />, label: 'Settings' },
  ];

  const navLinks = navItems.map(({ to, icon, label }) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/admin/dashboard'}
      onClick={() => setMobileNavOpen(false)}
    >
      {icon} {label}
    </NavLink>
  ));

  return (
    <div className="admin-shell">
      {/* Mobile nav toggle */}
      <button
        type="button"
        className="admin-mobile-toggle"
        onClick={() => setMobileNavOpen(!mobileNavOpen)}
        aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileNavOpen}
      >
        {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`admin-sidebar ${mobileNavOpen ? 'admin-sidebar--open' : ''}`}>
        <div>
          <p className="admin-eyebrow">SHAH&apos;S NUTRITION</p>
          <h1 className="admin-sidebar-title">Owner console</h1>
        </div>
        <nav className="admin-nav" aria-label="Owner navigation">
          {navLinks}
        </nav>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut size={16} /> Sign out
        </Button>
      </aside>

      {/* Overlay when mobile nav is open */}
      {mobileNavOpen && (
        <div
          className="admin-mobile-overlay"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="admin-main" onClick={() => mobileNavOpen && setMobileNavOpen(false)}>
        <Outlet />
      </main>
    </div>
  );
};
