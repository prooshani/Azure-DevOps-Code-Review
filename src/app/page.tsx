"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  LlmProvider,
  ProviderConfig,
  ReviewResult,
  ReviewSettings,
  StyleProfile,
} from "@/lib/types";
import { AppShell, type Page } from "@/components/app-shell";
import { AuthScreen, type AuthUser } from "@/components/auth-screen";
import { ErrorBoundary } from "@/components/error-boundary";
import { FindingCard } from "@/components/finding-card";
import {
  IconActivity,
  IconBolt,
  IconBook,
  IconBranch,
  IconCheck,
  IconCloud,
  IconCpu,
  IconEdit,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconHistory,
  IconKey,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconRepo,
  IconReview,
  IconSearch,
  IconSettings,
  IconShield,
  IconSparkles,
  IconTrash,
  IconX,
} from "@/components/icons";
import { SetupWizard } from "@/components/setup-wizard";
import { ToastStack, useToast } from "@/components/toast";
import { isCompletionOnlyModel } from "@/lib/llm";

const PROVIDERS: LlmProvider[] = ["openai", "anthropic", "gemini", "ollama", "lmstudio"];
const PROVIDER_META: Record<LlmProvider, { label: string; kind: "cloud" | "local"; emoji: string; defaultBase?: string }> = {
  openai: { label: "OpenAI", kind: "cloud", emoji: "AI" },
  anthropic: { label: "Anthropic", kind: "cloud", emoji: "AN" },
  gemini: { label: "Google Gemini", kind: "cloud", emoji: "GE" },
  ollama: { label: "Ollama", kind: "local", emoji: "OL", defaultBase: "http://localhost:11434" },
  lmstudio: { label: "LM Studio", kind: "local", emoji: "LM", defaultBase: "http://localhost:1234/v1" },
};

type RepoPick = {
  organization: string;
  organizationUrl: string;
  project: string;
  repositoryId: string;
  repositoryName: string;
};

const initialSettings: ReviewSettings = {
  azure: { pat: "", selectedRepositories: [] },
  providers: [],
  workspaceRoots: ["C:/"],
};

type SettingsTab = "azure" | "ai" | "workspace";

