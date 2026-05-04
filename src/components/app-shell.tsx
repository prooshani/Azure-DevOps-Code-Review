"use client";

import { useState } from "react";
import {
  IconActivity,
  IconHelp,
  IconHome,
  IconInfo,
  IconLogout,
  IconMenu,
  IconReview,
  IconSettings,
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

  function selectPage(p: Page) {
    setPage(p);
    setNavOpen(false);
  }

  return (
    <div className="app-shell">
      {navOpen ? <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} /> : null}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/reviso-icon.png" alt="Reviso" className="brand-logo" />
          <div className="sidebar-brand-text">
            <strong>Reviso</strong>
            <small>v0.1.4</small>
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
                <span>{item.label}</span>
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
            <span>PAT Guide</span>
          </a>
          <a
            className="nav-item"
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
          >
            <IconActivity className="nav-icon" />
            <span>What&apos;s new</span>
          </a>
        </div>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="user-avatar" aria-hidden>
              {initials}
            </div>
            <div className="user-chip-info">
              <strong>{user.name || "Local user"}</strong>
              <small>{user.email}</small>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onLogout} aria-label="Logout" title="Logout">
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

