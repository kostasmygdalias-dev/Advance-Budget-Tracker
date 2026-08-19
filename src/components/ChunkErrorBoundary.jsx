import { Component } from 'react';

// Each route is a separate lazy-loaded chunk (Recurring-<hash>.js, etc.).
// A tab left open from before a deploy still has the OLD index.html/main
// bundle cached, which references chunk filenames that no longer exist on
// the server once a new deploy overwrites them — the dynamic import() 404s,
// React throws, and with no boundary the whole app unmounts to a blank
// screen. One automatic reload almost always fixes it (it re-fetches the
// current index.html, which points at the current chunks); the
// sessionStorage flag stops a real, persistent error from reload-looping.
const RELOAD_FLAG = 'expensetrack_chunk_reload_attempted';

export function clearChunkReloadFlag() {
  sessionStorage.removeItem(RELOAD_FLAG);
}

export default class ChunkErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    if (!sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center p-6">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Loading the latest version…</p>
            <button
              onClick={() => { clearChunkReloadFlag(); window.location.reload(); }}
              className="text-sm underline text-muted-foreground"
            >
              Tap here if nothing happens
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
