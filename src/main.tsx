import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err?: Error }> {
  constructor(props: any) { super(props); this.state = { err: undefined }; }
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) {
    const o = document.getElementById('error-overlay'); const t = document.getElementById('error-text');
    if (o && t) { o.style.display='block'; t.textContent = err.stack || String(err); }
  }
  render() {
    return this.state.err
      ? <div style={{ padding: 16 }}><h2>App error</h2><pre style={{ whiteSpace: "pre-wrap" }}>{this.state.err.stack || String(this.state.err)}</pre></div>
      : this.props.children as any;
  }
}

document.getElementById("boot")?.remove();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