export default function HomePage() {
  // ---- auth ----
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState("");
  const [authError, setAuthError] = useState("");

  // ---- nav ----
  const [page, setPage] = useState<Page>("dashboard");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("azure");

  // ---- data ----
  const [settings, setSettings] = useState<ReviewSettings>(initialSettings);
  const [candidate, setCandidate] = useState<ProviderConfig>({ provider: "openai" });
  const [models, setModels] = useState<string[]>([]);
  const [repos, setRepos] = useState<RepoPick[]>([]);
  const [history, setHistory] = useState<ReviewResult[]>([]);
  const [prId, setPrId] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [providerStatus, setProviderStatus] = useState<Record<string, "ok" | "fail" | "unknown">>({});

  // ---- ui ----
  const [busy, setBusy] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const toast = useToast();

  const selectedRepoIds = useMemo(
    () => new Set(settings.azure.selectedRepositories.map((x) => x.repositoryId)),
    [settings.azure.selectedRepositories],
  );
  const hasPat = Boolean(settings.azure.pat.trim());
  const hasRepoSelection = settings.azure.selectedRepositories.length > 0;
  const hasProvider = settings.providers.some((p) => p.model);
  const setupComplete = hasPat && hasRepoSelection && hasProvider;

  // ---- fetch helpers ----
  async function safeJson<T>(res: Response): Promise<T> {
    const type = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!type.includes("application/json")) {
      throw new Error(`Server returned non-JSON response (${res.status}). ${text.slice(0, 120)}`);
    }
    const json = JSON.parse(text) as { error?: string } & T;
    if (!res.ok) {
      throw new Error(json.error ?? `Request failed (${res.status}).`);
    }
    return json as T;
  }

  // ---- auth ----
  useEffect(() => {
    void me();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function me() {
    try {
      const json = await safeJson<{ user: AuthUser | null }>(await fetch("/api/auth/me"));
      setUser(json.user);
      if (json.user) {
        await Promise.all([loadSaved(), loadHistory(), loadProfile()]);
      }
    } catch {
      setUser(null);
    }
  }

  async function authenticate(mode: "login" | "register", form: { name?: string; email: string; password: string }) {
    setAuthBusy(mode === "login" ? "Signing in..." : "Creating account...");
    setAuthError("");
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const json = await safeJson<{ user: AuthUser }>(
        await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mode === "login" ? { email: form.email, password: form.password } : form),
        }),
      );
      setUser(json.user);
      await Promise.all([loadSaved(), loadHistory(), loadProfile()]);
      toast.success(mode === "login" ? "Welcome back" : "Account ready", `Signed in as ${json.user.email}.`);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setAuthBusy("");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSettings(initialSettings);
    setHistory([]);
    setReview(null);
    setRepos([]);
    setPage("dashboard");
  }

  // ---- data ops ----
  async function loadSaved() {
    try {
      const json = await safeJson<ReviewSettings | null>(await fetch("/api/settings"));
      if (json) {
        setSettings(json);
      }
    } catch {
      /* ignore */
    }
  }

  async function loadHistory() {
    try {
      const json = await safeJson<{ history: ReviewResult[] }>(await fetch("/api/history"));
      setHistory(json.history ?? []);
    } catch {
      /* ignore */
    }
  }

  async function loadProfile() {
    try {
      const json = await safeJson<{ profile: StyleProfile | null }>(await fetch("/api/profile"));
      setStyleProfile(json.profile);
    } catch {
      setStyleProfile(null);
    }
  }

  async function saveAll() {
    setBusy("Saving settings...");
    try {
      await safeJson(
        await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(settings),
        }),
      );
      toast.success("Settings saved", "Your configuration is stored locally.");
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy("");
    }
  }

  async function fetchRepos() {
    if (!settings.azure.pat.trim()) {
      toast.error("PAT required", "Add a Personal Access Token first.");
      return;
    }
    setBusy("Connecting to Azure DevOps...");
    try {
      const json = await safeJson<{ repos: RepoPick[] }>(
        await fetch("/api/azure/repos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pat: settings.azure.pat,
            organizationUrl: settings.azure.organizationUrl || undefined,
          }),
        }),
      );
      setRepos(json.repos ?? []);
      toast.success("Repositories fetched", `Discovered ${json.repos?.length ?? 0} repositories.`);
    } catch (e) {
      toast.error("Repo fetch failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy("");
    }
  }

  async function detectModels() {
    setBusy("Detecting models...");
    try {
      const json = await safeJson<{ models: string[] }>(
        await fetch("/api/models", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(candidate),
        }),
      );
      setModels(json.models ?? []);
      toast.success("Models detected", `Found ${json.models?.length ?? 0} models.`);
    } catch (e) {
      toast.error("Model discovery failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy("");
    }
  }

  async function testModelConnection() {
    setBusy("Testing connection...");
    try {
      const json = await safeJson<{ ok: boolean; message: string }>(
        await fetch("/api/models/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(candidate),
        }),
      );
      setProviderStatus((s) => ({ ...s, [candidate.provider]: "ok" }));
      toast.success("Connection ok", json.message);
    } catch (e) {
      setProviderStatus((s) => ({ ...s, [candidate.provider]: "fail" }));
      toast.error("Connection test failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy("");
    }
  }

  async function buildProfile() {
    setBusy("Building style profile...");
    try {
      const json = await safeJson<{ profile: StyleProfile }>(
        await fetch("/api/profile", { method: "POST" }),
      );
      setStyleProfile(json.profile);
      toast.success(
        "Style profile updated",
        `${json.profile.rules.length} rules extracted from your repositories.`,
      );
    } catch (e) {
      toast.error("Profile build failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy("");
    }
  }

  async function run(overrideProvider?: ProviderConfig) {
    if (!prId) {
      toast.error("PR number required");
      return;
    }
    setBusy("Running review...");
    try {
      const body: { pullRequestId: number; provider?: ProviderConfig } = { pullRequestId: Number(prId) };
      if (overrideProvider?.model) {
        body.provider = overrideProvider;
      }
      const json = await safeJson<ReviewResult>(
        await fetch("/api/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setReview(json);
      await loadHistory();
      toast.success("Review finished", json.summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Review failed", msg);
    } finally {
      setBusy("");
    }
  }

  async function saveProvider() {
    if (!candidate.model) {
      toast.error("Pick a model", "Detect models then choose one to save.");
      return;
    }
    const newSettings = {
      ...settings,
      providers: [
        ...settings.providers.filter((p) => p.provider !== candidate.provider),
        { ...candidate, isActive: true },
      ].map((p) => ({
        ...p,
        isActive: p.provider === candidate.provider,
      })),
    };
    setSettings(newSettings);

    // Persist immediately
    try {
      await safeJson(
        await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(newSettings),
        }),
      );
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : undefined);
    }

    toast.success("Provider saved", `${PROVIDER_META[candidate.provider].label} ready for reviews.`);
  }

  const setActiveProvider: (provider: LlmProvider) => Promise<void> = async (provider: LlmProvider) => {
    const newSettings = {
      ...settings,
      providers: settings.providers.map((p) => ({
        ...p,
        isActive: p.provider === provider,
      })),
    };
    setSettings(newSettings);

    // Persist immediately so it survives app restart
    try {
      await safeJson(
        await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(newSettings),
        }),
      );
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : undefined);
    }

    const meta = PROVIDER_META[provider];
    const active = newSettings.providers.find((p) => p.provider === provider);
    toast.success("Active provider changed", `Now using ${meta.label} (${active?.model})`);
  };

  async function removeProvider(provider: LlmProvider) {
    const newSettings = {
      ...settings,
      providers: settings.providers.filter((p) => p.provider !== provider),
    };
    setSettings(newSettings);

    // Persist immediately
    try {
      await safeJson(
        await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(newSettings),
        }),
      );
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : undefined);
    }
  }

  function loadProviderForEdit(p: ProviderConfig) {
    setCandidate(p);
    setModels(p.model ? [p.model] : []);
  }

  function viewReview(item: ReviewResult) {
    setReview(item);
    setPage("reviews");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function onRepeatReview(item: ReviewResult) {
    // Extract provider/model from summary like "Reviewed PR #123 with openai/gpt-4o. Found X issue(s)."
    const match = item.summary.match(/Reviewed PR #\d+ with (\w+)\/(\S+)/);
    if (match) {
      const [_, providerStr, model] = match;
      const provider = settings.providers.find((p) => p.provider === (providerStr as LlmProvider) && p.model === model);
      if (provider) {
        setPrId(String(item.sources.pullRequestId));
        run({ provider: provider.provider, apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: provider.model });
        toast.info("Repeat review", `Re-running with ${PROVIDER_META[provider.provider]?.label ?? provider.provider}/${model}`);
        return;
      }
    }
    // Fallback: use default provider
    setPrId(String(item.sources.pullRequestId));
    run();
    toast.info("Repeat review", "No provider found in history — using default provider");
  }

  // ---- gated view ----
  if (!user) {
    return <AuthScreen busy={authBusy} error={authError} onAuth={authenticate} onResume={me} />;
  }

  const activeProvider = settings.providers.find((p) => p.isActive) ?? settings.providers.find((p) => p.model);
  const statusItems = [
    { label: "Azure PAT", ok: hasPat },
    { label: "Repositories", ok: hasRepoSelection },
    { label: `AI (${activeProvider ? `${activeProvider.provider}/${activeProvider.model}` : "none"})`, ok: hasProvider },
  ];

  const topRight = (
    <>
      <div className="status-badge-wrap">
        <span className={`status-badge ${setupComplete ? "status-ok" : "status-warn"}`}>
          <span className="dot" />
          {setupComplete ? "Ready" : "Setup needed"}
        </span>
        <div className="status-popup" role="tooltip">
          <div className="status-popup-title">Connection status</div>
          {statusItems.map((s) => (
            <div key={s.label} className="status-popup-row">
              <span className={`status-popup-dot ${s.ok ? "ok" : "warn"}`} />
              <span>{s.label}</span>
              <span className={`status-popup-state ${s.ok ? "ok" : "warn"}`}>{s.ok ? "Connected" : "Not set"}</span>
            </div>
          ))}
        </div>
      </div>
      {null /* Save button lives at bottom of settings page only */}
    </>
  );

  return (
    <ErrorBoundary>
      {busy ? <div className="loading-bar" /> : null}
      <AppShell
        page={page}
        setPage={setPage}
        user={user}
        onLogout={logout}
        topRight={topRight}
      >
        {page === "dashboard" ? (
          <DashboardPage
            user={user}
            setupComplete={setupComplete}
            status={{ hasPat, hasRepoSelection, hasProvider }}
            history={history}
            settings={settings}
            styleProfile={styleProfile}
            onJumpToSettings={(t) => {
              setSettingsTab(t);
              setPage("settings");
            }}
            onGoReview={() => setPage("reviews")}
            onViewReview={viewReview}
          />
        ) : null}

        {page === "reviews" ? (
          <ReviewsPage
            prId={prId}
            setPrId={setPrId}
            run={run}
            busy={busy}
            setupComplete={setupComplete}
            settings={settings}
            review={review}
            history={history}
            onClearReview={() => setReview(null)}
            onViewReview={viewReview}
            onRepeatReview={onRepeatReview}
          />
        ) : null}

        {page === "settings" ? (
          <SettingsPage
            tab={settingsTab}
            setTab={setSettingsTab}
            settings={settings}
            setSettings={setSettings}
            candidate={candidate}
            setCandidate={setCandidate}
            models={models}
            repos={repos}
            repoFilter={repoFilter}
            setRepoFilter={setRepoFilter}
            selectedRepoIds={selectedRepoIds}
            showPat={showPat}
            setShowPat={setShowPat}
            showApi={showApi}
            setShowApi={setShowApi}
            busy={busy}
            providerStatus={providerStatus}
            styleProfile={styleProfile}
            onFetchRepos={fetchRepos}
            onDetectModels={detectModels}
            onTestConnection={testModelConnection}
            onSaveProvider={saveProvider}
            onRemoveProvider={removeProvider}
            onLoadProviderForEdit={loadProviderForEdit}
            onBuildProfile={buildProfile}
            onSaveAll={saveAll}
            onSetActiveProvider={setActiveProvider}
          />
        ) : null}

        {page === "about" ? <AboutPage /> : null}
      </AppShell>

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </ErrorBoundary>
  );
}

/* =================================================================
   DASHBOARD
   ================================================================= */
function DashboardPage({
  user,
  setupComplete,
  status,
  history,
  settings,
  styleProfile,
  onJumpToSettings,
  onGoReview,
  onViewReview,
}: {
  user: AuthUser;
  setupComplete: boolean;
  status: { hasPat: boolean; hasRepoSelection: boolean; hasProvider: boolean };
  history: ReviewResult[];
  settings: ReviewSettings;
  styleProfile: StyleProfile | null;
  onJumpToSettings: (t: SettingsTab) => void;
  onGoReview: () => void;
  onViewReview: (item: ReviewResult) => void;
}) {
  const totalFindings = history.reduce((acc, r) => acc + (r.findings?.length ?? 0), 0);
  const last = history[0];
  const firstName = (user.name || user.email).split(/[\s@]/)[0] || "there";
  const activeProvider = settings.providers.find((p) => p.model);

  return (
    <>
      <section className="hero-greet">
        <div>
          <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Welcome back
          </span>
          <h1 style={{ fontSize: 28, marginTop: 4 }}>
            Hi, {firstName}. Ready to ship some PRs?
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 6, maxWidth: 560 }}>
            {setupComplete
              ? "Your workspace is configured. Run a review against any pull request you can access."
              : "Finish the three onboarding steps below to unlock AI-powered code reviews."}
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={onGoReview} disabled={!setupComplete}>
            <IconPlay />
            Start a review
          </button>
        </div>
      </section>

      {!setupComplete ? <SetupWizard status={status} onJumpToSettings={onJumpToSettings} /> : null}

      <section className="metric-grid">
        <MetricCard
          label="Total reviews"
          value={history.length.toString()}
          icon={<IconReview />}
          foot="Click to view all reviews"
          onClick={onGoReview}
          clickable
        />
        <MetricCard
          label="Repositories"
          value={settings.azure.selectedRepositories.length.toString()}
          icon={<IconRepo />}
          foot={settings.azure.selectedRepositories.slice(0, 2).map(r => r.repositoryName).join(", ") || "None selected"}
          onClick={() => onJumpToSettings("azure")}
          clickable
        />
        <MetricCard
          label="Active AI model"
          value={activeProvider ? activeProvider.provider.toUpperCase() : "—"}
          icon={<IconCpu />}
          foot={activeProvider?.model ?? "No model selected"}
          onClick={() => onJumpToSettings("ai")}
          clickable
          accent="brand"
        />
        <MetricCard
          label="Issues found"
          value={totalFindings.toString()}
          icon={<IconBolt />}
          foot={`${history.filter(r => r.findings.some(f => f.severity === "error")).length} runs had errors`}
          accent={totalFindings > 0 ? "warning" : undefined}
        />
      </section>

      <section className="grid-2">
        <article className="card">
          <div className="card-header">
            <div className="card-title-block">
              <h2>Quick actions</h2>
              <span className="card-subtitle">Most common tasks for review workflows</span>
            </div>
          </div>
          <div className="col" style={{ gap: 10 }}>
            <button className="btn btn-primary" onClick={onGoReview} disabled={!setupComplete}>
              <IconPlay />
              Start a code review
            </button>
            <button className="btn btn-secondary" onClick={() => onJumpToSettings("azure")}>
              <IconKey />
              Manage Azure access
            </button>
            <button className="btn btn-secondary" onClick={() => onJumpToSettings("ai")}>
              <IconSparkles />
              Configure AI providers
            </button>
          </div>
        </article>

        <article className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-header">
            <div className="card-title-block">
              <h2>Recent reviews</h2>
              <span className="card-subtitle">Latest PR runs from your local profile</span>
            </div>
            <span className="badge badge-info">{history.length}</span>
          </div>
          {history.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">
                <IconHistory />
              </span>
              <h3>No reviews yet</h3>
              <p>Run your first AI review and it will show up here for quick recall.</p>
            </div>
          ) : (
            <div
              className="history-list"
              style={{
                flex: 1,
                overflowY: "auto",
                maxHeight: "280px",
                paddingRight: 4,
              }}
            >
              {history.slice(0, 4).map((item) => (
                <HistoryRow key={item.id} item={item} onClick={() => onViewReview(item)} />
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Style profile</h2>
            <span className="card-subtitle">
              {styleProfile
                ? `Last updated ${new Date(styleProfile.generatedAt).toLocaleString()}`
                : "Not built yet — run profile mining to extract team conventions."}
            </span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onJumpToSettings("workspace")}>
            <IconSettings /> Manage
          </button>
        </div>
        {styleProfile && styleProfile.rules.length > 0 ? (
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {styleProfile.rules.slice(0, 8).map((rule) => (
              <span key={rule} className="badge badge-info" style={{ textTransform: "none", padding: "6px 10px", fontSize: 12 }}>
                <IconCheck width={11} height={11} />
                {rule}
              </span>
            ))}
            {styleProfile.rules.length > 8 ? (
              <span className="badge">+{styleProfile.rules.length - 8} more</span>
            ) : null}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 18 }}>
            <span className="empty-state-icon">
              <IconSparkles />
            </span>
            <h3>No style profile yet</h3>
            <p>Mine your repositories to extract conventions like brace style, PascalCase methods, and return spacing.</p>
          </div>
        )}
      </section>
    </>
  );
}

