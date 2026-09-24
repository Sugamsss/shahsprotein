import React from 'react';
import { useWaitlist } from '../../context/WaitlistContext';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

/** Sign-up failures (network or server). Success shows inline under the form instead. */
export const Toast: React.FC = () => {
  const { toastMessage, toastType, clearToast } = useWaitlist();

  if (!toastMessage) return null;

  const isSuccess = toastType === 'success';

  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={`toast toast--${isSuccess ? 'success' : 'error'} animate-fade-in`}
    >
      {isSuccess ? (
        <CheckCircle2 size={20} className="toast__icon" aria-hidden="true" />
      ) : (
        <AlertCircle size={20} className="toast__icon" aria-hidden="true" />
      )}
      <span className="toast__message">{toastMessage}</span>
      <button type="button" onClick={clearToast} aria-label="Close notification" className="toast__close">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};
