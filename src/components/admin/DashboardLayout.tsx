import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, LogOut, Users } from 'lucide-react';
import { Button } from '../ui/Button';
import { supabase } from '../../services/supabaseClient';

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase?.auth.signOut();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="admin-eyebrow">SHAH&apos;S NUTRITION</p>
          <h1 className="admin-sidebar-title">Owner console</h1>
        </div>
        <nav className="admin-nav" aria-label="Owner navigation">
          <NavLink to="/admin/waitlist"><Users size={17} /> Waitlist</NavLink>
          <NavLink to="/admin/analytics"><BarChart3 size={17} /> Analytics</NavLink>
        </nav>
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut size={16} /> Sign out</Button>
      </aside>
      <main className="admin-main"><Outlet /></main>
    </div>
  );
};
