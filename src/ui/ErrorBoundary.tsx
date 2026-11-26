import { Component, type ReactNode } from 'react';

/** If something breaks the screen, the data is still on the device: offer a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="fatal">
        <h2>Qualcosa si è inceppato</h2>
        <p className="muted">I tuoi dati sono ancora salvati su questo dispositivo. Ricarica la pagina; se si ripete, esporta un backup dalle impostazioni appena puoi.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Ricarica
        </button>
        <pre className="code" style={{ maxWidth: 520, textAlign: 'left' }}>{String(this.state.err.message)}</pre>
      </div>
    );
  }
}
