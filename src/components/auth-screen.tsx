"use client";

import { useState } from "react";
import {
  IconBolt,
  IconCpu,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMail,
  IconShield,
  IconUser,
} from "./icons";

export type AuthUser = { id: string; name: string; email: string };
type AuthMode = "login" | "register";

export function AuthScreen({
  busy,
  error,
  onAuth,
  onResume,
}: {
  busy: string;
  error: string;
  onAuth: (mode: AuthMode, payload: { name?: string; email: string; password: string }) => Promise<void>;
  onResume: () => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void onAuth(mode, form);
  }

  return (
    <main className="auth-shell">
      <aside className="auth-brand-side">
       <div className="auth-brand-content">
        <div className="auth-brand-top">
          <img src="/reviso-icon.png" alt="Reviso" className="brand-logo" />
          <div className="auth-brand-top-text">
            Reviso
            <small>Context-aware reviewer</small>
          </div>
        </div>

        <div className="auth-brand-hero">
          <span className="badge badge-brand" style={{ width: "fit-content" }}>
            <span className="dot" /> Local-first
          </span>
          <h2>Ship Pull Requests with AI that knows your codebase.</h2>
          <p>
            Reviews PRs against your team conventions, linked work items and related history. Bring your own model,
            local or cloud.
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <IconBolt />
              </span>
              <div className="auth-feature-text">
                <strong>Context-aware findings</strong>
                <span>Diff-style notes with rationale &amp; suggested fix.</span>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <IconCpu />
              </span>
              <div className="auth-feature-text">
                <strong>Any model</strong>
                <span>OpenAI, Anthropic, Gemini, Ollama, LM Studio.</span>
              </div>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <IconShield />
              </span>
              <div className="auth-feature-text">
                <strong>PAT &amp; tokens stay local</strong>
                <span>Secrets persisted only on this machine.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-brand-foot">© Reviso · MIT License · v0.1.5</div>
       </div>
      </aside>

      <section className="auth-form-side">
        <form className="auth-card" onSubmit={submit}>
          <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 4 }}>
            <img src="/reviso-icon.png" alt="" aria-hidden className="brand-logo" />
            <div>
              <h1>{mode === "login" ? "Welcome back" : "Create your profile"}</h1>
              <p className="auth-sub">
                {mode === "login"
                  ? "Sign in to continue your review workflow."
                  : "Set up a local profile to store settings privately."}
              </p>
            </div>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`tab-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`tab-btn ${mode === "register" ? "active" : ""}`}
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>

          {mode === "register" ? (
            <div className="field">
              <label className="field-label" htmlFor="name">Full Name</label>
              <div className="input-group">
                <input
                  id="name"
                  className="input"
                  placeholder="Jane Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoComplete="name"
                  style={{ paddingLeft: 38 }}
                />
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }}>
                  <IconUser width={15} height={15} />
                </span>
              </div>
            </div>
          ) : null}

          <div className="field">
            <label className="field-label" htmlFor="email">Email</label>
            <div className="input-group">
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
                style={{ paddingLeft: 38 }}
                required
              />
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }}>
                <IconMail width={15} height={15} />
              </span>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">Password</label>
            <div className="input-group">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                className="input"
                placeholder="Enter password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                style={{ paddingLeft: 38 }}
                required
                minLength={mode === "register" ? 8 : undefined}
              />
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }}>
                <IconLock width={15} height={15} />
              </span>
              <span className="input-suffix">
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowPw(!showPw)}
                  aria-label="Toggle password visibility"
                >
                  {showPw ? <IconEyeOff /> : <IconEye />}
                </button>
              </span>
            </div>
            {mode === "register" ? (
              <span className="field-hint">At least 8 characters.</span>
            ) : null}
          </div>

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={Boolean(busy)}>
            {busy ? <span className="spinner" /> : null}
            {busy ? busy : mode === "login" ? "Sign In" : "Create Account"}
          </button>

          <div className="auth-divider">or</div>

          <button type="button" className="btn btn-secondary btn-block" onClick={() => void onResume()}>
            Resume Last Session
          </button>

          {error ? (
            <div className="badge badge-danger" style={{ padding: "8px 12px", textTransform: "none", fontSize: 12.5 }}>
              {error}
            </div>
          ) : null}

          <p className="auth-sub" style={{ textAlign: "center", marginTop: 8 }}>
            {mode === "login" ? "New here? " : "Already registered? "}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              style={{ padding: 0, color: "var(--brand-2)", minHeight: "auto" }}
            >
              {mode === "login" ? "Create an account" : "Sign in instead"}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}

