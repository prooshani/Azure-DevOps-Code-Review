"use client";

import { Component, type ReactNode } from "react";

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof window !== "undefined") {
      console.error("[App ErrorBoundary]", error, info);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32 }}>
          <div className="card" style={{ borderColor: "var(--danger-border)" }}>
            <div className="card-header">
              <div className="card-title-block">
                <h2 style={{ color: "var(--danger)" }}>Something went wrong</h2>
                <span className="card-subtitle">An unexpected client error happened.</span>
              </div>
            </div>
            <pre
              className="text-mono"
              style={{
                whiteSpace: "pre-wrap",
                background: "var(--bg-input)",
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border-soft)",
                color: "var(--text-secondary)",
                fontSize: 12,
                overflow: "auto",
                maxHeight: 280,
              }}
            >
              {this.state.error.stack ?? this.state.error.message}
            </pre>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={this.reset}>
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
