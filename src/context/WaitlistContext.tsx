import React, { createContext, useContext, useState, useEffect } from 'react';
import { WaitlistContextType, WaitlistResponse } from '../types/waitlist';
import { WaitlistService } from '../services/waitlistService';
import { AnalyticsService } from '../services/analyticsService';

const WaitlistContext = createContext<WaitlistContextType | undefined>(undefined);

export const WaitlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [waitlistCount, setWaitlistCount] = useState<number>(WaitlistService.getStoredCount());
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    // Auto clear toast after 4 seconds
    if (toastMessage) {
      const timer = setTimeout(() => {
        clearToast();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const clearToast = () => {
    setToastMessage(null);
    setToastType(null);
  };

  const submitEmail = async (
    email: string,
    source = 'hero',
    productId?: string
  ): Promise<WaitlistResponse> => {
    setIsLoading(true);
    clearToast();

    try {
      const res = await WaitlistService.submitEmail(email, source, productId);
      setWaitlistCount(res.totalCount);

      if (res.success) {
        setToastMessage(res.message);
        setToastType('success');
        AnalyticsService.trackEvent('waitlist_submission_success', { source, productId });
      } else {
        setToastMessage(res.message);
        setToastType('error');
        AnalyticsService.trackEvent('waitlist_submission_failed', { source, reason: res.message });
      }

      return res;
    } catch (err) {
      const fallbackMsg = 'Something went wrong. Please try again.';
      setToastMessage(fallbackMsg);
      setToastType('error');
      return { success: false, message: fallbackMsg, totalCount: waitlistCount };
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <WaitlistContext.Provider
      value={{
        submitEmail,
        waitlistCount,
        isLoading,
        toastMessage,
        toastType,
        clearToast,
      }}
    >
      {children}
    </WaitlistContext.Provider>
  );
};

export const useWaitlist = (): WaitlistContextType => {
  const context = useContext(WaitlistContext);
  if (!context) {
    throw new Error('useWaitlist must be used within a WaitlistProvider');
  }
  return context;
};