function MetricCard({
  label, value, icon, foot, onClick, clickable, accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  foot: string;
  onClick?: () => void;
  clickable?: boolean;
  accent?: "brand" | "warning" | "danger";
}) {
  const accentStyle: React.CSSProperties =
    accent === "brand"   ? { borderColor: "rgba(124,92,255,0.5)", background: "linear-gradient(135deg,rgba(124,92,255,0.1) 0%,var(--bg-elevated) 50%)" } :
    accent === "warning" ? { borderColor: "rgba(245,158,11,0.4)", background: "linear-gradient(135deg,rgba(245,158,11,0.08) 0%,var(--bg-elevated) 50%)" } :
    accent === "danger"  ? { borderColor: "rgba(239,68,68,0.4)",  background: "linear-gradient(135deg,rgba(239,68,68,0.08) 0%,var(--bg-elevated) 50%)" } : {};

  return (
    <div
      className={`metric-card ${clickable ? "metric-card-clickable" : ""}`}
      style={accentStyle}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable && onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
    >
      <div className="metric-head">
        <span className="metric-label">{label}</span>
        <span className="metric-icon-wrap">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <span className="metric-foot">{foot}</span>
      {clickable ? <span className="metric-arrow">→</span> : null}
    </div>
  );
}

function HistoryRow({ item, onClick }: { item: ReviewResult; onClick?: () => void }) {
  const date = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";
  const errorCount = item.findings.filter((f) => f.severity === "error").length;
  const warnCount = item.findings.filter((f) => f.severity === "warning").length;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        padding: "12px 16px",
        margin: "8px 0",
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--brand)";
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-subtle)";
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <span className="history-pr-id" style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", whiteSpace: "nowrap" }}>
        #{item.sources.pullRequestId}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: 2,
          }}
          title={item.summary}
        >
          {item.summary}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{date}</div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {errorCount > 0 && <span className="badge badge-danger" style={{ fontSize: 10, padding: "2px 6px" }}>{errorCount} err</span>}
        {warnCount > 0 && <span className="badge badge-warning" style={{ fontSize: 10, padding: "2px 6px" }}>{warnCount} warn</span>}
        <span className="badge badge-info" style={{ fontSize: 10, padding: "2px 6px" }}>{item.findings.length} total</span>
      </div>
    </button>
  );
}

/* =================================================================
   REVIEWS PAGE
   ================================================================= */
type PrPeekResult = {
  id: number;
  title: string;
  description: string;
  status: "active" | "completed" | "abandoned" | "notSet";
  authorName: string;
  authorEmail: string;
  createdDate: string;
  sourceBranch: string;
  targetBranch: string;
  repositoryName: string;
  projectName: string;
  url: string;
  workItems: Array<{ id: number; title: string; state: string; type: string }>;
  changedFiles: number;
  commitsCount: number;
};

