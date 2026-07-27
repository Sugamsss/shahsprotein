import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export const ProtectedRoute: React.FC = () => {
  const [loading, setLoading] = React.useState(true);
  const [authenticated, setAuthenticated] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="admin-loading">Checking owner access…</div>;
  if (!authenticated) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
};
