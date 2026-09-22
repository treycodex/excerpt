import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface State { error: Error | null }

/**
 * The desktop editor must never show a blank white page. React unmounts the whole tree
 * on an uncaught render error, so without this the product simply disappears.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Excerpt crashed', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="notes">
        <header className="masthead">
          <div className="eyebrow">Excerpt</div>
          <h1>Something broke</h1>
          <p className="rubric">
            A screen failed to render. Your meetings are stored locally and are not
            affected — this is the page, not your data.
          </p>
          <p className="rubric"><code>{error.message}</code></p>
          <div className="actions">
            <button onClick={() => { this.setState({ error: null }); window.location.hash = '#/'; }}>
              Back to the start
            </button>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        </header>
      </div>
    );
  }
}
