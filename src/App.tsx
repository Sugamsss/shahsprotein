import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
import { OrderDialog } from './components/order/OrderDialog';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AnalyticsService } from './services/analyticsService';
import { useSectionSettle } from './hooks/useSectionSettle';
import './styles/global.css';
import { NotFound } from './components/pages/NotFound';
import { siteConfig } from './data/siteConfig';

// The admin is loaded on demand, so landing visitors never download it or Supabase.
const AdminApp = React.lazy(() => import('./admin/AdminApp'));

// Page views (Vercel Web Analytics), landing page only.
const PageViews: React.FC = () => {
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
    <PageViews />
    <SectionSettle />
    <WaitlistProvider>
      <OrderProvider>
        <div className="app-shell">
            <a href="#main-content" className="skip-link">{siteConfig.ui.skipLink}</a>
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
            <OrderDialog />
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
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
