import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Keeps a rendering error from blanking the whole app; offers a gentle way home. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot" role="alert" style={{ flexDirection: 'column', gap: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Oops — something got tangled up.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            this.setState({ error: null });
            window.location.hash = '#/';
          }}
        >
          Go back home
        </button>
      </div>
    );
  }
}
