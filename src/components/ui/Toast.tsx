import React, { useEffect, useRef, useState } from 'react';
import { useWaitlist } from '../../context/WaitlistContext';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

// Matches .toast--leaving in global.css (a short fade and drop).
const EXIT_MS = 200;

/** Sign-up failures (network or server). Success shows inline under the form instead. */
export const Toast: React.FC = () => {
  const { toastMessage, toastType, clearToast } = useWaitlist();
  const [isLeaving, setIsLeaving] = useState(false);

  // The latest clearToast, so a re-render never restarts the exit timer.
  const clearRef = useRef(clearToast);
  clearRef.current = clearToast;

  // A new message always arrives fully shown.
  useEffect(() => {
    setIsLeaving(false);
  }, [toastMessage]);

  useEffect(() => {
    if (!isLeaving) return;
    const timer = setTimeout(() => clearRef.current(), EXIT_MS);
    return () => clearTimeout(timer);
  }, [isLeaving]);

  if (!toastMessage) return null;

  const isSuccess = toastType === 'success';

  // Play the exit, then clear. Instant for people who ask for less motion.
  const close = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      clearToast();
      return;
    }
    setIsLeaving(true);
  };

  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={`toast toast--${isSuccess ? 'success' : 'error'} animate-fade-in${isLeaving ? ' toast--leaving' : ''}`}
    >
      {isSuccess ? (
        <CheckCircle2 size={20} className="toast__icon" aria-hidden="true" />
      ) : (
        <AlertCircle size={20} className="toast__icon" aria-hidden="true" />
      )}
      <span className="toast__message">{toastMessage}</span>
      <button type="button" onClick={close} aria-label="Close notification" className="toast__close">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};