function ReviewsPage({
  prId,
  setPrId,
  run,
  busy,
  setupComplete,
  settings,
  review,
  history,
  onClearReview,
  onViewReview,
  onRepeatReview,
}: {
  prId: string;
  setPrId: (s: string) => void;
  run: (overrideProvider?: ProviderConfig) => void;
  busy: string;
  setupComplete: boolean;
  settings: ReviewSettings;
  review: ReviewResult | null;
  history: ReviewResult[];
  onClearReview: () => void;
  onViewReview: (item: ReviewResult) => void;
  onRepeatReview: (item: ReviewResult) => void;
}) {
  type SeverityFilter = "all" | "error" | "warning" | "info";
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [prPreview, setPrPreview] = useState<PrPeekResult | null>(null);
  const [peekBusy, setPeekBusy] = useState(false);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  async function peekPr() {
    if (!prId || !settings.azure.pat) return;
    const repo = settings.azure.selectedRepositories[0];
    if (!repo) return;
    setPeekBusy(true);
    setPeekError(null);
    setPrPreview(null);
    try {
      const res = await fetch("/api/azure/pr-peek", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pat: settings.azure.pat,
          organizationUrl: repo.organizationUrl,
          project: repo.project,
          pullRequestId: Number(prId),
        }),
      });
      const json = await res.json() as PrPeekResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch PR");
      setPrPreview(json);
    } catch (e) {
      setPeekError(e instanceof Error ? e.message : "Could not fetch PR");
    } finally {
      setPeekBusy(false);
    }
  }

  /** Run review — auto-fetches PR preview first if not already loaded */
  async function handleRun() {
    if (!prId) return;
    if (!prPreview && setupComplete) {
      await peekPr();
    }
    // Build provider override if one is selected
    let overrideProvider: ProviderConfig | undefined;
    if (selectedProvider) {
      const parts = selectedProvider.split("/");
      if (parts.length === 2) {
        const [provider, model] = parts;
        const cfg = settings.providers.find((p) => p.provider === (provider as LlmProvider) && p.model === model);
        if (cfg) {
          overrideProvider = { provider: cfg.provider, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model };
        }
      }
    }
    run(overrideProvider);
  }

  const filteredFindings = useMemo(() => {
    if (!review) {
      return [];
    }
    if (severity === "all") {
      return review.findings;
    }
    return review.findings.filter((f) => f.severity === severity);
  }, [review, severity]);

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) {
      return history;
    }
    return history.filter(
      (h) =>
        h.summary.toLowerCase().includes(q) ||
        String(h.sources.pullRequestId).includes(q),
    );
  }, [history, historyQuery]);

  function copyAsMarkdown() {
    if (!review) {
      return;
    }
    navigator.clipboard.writeText(reviewToMarkdown(review));
  }

  function downloadJson() {
    if (!review) {
      return;
    }
    const blob = new Blob([JSON.stringify(review, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `review-pr-${review.sources.pullRequestId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const errorCount = review?.findings.filter((f) => f.severity === "error").length ?? 0;
  const warnCount = review?.findings.filter((f) => f.severity === "warning").length ?? 0;
  const infoCount = review?.findings.filter((f) => f.severity === "info").length ?? 0;

  return (
    <>
      <section className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>New review</h2>
            <span className="card-subtitle">Paste a PR number, run AI against your team rules &amp; PR context.</span>
          </div>
          <span className={`badge ${setupComplete ? "badge-success" : "badge-warning"}`}>
            <span className="dot" /> {setupComplete ? "Ready" : "Setup required"}
          </span>
        </div>

        <div className="pr-input-row">
          <div className="field pr-field-wrap">
            <label className="field-label" htmlFor="pr">Pull Request number</label>
            <div className="input-group">
              <input
                id="pr"
                className="input pr-number-input"
                placeholder="e.g. 8421"
                value={prId}
                onChange={(e) => { setPrId(e.target.value.replace(/\D/g, "")); setPrPreview(null); setPeekError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && prId) handleRun(); }}
                inputMode="numeric"
                style={{ paddingLeft: 40, paddingRight: 52 }}
                autoComplete="off"
              />
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", pointerEvents: "none" }}>
                <IconBranch width={14} height={14} />
              </span>
              <span className="input-suffix">
                <button
                  type="button"
                  className="input-icon-btn pr-peek-btn"
                  title="Preview PR details from Azure DevOps"
                  disabled={!prId || Boolean(busy) || !setupComplete}
                  onClick={peekPr}
                  aria-label="Fetch PR preview"
                >
                  {peekBusy ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <IconSearch width={13} height={13} />}
                </button>
              </span>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ alignSelf: "flex-end", flexShrink: 0 }}
            onClick={handleRun}
            disabled={!setupComplete || Boolean(busy)}
          >
            {busy ? <span className="spinner" /> : <IconPlay />}
            {busy ? "Reviewing…" : "Run review"}
          </button>
        </div>

        {/* Provider/Model selector */}
        <div className="field" style={{ marginTop: 12 }}>
          <label className="field-label" htmlFor="review-provider">
            AI Provider <span className="muted">(optional — uses default if empty)</span>
          </label>
          <select
            id="review-provider"
            className="select"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            disabled={Boolean(busy)}
          >
            <option value="">— Use default provider —</option>
            {settings.providers
              .filter((p) => p.model)
              .map((p) => {
                const m = PROVIDER_META[p.provider];
                return (
                  <option key={`${p.provider}/${p.model}`} value={`${p.provider}/${p.model}`}>
                    {m?.label ?? p.provider} · {p.model}
                    {p.isActive ? " (default)" : ""}
                  </option>
                );
              })}
          </select>
          {settings.providers.filter((p) => p.model).length === 0 ? (
            <span className="field-hint">No providers configured. Go to Settings → AI Providers to add one.</span>
          ) : null}
        </div>

        <span className="field-hint" style={{ marginTop: 4 }}>PR must live in one of your selected repositories. Press Enter or click Run.</span>

        {peekError ? (
          <div className="row" style={{ gap: 6, color: "var(--danger)", fontSize: 12.5 }}>
            <IconX width={12} height={12} style={{ flexShrink: 0 }} /> {peekError}
          </div>
        ) : null}

        {prPreview ? <PrPreviewCard preview={prPreview} onRunReview={handleRun} runDisabled={!setupComplete || Boolean(busy)} /> : null}
      </section>

      {review ? (
        <section className="card">
          <div className="card-header" style={{ justifyContent: "space-between" }}>
            <div className="card-title-block">
              <h2>Review result · PR #{review.sources.pullRequestId}</h2>
              <span className="card-subtitle">{review.summary}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onRepeatReview(review)}
                title="Repeat this review"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 10px" }}
              >
                <IconRefresh width={12} height={12} />
                Repeat
              </button>
              <button className="btn btn-ghost btn-icon" onClick={onClearReview} aria-label="Close review">
                <IconX />
              </button>
            </div>
          </div>

          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <span className="badge">{review.sources.linkedWorkItemIds.length > 0 ? `${review.sources.linkedWorkItemIds.length} linked work item${review.sources.linkedWorkItemIds.length !== 1 ? "s" : ""}` : "No linked items"}</span>
            <span className="badge">{review.sources.relatedPullRequestIds.length > 0 ? `${review.sources.relatedPullRequestIds.length} related PR${review.sources.relatedPullRequestIds.length !== 1 ? "s" : ""}` : "No related PRs"}</span>
            {review.createdAt ? (
              <span className="badge">{new Date(review.createdAt).toLocaleString()}</span>
            ) : null}
          </div>

          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div className="tab-rail" role="tablist" style={{ flexShrink: 0 }}>
              {([
                { id: "all",     label: "All",     count: review.findings.length },
                { id: "error",   label: "Error",   count: errorCount },
                { id: "warning", label: "Warning", count: warnCount },
                { id: "info",    label: "Info",    count: infoCount },
              ] as { id: SeverityFilter; label: string; count: number }[]).map(({ id, label, count }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={severity === id}
                  className={`tab-rail-item ${severity === id ? "active" : ""} tab-sev-${id}`}
                  onClick={() => setSeverity(id)}
                  type="button"
                >
                  {label}
                  {count > 0 ? <span className={`tab-count tab-count-${id}`}>{count}</span> : null}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={copyAsMarkdown} title="Copy as markdown">
                <IconBook width={13} height={13} /> Copy MD
              </button>
              <button className="btn btn-secondary btn-sm" onClick={downloadJson} title="Download JSON">
                <IconExternal width={13} height={13} /> JSON
              </button>
            </div>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">
                <IconCheck />
              </span>
              <h3>{review.findings.length === 0 ? "Nothing to flag" : "No matches"}</h3>
              <p>
                {review.findings.length === 0
                  ? "Reviewer found no issues against your team rules and PR context."
                  : "No findings at this severity level."}
              </p>
            </div>
          ) : (
            <div className="findings-list">
              {filteredFindings.map((f, i) => (
                <FindingCard key={`${f.filePath}-${f.lineStart}-${i}`} finding={f} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Review history</h2>
            <span className="card-subtitle">Persistent local archive — click any row to view findings.</span>
          </div>
          <span className="badge badge-info">{history.length}</span>
        </div>
        {history.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <IconHistory />
            </span>
            <h3>No history yet</h3>
            <p>Run a review to start building local memory.</p>
          </div>
        ) : (
          <>
            <div className="input-group" style={{ marginBottom: 10 }}>
              <input
                className="input"
                placeholder="Search by PR number or summary..."
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                style={{ paddingLeft: 38 }}
              />
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }}>
                <IconSearch width={15} height={15} />
              </span>
            </div>
            {filteredHistory.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5 }}>No matches.</p>
            ) : (
              <div className="history-list">
                {filteredHistory.map((item) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    onClick={() => onViewReview(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function reviewToMarkdown(review: ReviewResult): string {
  const lines: string[] = [];
  lines.push(`# Review · PR #${review.sources.pullRequestId}`);
  lines.push("");
  lines.push(review.summary);
  lines.push("");
  lines.push(`- Linked work items: ${review.sources.linkedWorkItemIds.join(", ") || "—"}`);
  lines.push(`- Related PRs: ${review.sources.relatedPullRequestIds.join(", ") || "—"}`);
  lines.push("");
  for (const f of review.findings) {
    lines.push(`## [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`\`${f.filePath}:${f.lineStart}\``);
    lines.push("");
    lines.push(f.why);
    if (f.before) {
      lines.push("");
      lines.push("```diff");
      f.before.split("\n").forEach((l) => lines.push(`- ${l}`));
      if (f.after) {
        f.after.split("\n").forEach((l) => lines.push(`+ ${l}`));
      }
      lines.push("```");
    }
    if (f.suggestion) {
      lines.push("");
      lines.push(`> **Suggestion.** ${f.suggestion}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/* =================================================================
   SETTINGS
   ================================================================= */
function SettingsPage({
  tab,
  setTab,
  settings,
  setSettings,
  candidate,
  setCandidate,
  models,
  repos,
  repoFilter,
  setRepoFilter,
  selectedRepoIds,
  showPat,
  setShowPat,
  showApi,
  setShowApi,
  busy,
  providerStatus,
  styleProfile,
  onFetchRepos,
  onDetectModels,
  onTestConnection,
  onSaveProvider,
  onRemoveProvider,
  onLoadProviderForEdit,
  onBuildProfile,
  onSaveAll,
  onSetActiveProvider,
}: {
  tab: SettingsTab;
  setTab: (t: SettingsTab) => void;
  settings: ReviewSettings;
  setSettings: (s: ReviewSettings) => void;
  candidate: ProviderConfig;
  setCandidate: (p: ProviderConfig) => void;
  models: string[];
  repos: RepoPick[];
  repoFilter: string;
  setRepoFilter: (s: string) => void;
  selectedRepoIds: Set<string>;
  showPat: boolean;
  setShowPat: (b: boolean) => void;
  showApi: boolean;
  setShowApi: (b: boolean) => void;
  busy: string;
  providerStatus: Record<string, "ok" | "fail" | "unknown">;
  styleProfile: StyleProfile | null;
  onFetchRepos: () => void;
  onDetectModels: () => void;
  onTestConnection: () => void;
  onSaveProvider: () => Promise<void>;
  onRemoveProvider: (p: LlmProvider) => Promise<void>;
  onLoadProviderForEdit: (p: ProviderConfig) => void;
  onBuildProfile: () => void;
  onSaveAll: () => void;
  onSetActiveProvider: (p: LlmProvider) => Promise<void>;
}) {
  return (
    <>
      <div className="tab-rail" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "azure"}
          className={`tab-rail-item ${tab === "azure" ? "active" : ""}`}
          onClick={() => setTab("azure")}
        >
          <IconKey /> Azure DevOps
        </button>
        <button
          role="tab"
          aria-selected={tab === "ai"}
          className={`tab-rail-item ${tab === "ai" ? "active" : ""}`}
          onClick={() => setTab("ai")}
        >
          <IconSparkles /> AI Providers
        </button>
        <button
          role="tab"
          aria-selected={tab === "workspace"}
          className={`tab-rail-item ${tab === "workspace" ? "active" : ""}`}
          onClick={() => setTab("workspace")}
        >
          <IconRepo /> Workspace &amp; Style
        </button>
      </div>

      {tab === "azure" ? (
        <AzureTab
          settings={settings}
          setSettings={setSettings}
          showPat={showPat}
          setShowPat={setShowPat}
          repos={repos}
          repoFilter={repoFilter}
          setRepoFilter={setRepoFilter}
          selectedRepoIds={selectedRepoIds}
          busy={busy}
          onFetchRepos={onFetchRepos}
        />
      ) : null}

      {tab === "ai" ? (
        <AiTab
          settings={settings}
          candidate={candidate}
          setCandidate={setCandidate}
          models={models}
          showApi={showApi}
          setShowApi={setShowApi}
          busy={busy}
          providerStatus={providerStatus}
          onDetectModels={onDetectModels}
          onTestConnection={onTestConnection}
          onSaveProvider={onSaveProvider}
          onRemoveProvider={onRemoveProvider}
          onLoadProviderForEdit={onLoadProviderForEdit}
          onSetActiveProvider={onSetActiveProvider}
        />
      ) : null}

      {tab === "workspace" ? (
        <WorkspaceTab
          settings={settings}
          setSettings={setSettings}
          busy={busy}
          styleProfile={styleProfile}
          onBuildProfile={onBuildProfile}
        />
      ) : null}

      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button className="btn btn-primary" onClick={onSaveAll} disabled={Boolean(busy)}>
          {busy ? <span className="spinner" /> : <IconCheck />}
          Save all settings
        </button>
      </div>
    </>
  );
}

function AzureTab({
  settings,
  setSettings,
  showPat,
  setShowPat,
  repos,
  repoFilter,
  setRepoFilter,
  selectedRepoIds,
  busy,
  onFetchRepos,
}: {
  settings: ReviewSettings;
  setSettings: (s: ReviewSettings) => void;
  showPat: boolean;
  setShowPat: (b: boolean) => void;
  repos: RepoPick[];
  repoFilter: string;
  setRepoFilter: (s: string) => void;
  selectedRepoIds: Set<string>;
  busy: string;
  onFetchRepos: () => void;
}) {
  const filtered = useMemo(() => {
    const q = repoFilter.trim().toLowerCase();
    if (!q) {
      return repos;
    }
    return repos.filter(
      (r) =>
        r.repositoryName.toLowerCase().includes(q) ||
        r.project.toLowerCase().includes(q) ||
        r.organization.toLowerCase().includes(q),
    );
  }, [repos, repoFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, RepoPick[]>();
    for (const r of filtered) {
      const key = `${r.organization} / ${r.project}`;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggleRepo(repo: RepoPick, checked: boolean) {
    const next = checked
      ? [...settings.azure.selectedRepositories, repo]
      : settings.azure.selectedRepositories.filter((x) => x.repositoryId !== repo.repositoryId);
    setSettings({
      ...settings,
      azure: { ...settings.azure, selectedRepositories: next, organizationUrl: repo.organizationUrl },
    });
  }

  return (
    <section className="grid-2" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
      <article className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Azure DevOps Access</h2>
            <span className="card-subtitle">Personal Access Token used to discover orgs and read PRs.</span>
          </div>
        </div>

        <div className="form-section">
          <div className="field">
            <label className="field-label" htmlFor="pat">Personal Access Token</label>
            <div className="input-group">
              <input
                id="pat"
                type={showPat ? "text" : "password"}
                className="input"
                placeholder="Paste your Azure DevOps PAT"
                value={settings.azure.pat}
                onChange={(e) =>
                  setSettings({ ...settings, azure: { ...settings.azure, pat: e.target.value } })
                }
                autoComplete="off"
              />
              <span className="input-suffix">
                <button
                  className="input-icon-btn"
                  onClick={() => setShowPat(!showPat)}
                  aria-label="Toggle PAT visibility"
                  type="button"
                >
                  {showPat ? <IconEyeOff /> : <IconEye />}
                </button>
              </span>
            </div>
            <span className="field-hint">
              Required scopes: Code (Read), Work Items (Read), Project &amp; Team (Read).
            </span>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="orgUrl">Organization URL <span style={{ color: "var(--text-faint)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input
              id="orgUrl"
              type="url"
              className="input"
              placeholder="https://dev.azure.com/your-org"
              value={settings.azure.organizationUrl ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, azure: { ...settings.azure, organizationUrl: e.target.value } })
              }
              autoComplete="off"
            />
            <span className="field-hint">
              Fill this in if &quot;Fetch repositories&quot; fails with 401 — bypasses Profile scope requirement.
            </span>
          </div>
        </div>

        {/* Divider + action row */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={onFetchRepos} disabled={Boolean(busy)}>
              {busy ? <span className="spinner" /> : <IconRefresh />}
              Fetch repositories
            </button>
            <a
              className="btn btn-secondary btn-sm"
              href="https://learn.microsoft.com/azure/devops/integrate/get-started/authentication/pats"
              target="_blank"
              rel="noreferrer"
            >
              <IconBook width={13} height={13} /> Create PAT
              <IconExternal width={11} height={11} />
            </a>
          </div>
          {/* Status strip — text only, clearly non-interactive */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--info)", fontWeight: 600 }}>
              <IconShield width={10} height={10} /> Stored locally
            </span>
            <span style={{ color: "var(--text-faint)", fontSize: 11 }}>·</span>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              {settings.azure.selectedRepositories.length} {settings.azure.selectedRepositories.length === 1 ? "repo" : "repos"} selected
            </span>
          </div>
        </div>
      </article>

      <article className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Repositories</h2>
            <span className="card-subtitle">Pick one or more for context and style profiling.</span>
          </div>
        </div>

        <div className="repo-search">
          <div className="input-group">
            <input
              className="input"
              placeholder="Filter by org, project or repo name..."
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }}>
              <IconSearch width={15} height={15} />
            </span>
          </div>
        </div>

        {repos.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <IconRepo />
            </span>
            <h3>No repositories loaded</h3>
            <p>Add a PAT and click &quot;Fetch repositories&quot; to discover everything you can access.</p>
          </div>
        ) : (
          <div className="repo-list">
            {grouped.map(([groupKey, items]) => (
              <div key={groupKey} className="repo-group">
                <div className="repo-group-head">
                  <IconBranch width={12} height={12} />
                  {groupKey}
                  <span className="muted" style={{ marginLeft: "auto" }}>{items.length}</span>
                </div>
                {items.map((repo) => {
                  const checked = selectedRepoIds.has(repo.repositoryId);
                  return (
                    <label key={repo.repositoryId} className={`repo-item ${checked ? "checked" : ""}`}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={checked}
                        onChange={(e) => toggleRepo(repo, e.target.checked)}
                      />
                      <div className="repo-item-name">
                        <strong>{repo.repositoryName}</strong>
                        <small>{repo.organization} / {repo.project}</small>
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function AiTab({
  settings,
  candidate,
  setCandidate,
  models,
  showApi,
  setShowApi,
  busy,
  providerStatus,
  onDetectModels,
  onTestConnection,
  onSaveProvider,
  onRemoveProvider,
  onLoadProviderForEdit,
  onSetActiveProvider,
}: {
  settings: ReviewSettings;
  candidate: ProviderConfig;
  setCandidate: (p: ProviderConfig) => void;
  models: string[];
  showApi: boolean;
  setShowApi: (b: boolean) => void;
  busy: string;
  providerStatus: Record<string, "ok" | "fail" | "unknown">;
  onDetectModels: () => void;
  onTestConnection: () => void;
  onSaveProvider: () => Promise<void>;
  onRemoveProvider: (p: LlmProvider) => Promise<void>;
  onLoadProviderForEdit: (p: ProviderConfig) => void;
  onSetActiveProvider: (p: LlmProvider) => Promise<void>;
}) {
  const meta = PROVIDER_META[candidate.provider];
  const activeProvider = settings.providers.find((p) => p.isActive);

  return (
    <section className="grid-2" style={{ gridTemplateColumns: "1.05fr 1fr" }}>
      <article className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Add or update a provider</h2>
            <span className="card-subtitle">Cloud and local models supported. Tokens stored locally.</span>
          </div>
          <span className={`badge ${meta.kind === "cloud" ? "badge-info" : "badge-success"}`}>
            {meta.kind === "cloud" ? <IconCloud width={11} height={11} /> : <IconCpu width={11} height={11} />}
            {meta.kind}
          </span>
        </div>

        <div className="form-section">
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="provider">Provider</label>
              <select
                id="provider"
                className="select"
                value={candidate.provider}
                onChange={(e) => {
                  const provider = e.target.value as LlmProvider;
                  const m = PROVIDER_META[provider];
                  setCandidate({ ...candidate, provider, baseUrl: candidate.baseUrl ?? m.defaultBase ?? "" });
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_META[p].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="base">Base URL {meta.kind === "local" ? "" : <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>}</label>
              <input
                id="base"
                type="url"
                className="input"
                placeholder={meta.defaultBase ?? "https://api.provider.com"}
                value={candidate.baseUrl ?? ""}
                onChange={(e) => setCandidate({ ...candidate, baseUrl: e.target.value })}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="api">API Token</label>
            <div className="input-group">
              <input
                id="api"
                type={showApi ? "text" : "password"}
                className="input"
                placeholder={meta.kind === "local" ? "Optional for local providers" : "Provider API key"}
                value={candidate.apiKey ?? ""}
                onChange={(e) => setCandidate({ ...candidate, apiKey: e.target.value })}
                autoComplete="off"
              />
              <span className="input-suffix">
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowApi(!showApi)}
                  aria-label="Toggle API key visibility"
                >
                  {showApi ? <IconEyeOff /> : <IconEye />}
                </button>
              </span>
            </div>
            <span className="field-hint">
              {meta.kind === "local"
                ? "Detect models will probe the base URL for available models."
                : "Get keys from the provider dashboard. Stored locally per profile."}
            </span>
          </div>
        </div>

        {/* Divider + action row */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={onDetectModels} disabled={Boolean(busy)}>
              {busy ? <span className="spinner" /> : <IconRefresh />}
              Detect models
            </button>
            <button className="btn btn-secondary" onClick={onTestConnection} disabled={Boolean(busy)}>
              <IconActivity />
              Test connection
            </button>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div className="field">
            <label className="field-label" htmlFor="model">Model</label>
            <select
              id="model"
              className="select"
              value={candidate.model ?? ""}
              onChange={(e) => setCandidate({ ...candidate, model: e.target.value })}
            >
              <option value="">— Select model —</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {models.length === 0 ? (
              <span className="field-hint">Click &quot;Detect models&quot; after entering credentials.</span>
            ) : candidate.model && isCompletionOnlyModel(candidate.model) ? (
              <span className="field-hint" style={{ color: "var(--warning)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <IconActivity width={11} height={11} />
                This is a completion-only model (not chat). It will use the legacy completions endpoint.
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onSaveProvider} disabled={!candidate.model}>
            <IconPlus />
            Save provider
          </button>
        </div>
      </article>

      <article className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Configured providers</h2>
            <span className="card-subtitle">
              {activeProvider
                ? `Active: ${PROVIDER_META[activeProvider.provider].label} (${activeProvider.model})`
                : "No active provider — save a provider to set it as active"}
            </span>
          </div>
          <span className="badge">{settings.providers.length} SAVED</span>
        </div>

        {settings.providers.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <IconSparkles />
            </span>
            <h3>No providers yet</h3>
            <p>Configure at least one provider with a model selected. Pick OpenAI for cloud or Ollama for local-only.</p>
          </div>
        ) : (
          <div className="provider-list">
            {settings.providers.map((p) => {
              const m = PROVIDER_META[p.provider];
              const status = providerStatus[p.provider] ?? "unknown";
              const isActive = p.isActive;
              return (
                <div key={p.provider} className={`provider-row ${isActive ? "provider-row-active" : ""}`}>
                  <div className="provider-logo">{m.emoji}</div>
                  <div className="provider-row-info">
                    <strong>
                      {m.label}
                      {isActive ? (
                        <span className="badge badge-success" style={{ marginLeft: 6, fontSize: 9.5, padding: "1px 7px" }}>
                          <IconCheck width={9} height={9} /> Active
                        </span>
                      ) : null}
                      {status === "ok" ? (
                        <span className="badge badge-success" style={{ marginLeft: 6, fontSize: 9.5, padding: "1px 7px" }}>
                          <IconCheck width={9} height={9} /> tested
                        </span>
                      ) : status === "fail" ? (
                        <span className="badge badge-danger" style={{ marginLeft: 6, fontSize: 9.5, padding: "1px 7px" }}>
                          failed
                        </span>
                      ) : null}
                    </strong>
                    <small>
                      {p.model ?? "no model"} · {m.kind}
                      {p.baseUrl ? ` · ${p.baseUrl}` : ""}
                    </small>
                  </div>
                  <div className="provider-row-actions">
                    {!isActive && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => onSetActiveProvider(p.provider)}
                        aria-label="Set as default provider"
                        title="Set as default"
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          height: "auto",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <IconPlay width={11} height={11} />
                        Set Default
                      </button>
                    )}
                    {isActive && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background: "var(--success)",
                          color: "white",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <IconCheck width={10} height={10} />
                        Current
                      </span>
                    )}
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => onLoadProviderForEdit(p)}
                      aria-label="Edit provider"
                      title="Edit"
                    >
                      <IconEdit width={14} height={14} />
                    </button>
                    <button
                      className="btn btn-danger btn-icon"
                      onClick={() => onRemoveProvider(p.provider)}
                      aria-label="Remove provider"
                      title="Remove"
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
          <span className="badge badge-info"><IconCloud width={11} height={11} /> OpenAI</span>
          <span className="badge badge-info"><IconCloud width={11} height={11} /> Anthropic</span>
          <span className="badge badge-info"><IconCloud width={11} height={11} /> Gemini</span>
          <span className="badge badge-success"><IconCpu width={11} height={11} /> Ollama</span>
          <span className="badge badge-success"><IconCpu width={11} height={11} /> LM Studio</span>
        </div>
      </article>
    </section>
  );
}

function WorkspaceTab({
  settings,
  setSettings,
  busy,
  styleProfile,
  onBuildProfile,
}: {
  settings: ReviewSettings;
  setSettings: (s: ReviewSettings) => void;
  busy: string;
  styleProfile: StyleProfile | null;
  onBuildProfile: () => void;
}) {
  const joined = settings.workspaceRoots.join("\n");
  const [lastJoined, setLastJoined] = useState(joined);
  const [draft, setDraft] = useState(joined);
  if (lastJoined !== joined) {
    setLastJoined(joined);
    setDraft(joined);
  }

  function applyRoots() {
    const next = draft
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    setSettings({ ...settings, workspaceRoots: next });
  }

  return (
    <section className="grid-2">
      <article className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Local workspace roots</h2>
            <span className="card-subtitle">Folders the reviewer can read for repository context.</span>
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="roots">Roots (one per line)</label>
          <textarea
            id="roots"
            className="textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            placeholder={"C:/repos\nD:/work/azure"}
          />
          <span className="field-hint">Use absolute paths. Example: <code>C:/repos</code></span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" onClick={applyRoots}>
            <IconCheck /> Apply
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDraft(settings.workspaceRoots.join("\n"))}>
            Reset
          </button>
        </div>
      </article>

      <article className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Style profile</h2>
            <span className="card-subtitle">
              {styleProfile
                ? `${styleProfile.rules.length} rule${styleProfile.rules.length === 1 ? "" : "s"} extracted · last updated ${new Date(styleProfile.generatedAt).toLocaleString()}`
                : "Mine team conventions from selected repositories. Refresh anytime."}
            </span>
          </div>
          {styleProfile ? (
            <span className="badge badge-success"><IconCheck width={11} height={11} /> active</span>
          ) : null}
        </div>

        <div className="col" style={{ gap: 10 }}>
          {styleProfile && styleProfile.rules.length > 0 ? (
            <div className="col" style={{ gap: 6 }}>
              <span className="field-label">Detected rules</span>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {styleProfile.rules.map((rule) => (
                  <span key={rule} className="badge badge-info" style={{ textTransform: "none", padding: "5px 9px", fontSize: 11.5 }}>
                    <IconCheck width={10} height={10} /> {rule}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              <span className="badge badge-info"><IconBolt width={11} height={11} /> Always-brace if/else</span>
              <span className="badge badge-info">Empty line before return</span>
              <span className="badge badge-info">Async/await consistency</span>
              <span className="badge badge-info">Naming patterns</span>
            </div>
          )}

          <p className="muted" style={{ fontSize: 12.5 }}>
            Profile is auto-included with every review prompt for stable, repeatable findings.
          </p>

          {styleProfile && styleProfile.evidence.length > 0 ? (
            <details className="evidence-details">
              <summary>Evidence sample ({styleProfile.evidence.length} files)</summary>
              <div className="col" style={{ gap: 8, marginTop: 10 }}>
                {styleProfile.evidence.slice(0, 3).map((ev, i) => (
                  <div key={i} className="evidence-item">
                    <div className="evidence-head">
                      <span className="badge badge-info" style={{ textTransform: "none" }}>{ev.rule}</span>
                      <code className="muted" style={{ fontSize: 11 }}>{ev.file}</code>
                    </div>
                    <pre className="evidence-pre">{ev.sample}</pre>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <button
            className="btn btn-primary"
            onClick={onBuildProfile}
            disabled={Boolean(busy) || settings.azure.selectedRepositories.length === 0}
          >
            {busy ? <span className="spinner" /> : <IconSparkles />}
            {styleProfile ? "Refresh profile" : "Build profile"}
          </button>
          {settings.azure.selectedRepositories.length === 0 ? (
            <span className="field-hint">Select repositories first on the Azure DevOps tab.</span>
          ) : null}
        </div>
      </article>
    </section>
  );
}

/* =================================================================
   ABOUT
   ================================================================= */
function AboutPage() {
  return (
    <>
      <section className="card card-glow">
        <div className="card-header">
          <div className="row" style={{ gap: 14 }}>
            <img src="/reviso-icon.png" alt="Reviso" className="brand-logo brand-logo-lg" />
            <div className="card-title-block">
              <h1 style={{ fontSize: 22 }}>Reviso</h1>
              <p className="card-subtitle">Local-first, context-aware AI reviewer for Azure DevOps PRs.</p>
            </div>
          </div>
          <span className="badge badge-brand">v0.1.2</span>
        </div>

        <p className="text-secondary" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
          Reviso ingests PR diffs, linked work items and related history, then audits changes against your team
          coding conventions. Run it locally or as a Docker container. Bring your own keys for OpenAI, Anthropic,
          Gemini, or run fully offline with Ollama or LM Studio.
        </p>

        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <span className="badge badge-success"><IconShield width={11} height={11} /> Local-first</span>
          <span className="badge badge-info"><IconCpu width={11} height={11} /> Multi-model</span>
          <span className="badge badge-brand"><IconBolt width={11} height={11} /> Diff-style findings</span>
          <span className="badge"><IconBook width={11} height={11} /> MIT</span>
        </div>
      </section>

      <section className="grid-3">
        <FeatureCard icon={<IconKey />} title="PAT-based discovery" body="One PAT auto-discovers all accessible orgs, projects and repos." />
        <FeatureCard icon={<IconBranch />} title="Linked context" body="Pulls linked work items, related PRs and changed files automatically." />
        <FeatureCard icon={<IconSparkles />} title="Style profile" body="Mines team conventions and reuses them on every review." />
        <FeatureCard icon={<IconCpu />} title="Local LLMs" body="Use Ollama or LM Studio for fully offline workflows." />
        <FeatureCard icon={<IconCloud />} title="Cloud LLMs" body="OpenAI, Anthropic, Gemini supported out of the box." />
        <FeatureCard icon={<IconHistory />} title="Persistent memory" body="History persisted per profile for repeatable reviews." />
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Update channel</h2>
            <span className="card-subtitle">Track new releases of Reviso.</span>
          </div>
          <span className="badge badge-success"><IconCheck width={11} height={11} /> Up to date</span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary">
            <IconRefresh /> Check for updates
          </button>
          <a className="btn btn-ghost" href="https://github.com" target="_blank" rel="noreferrer">
            <IconExternal /> Release notes
          </a>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title-block">
            <h2>Credits</h2>
            <span className="card-subtitle">Built with Next.js 16 · React 19 · TypeScript</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Made for fullstack engineers who want fast, repeatable, team-shaped reviews. Issues and contributions welcome.
        </p>
      </section>
    </>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <article className="card card-tight">
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <span className="auth-feature-icon">{icon}</span>
        <div>
          <h3 style={{ fontSize: 13.5, marginBottom: 3 }}>{title}</h3>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{body}</p>
        </div>
      </div>
    </article>
  );
}

/* =================================================================
   PR PREVIEW CARD
   ================================================================= */
function PrPreviewCard({
  preview,
  onRunReview,
  runDisabled,
}: {
  preview: PrPeekResult;
  onRunReview: () => void;
  runDisabled: boolean;
}) {
  const statusClass =
    preview.status === "active" ? "active"
    : preview.status === "completed" ? "completed"
    : preview.status === "abandoned" ? "abandoned"
    : "active";

  const statusLabel = preview.status === "notSet" ? "Open" : preview.status;

  const authorInitials = preview.authorName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const createdDate = preview.createdDate
    ? new Date(preview.createdDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className="pr-preview">
      <div className="pr-preview-header">
        <div className="pr-preview-id">#{preview.id}</div>
        <div className="pr-preview-title-block">
          <h3 className="pr-preview-title">{preview.title}</h3>
          <div className="pr-preview-meta">
            <span className={`pr-preview-status ${statusClass}`}>
              <span className="dot" /> {statusLabel}
            </span>
            <span className="pr-preview-meta-item">
              <span
                style={{
                  width: 22, height: 22, borderRadius: "50%", background: "var(--brand-grad)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}
              >
                {authorInitials}
              </span>
              {preview.authorName}
            </span>
            {createdDate ? (
              <span className="pr-preview-meta-item">{createdDate}</span>
            ) : null}
            <span className="pr-preview-meta-item">
              <IconBranch width={12} height={12} /> {preview.repositoryName}
            </span>
            {preview.changedFiles > 0 ? (
              <span className="pr-preview-meta-item">
                <IconEdit width={12} height={12} /> {preview.changedFiles} files changed
              </span>
            ) : null}
          </div>
        </div>
        {preview.url ? (
          <a
            href={preview.url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-icon btn-sm"
            title="Open in Azure DevOps"
            style={{ flexShrink: 0 }}
          >
            <IconExternal width={14} height={14} />
          </a>
        ) : null}
      </div>

      <div className="pr-preview-body">
        <div>
          <div className="pr-preview-section-label">Branch</div>
          <div className="pr-branch-row">
            <span className="pr-branch-name">{preview.sourceBranch}</span>
            <span className="pr-branch-arrow">→</span>
            <span className="pr-branch-name">{preview.targetBranch}</span>
          </div>
        </div>

        {preview.workItems.length > 0 ? (
          <div>
            <div className="pr-preview-section-label">Linked work items ({preview.workItems.length})</div>
            <div className="pr-wi-list">
              {preview.workItems.map((wi) => (
                <div key={wi.id} className="pr-wi-item">
                  <span className="pr-wi-id">#{wi.id}</span>
                  <span className="pr-wi-title">{wi.title || `Work item ${wi.id}`}</span>
                  <span className="pr-wi-state">{wi.type} · {wi.state}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No linked work items.</p>
        )}

        {preview.description ? (
          <div>
            <div className="pr-preview-section-label">Description</div>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
              {preview.description.slice(0, 280)}{preview.description.length > 280 ? "…" : ""}
            </p>
          </div>
        ) : null}
      </div>

      <div className="pr-preview-actions">
        <button className="btn btn-primary" onClick={onRunReview} disabled={runDisabled}>
          <IconPlay width={14} height={14} /> Run AI review on this PR
        </button>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          {preview.workItems.length} work item{preview.workItems.length !== 1 ? "s" : ""} · {preview.changedFiles} file{preview.changedFiles !== 1 ? "s" : ""} changed
        </span>
      </div>
    </div>
  );
}

