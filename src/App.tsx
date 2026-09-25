import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { WaitlistProvider } from './context/WaitlistContext';
import { OrderProvider } from './context/OrderContext';
import { Header } from './components/layout/Header';
import { HeroSection } from './components/sections/HeroSection';
import { ProductsSection } from './components/sections/ProductsSection';
import { ValuesSection } from './components/sections/ValuesSection';
import { StorySection } from './components/sections/StorySection';
import { FAQSection } from './components/sections/FAQSection';
import { NewsletterSection } from './components/sections/NewsletterSection';
import { Footer } from './components/layout/Footer';
import { Toast } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AnalyticsService } from './services/analyticsService';
import { useTheme } from './context/ThemeContext';
import { useSectionSettle } from './hooks/useSectionSettle';
import './styles/global.css';
import { NotFound } from './components/pages/NotFound';

// Admin is loaded on demand, so landing visitors never download it or Supabase.
const AdminLogin = React.lazy(() => import('./components/admin/AdminLogin').then((m) => ({ default: m.AdminLogin })));
const AdminAnalytics = React.lazy(() => import('./components/admin/AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })));
const AdminWaitlist = React.lazy(() => import('./components/admin/AdminWaitlist'));
const AdminDashboard = React.lazy(() => import('./components/admin/AdminDashboard'));
const Campaigns = React.lazy(() => import('./components/admin/Campaigns'));
const DashboardLayout = React.lazy(() => import('./components/admin/DashboardLayout').then((m) => ({ default: m.DashboardLayout })));
const Coupons = React.lazy(() => import('./components/admin/Coupons'));
const ProtectedRoute = React.lazy(() => import('./components/admin/ProtectedRoute').then((m) => ({ default: m.ProtectedRoute })));
const AccountSettings = React.lazy(() => import('./components/admin/AccountSettings').then((m) => ({ default: m.AccountSettings })));

const AnalyticsTracker: React.FC = () => {
  const { theme } = useTheme();

  React.useEffect(() => {
    AnalyticsService.setTheme(theme);
  }, [theme]);

  React.useEffect(() => AnalyticsService.startSession(theme), []);

  React.useEffect(() => AnalyticsService.startPageViews(), []);

  return null;
};

// Desktop sections settle into place after a scroll (see the hook).
const SectionSettle: React.FC = () => {
  useSectionSettle();
  return null;
};

const LandingPage: React.FC = () => (
  <>
    <AnalyticsTracker />
    <SectionSettle />
    <WaitlistProvider>
      <OrderProvider>
        <div className="app-shell">
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <Header />
            <main id="main-content" className="site-main">
              <ErrorBoundary>
                <HeroSection />
              </ErrorBoundary>
              <ErrorBoundary>
                <ProductsSection />
              </ErrorBoundary>
              <ErrorBoundary>
                <ValuesSection />
              </ErrorBoundary>
              <ErrorBoundary>
                <StorySection />
              </ErrorBoundary>
              <ErrorBoundary>
                <FAQSection />
              </ErrorBoundary>
              <ErrorBoundary>
                <div className="final-page-section">
                  <NewsletterSection />
                  <Footer />
                </div>
              </ErrorBoundary>
            </main>

            <Toast />
        </div>
      </OrderProvider>
    </WaitlistProvider>
  </>
);

export const App: React.FC = () => (
  <ThemeProvider>
    <BrowserRouter>
      <React.Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/admin" element={<DashboardLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="waitlist" element={<AdminWaitlist />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="settings" element={<AccountSettings />} />
              <Route path="coupons" element={<Coupons />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
