import React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { hasSupabaseConfig } from './api';
import { AdminGate, useSession } from './auth';
import { AdminLayout } from './AdminLayout';
import { useHomeScreenApp } from './homeScreenApp';
import { adminCopy as copy } from '../data/adminCopy';
import { Redirect } from './router';
import { Splash } from './Splash';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import OrdersPage from './orders/OrdersPage';
import DonePage from './orders/DonePage';
import NewOrderPage from './pages/NewOrderPage';
import ProductsPage from './pages/ProductsPage';
import CustomersPage from './pages/CustomersPage';
import CustomerPage from './pages/CustomerPage';
import CouponsPage from './pages/CouponsPage';
import EmailListPage from './pages/EmailListPage';
import SettingsPage from './pages/SettingsPage';
import MorePage from './pages/MorePage';
import adminCss from './admin.css?inline';

// The admin's lazy entry (App.tsx: /admin/*). Its own chunk, so the landing
// page never downloads it or supabase-js.

// The admin's CSS ships inside this chunk as one <style>. A lazy chunk with its
// own CSS file makes Vite add its stylesheet preloader to the landing entry.
// Page styles are @imported from admin.css, never imported by the page itself.
const style = document.createElement('style');
style.dataset.admin = '';
style.textContent = adminCss;
document.head.append(style);

/** Where a signed-out visitor was heading, kept only if it's an admin page. */
const returnPath = (state: unknown): string => {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/admin') && !from.startsWith('/admin/login') ? from : '/admin';
};

const AdminApp: React.FC = () => {
  const session = useSession();
  const location = useLocation();
  useHomeScreenApp();

  if (!hasSupabaseConfig) return <Splash><p className="adm-splash__text">{copy.gate.notSetUp}</p></Splash>;
  if (session === undefined) return <Splash busy />;

  const onLogin = /^\/admin\/login\/?$/.test(location.pathname);
  if (!session) {
    const here = location.pathname + location.search + location.hash;
    return onLogin ? <LoginPage /> : <Redirect to="/admin/login" state={{ from: here }} />;
  }
  // Signed in: back to where they were heading. The gate still checks they're an admin.
  if (onLogin) return <Redirect to={returnPath(location.state)} />;

  return (
    <AdminGate userId={session.user.id}>
      <AdminLayout>
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/done" element={<DonePage />} />
          <Route path="orders/new" element={<NewOrderPage />} />
          {/* Phone: its own page. Laptop: a popup over the board. OrdersPage decides. */}
          <Route path="orders/:code" element={<OrdersPage />} />
          <Route path="orders/:code/edit" element={<NewOrderPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:phone" element={<CustomerPage />} />
          <Route path="coupons" element={<CouponsPage />} />
          <Route path="email-list" element={<EmailListPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="*" element={<Redirect to="/admin" />} />
        </Routes>
      </AdminLayout>
    </AdminGate>
  );
};

export default AdminApp;
