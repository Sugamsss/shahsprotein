import React from 'react';
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
import { WaitlistModal } from './components/modals/WaitlistModal';
import { Toast } from './components/ui/Toast';
import './styles/global.css';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <WaitlistProvider>
        <ModalProvider>
          <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <Header />
            <main id="main-content" style={{ flex: 1 }}>
              <HeroSection />
              <ProductsSection />
              <ValuesSection />
              <StorySection />
              <FAQSection />
              <NewsletterSection />
            </main>
            <Footer />

            {/* Global Modals & Toast */}
            <ProductDetailModal />
            <WaitlistModal />
            <Toast />
          </div>
        </ModalProvider>
      </WaitlistProvider>
    </ThemeProvider>
  );
};

export default App;
