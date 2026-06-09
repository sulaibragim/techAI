import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Catches render crashes so the app shows a readable message instead of a blank
// dark screen, with recovery actions (reload, or wipe local caches and reload).
// `declare props` keeps this compiling even though the project ships without
// @types/react (React resolves as `any`).
export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  private hardReset = async () => {
    try {
      ['techai-crm-store-v3', 'techai-settings-v2', 'techai-brain-chat', 'techai-token', 'techai-auth-v3'].forEach(k => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      const regs = await navigator.serviceWorker?.getRegistrations();
      await Promise.all((regs || []).map(r => r.unregister()));
    } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-lg w-full bg-slate-900 border border-red-500/20 rounded-2xl p-8 shadow-2xl space-y-5">
          <div>
            <h1 className="text-xl font-bold text-white">Something broke on this screen</h1>
            <p className="text-sm text-slate-400 mt-2">The app hit an error and stopped rendering. Try reloading. If it keeps happening, use “Clear &amp; reload” to wipe local data and start clean.</p>
          </div>

          <pre className="text-[11px] leading-relaxed text-red-300 bg-slate-950 border border-white/10 rounded-xl p-4 max-h-48 overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
          </pre>

          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold transition-colors"
            >
              Reload
            </button>
            <button
              onClick={this.hardReset}
              className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-bold transition-colors"
            >
              Clear &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
