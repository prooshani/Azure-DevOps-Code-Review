"use client";

import { useEffect, useState } from "react";
import {
  IconActivity,
  IconHelp,
  IconHome,
  IconInfo,
  IconLogout,
  IconMenu,
  IconReview,
  IconSettings,
  IconSidebarToggle,
} from "./icons";
import type { AuthUser } from "./auth-screen";

export type Page = "dashboard" | "reviews" | "settings" | "about";

const NAV_ITEMS: Array<{ id: Page; label: string; icon: React.ComponentType<{ width?: number; height?: number; className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: IconHome },
  { id: "reviews", label: "Code Reviews", icon: IconReview },
  { id: "settings", label: "Settings", icon: IconSettings },
  { id: "about", label: "About", icon: IconInfo },
];

const PAGE_TITLES: Record<Page, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Workspace overview and quick actions" },
  reviews: { title: "Code Reviews", subtitle: "Run AI reviews and inspect findings" },
  settings: { title: "Settings", subtitle: "Configure Azure access, AI providers and workspace" },
  about: { title: "About", subtitle: "App information, version and credits" },
};

const COLLAPSED_KEY = "reviso.sidebar.collapsed";

export function AppShell({
  page,
  setPage,
  user,
  onLogout,
  topRight,
  children,
}: {
  page: Page;
  setPage: (p: Page) => void;
  user: AuthUser;
  onLogout: () => void;
  topRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();
  const meta = PAGE_TITLES[page];
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapsed state once on mount; persist on every change.
  // Reading localStorage must happen post-hydration to avoid SSR/CSR mismatch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  function selectPage(p: Page) {
    setPage(p);
    setNavOpen(false);
  }

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {navOpen ? <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} /> : null}
      <aside className={`sidebar ${navOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          <img src="/reviso-icon.png" alt="Reviso" className="brand-logo" />
          <div className="sidebar-brand-text">
            <strong>
              Reviso <span className="brand-version">(v0.1.7)</span>
            </strong>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-section-label">Workspace</span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => selectPage(item.id)}
                type="button"
              >
                <Icon className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="sidebar-section">
          <span className="sidebar-section-label">Resources</span>
          <a
            className="nav-item"
            href="https://learn.microsoft.com/azure/devops/integrate/get-started/authentication/pats"
            target="_blank"
            rel="noreferrer"
          >
            <IconHelp className="nav-icon" />
            <span className="nav-label">PAT Guide</span>
          </a>
          <a
            className="nav-item"
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
          >
            <IconActivity className="nav-icon" />
            <span className="nav-label">What&apos;s new</span>
          </a>
        </div>

        <button
          type="button"
          className="nav-item sidebar-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconSidebarToggle className="nav-icon" />
          <span className="nav-label">{collapsed ? "Expand" : "Collapse"}</span>
        </button>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="user-avatar" aria-hidden>
              {initials}
            </div>
            <div className="user-chip-info">
              <strong>{user.name || "Local user"}</strong>
              <small>{user.email}</small>
            </div>
            <button className="btn btn-ghost btn-icon user-chip-logout" onClick={onLogout} aria-label="Logout" title="Logout">
              <IconLogout width={15} height={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon nav-toggle"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            type="button"
          >
            <IconMenu />
          </button>
          <div className="topbar-title">
            <h1>{meta.title}</h1>
            <span className="topbar-title-sep" aria-hidden />
            <small>{meta.subtitle}</small>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-actions">{topRight}</div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
