import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { WaitlistProvider } from './context/WaitlistContext';
import { ModalProvider } from './context/ModalContext';
import { Header } from './components/layout/Header';
import { HeroSection } from './components/sections/HeroSection';
import { ProductsSection } from './components/sections/ProductsSection';
import { ValuesSection } from './components/sections/ValuesSection';
import { StorySection } from './components/sections/StorySection';
import { FAQSection } from './components/sections/FAQSection';
import { NewsletterSection } from './components/sections/NewsletterSection';
import { Footer } from './components/layout/Footer';
import { ProductDetailModal } from './components/modals/ProductDetailModal';
import { Toast } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AnalyticsService } from './services/analyticsService';
import { useTheme } from './context/ThemeContext';
import './styles/global.css';
import { AdminLogin } from './components/admin/AdminLogin';
import { AdminAnalytics } from './components/admin/AdminAnalytics';
import { AdminWaitlist } from './components/admin/AdminWaitlist';
import { DashboardLayout } from './components/admin/DashboardLayout';
import { ProtectedRoute } from './components/admin/ProtectedRoute';

const AnalyticsTracker: React.FC = () => {
  const { theme } = useTheme();

  React.useEffect(() => {
    AnalyticsService.setTheme(theme);
  }, [theme]);

  React.useEffect(() => AnalyticsService.startSession(theme), []);

  return null;
};

const LandingPage: React.FC = () => (
  <>
    <AnalyticsTracker />
    <WaitlistProvider>
      <ModalProvider>
        <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <Header />
            <main id="main-content" style={{ flex: 1 }}>
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

            {/* Global Modals & Toast */}
            <ProductDetailModal />
            <Toast />
        </div>
      </ModalProvider>
    </WaitlistProvider>
  </>
);

export const App: React.FC = () => (
  <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<DashboardLayout />}>
            <Route index element={<Navigate to="waitlist" replace />} />
            <Route path="waitlist" element={<AdminWaitlist />} />
            <Route path="analytics" element={<AdminAnalytics />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
