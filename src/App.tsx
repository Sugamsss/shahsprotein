import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CustomerAuthProvider } from './context/CustomerAuthContext';
const CustomerLogin = React.lazy(() => import('./components/pages/CustomerLogin').then((module) => ({ default: module.CustomerLogin })));
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
import { useSectionSettle } from './hooks/useSectionSettle';
import './styles/global.css';
import { NotFound } from './components/pages/NotFound';
import { siteConfig } from './data/siteConfig';

const AdminRedirect: React.FC = () => {
  React.useEffect(() => {
    const target = window.location.pathname.startsWith('/admin')
      ? window.location.pathname + window.location.search + window.location.hash
      : '/admin';
    window.location.replace(target);
  }, []);
  return null;
};

// Desktop sections settle into place after a scroll (see the hook).
const SectionSettle: React.FC = () => {
  useSectionSettle();
  return null;
};

const LandingPage: React.FC = () => (
  <>
    <SectionSettle />
    <WaitlistProvider>
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
    </WaitlistProvider>
  </>
);

// The order provider sits above the routes on purpose: /login must not unmount
// the cart, the typed details or the order code, and the customer session and
// the quote belong to the same cart whichever page is showing.
export const App: React.FC = () => (
  <ThemeProvider>
    <BrowserRouter>
      <CustomerAuthProvider>
        <OrderProvider>
          <React.Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<CustomerLogin />} />
              <Route path="/admin/*" element={<AdminRedirect />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </React.Suspense>
        </OrderProvider>
      </CustomerAuthProvider>
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
