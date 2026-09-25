import React from 'react';
import { AnalyticsService } from '../../services/analyticsService';
import { siteConfig } from '../../data/siteConfig';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    AnalyticsService.trackEvent('render_error', { error: error.message, componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="section-error">
          <p>{siteConfig.ui.sectionError}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
