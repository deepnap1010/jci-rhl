// ============================================================
//  ERROR BOUNDARY
//  Without this, a single component error blanks the entire app
//  (React unmounts the whole tree). This catches render errors,
//  keeps the shell (sidebar/topbar) alive, and lets the user
//  recover without losing their session.
// ============================================================
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

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
      <div style={{ padding: '60px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>This screen hit an error</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, maxWidth: 520, marginInline: 'auto' }}>
          {this.state.error.message || 'An unexpected error occurred.'}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700 }}
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{ marginLeft: 10, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 18px', fontWeight: 700 }}
        >
          Reload app
        </button>
      </div>
    );
  }
}
