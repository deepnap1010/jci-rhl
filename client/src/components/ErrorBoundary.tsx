// ============================================================
//  ERROR BOUNDARY
//  Without this, a single component error blanks the entire app
//  (React unmounts the whole tree). This catches render errors,
//  keeps the shell (sidebar/topbar) alive, and lets the user
//  recover without losing their session.
// ============================================================
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production this is where you'd report to Sentry/LogRocket/etc.
    console.error('UI error caught by boundary:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel p-10 text-center max-w-[560px] mx-auto my-12">
        <AlertTriangle size={40} className="text-stopped mx-auto mb-3" />
        <div className="text-lg font-bold text-primary mb-1.5">This screen hit an error</div>
        <div className="text-steel text-sm mb-5 max-w-[520px] mx-auto">
          {this.state.error.message || 'An unexpected error occurred.'}
        </div>
        <div className="flex items-center justify-center gap-2.5">
          <button
            onClick={() => this.setState({ error: null })}
            className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="bg-surface text-steel border border-line rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
