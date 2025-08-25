import React from "react";
import ReactDOM from "react-dom/client";
// If your App is at /src/App.tsx, this path is correct:
import App from "./App";
import "./styles.css";

/** Tiny ErrorBoundary so React errors render on the page */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err?: Error }> {
  constructor(props: any) { super(props); this.state = { err: undefined }; }
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { /* also write into overlay if present */ 
    const o = document.getElementById('error-overlay'); const t = document.getElementById('error-text');
    if (o && t) { o.style.display='block'; t.textContent = err.stack || String(err); }
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16 }}>
          <h2>App error</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.err.stack || String(this.state.err)}</pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}

const rootEl = document.getElementById("root")!;
const bootEl = document.getElementById("boot");
if (bootEl) bootEl.remove();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
