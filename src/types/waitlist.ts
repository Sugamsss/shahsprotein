export interface WaitlistSubmission {
  email: string;
  source?: string;
  productId?: string;
  createdAt: string;
}

export interface WaitlistResponse {
  success: boolean;
  message: string;
  totalCount: number;
}

export interface WaitlistContextType {
  submitEmail: (email: string, source?: string, productId?: string) => Promise<WaitlistResponse>;
  waitlistCount: number;
  isLoading: boolean;
  toastMessage: string | null;
  toastType: 'success' | 'error' | null;
  clearToast: () => void;
}
