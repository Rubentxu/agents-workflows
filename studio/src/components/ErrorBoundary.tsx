/**
 * ErrorBoundary — catches uncaught React errors and shows a fallback UI.
 * Prevents the entire app from crashing on a single component error.
 */

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full mx-4 p-6 bg-surface border border-error/30 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center">
                <span className="text-xl">⚠️</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-on-surface">Something went wrong</h1>
                <p className="text-xs text-on-background/60">An unexpected error occurred</p>
              </div>
            </div>
            {this.state.error && (
              <pre className="text-xs text-error bg-error-container/50 p-3 rounded overflow-auto max-h-32 border border-error/20">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full px-4 py-2 bg-surface-container-high border border-outline rounded text-sm text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
