export interface WaitlistSubmission {
  email: string;
  source?: string;
  productId?: string;
  createdAt: string;
}

export interface WaitlistAnalytics {
  sessionKey?: string;
  startedAt?: string;
  endedAt?: string;
  activeSeconds?: number;
  sectionDwell?: Record<string, number>;
  theme?: 'light' | 'dark';
  deviceType?: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface WaitlistResponse {
  success: boolean;
  message: string;
  totalCount: number;
  alreadySubscribed?: boolean;
}

export interface WaitlistContextType {
  submitEmail: (email: string, source?: string, productId?: string, marketingConsent?: boolean) => Promise<WaitlistResponse>;
  waitlistCount: number;
  isLoading: boolean;
  toastMessage: string | null;
  toastType: 'success' | 'error' | null;
  clearToast: () => void;
}
