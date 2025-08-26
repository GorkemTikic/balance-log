import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err?: Error }> {
  constructor(p:any){ super(p); this.state = { err: undefined }; }
  static getDerivedStateFromError(err: Error){ return { err }; }
  componentDidCatch(err: Error){
    const o=document.getElementById("err"); const p=o?.querySelector("pre");
    if(o && p){ o.style.display="block"; p.textContent = err.stack || String(err); }
  }
  render(){
    if(this.state.err){
      return <div style={{padding:16}}><h2>App error</h2><pre style={{whiteSpace:"pre-wrap"}}>{this.state.err.stack||String(this.state.err)}</pre></div>;
    }
    return this.props.children as any;
  }
}

document.getElementById("boot")?.remove();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary><App/></ErrorBoundary>
  </React.StrictMode>
);
