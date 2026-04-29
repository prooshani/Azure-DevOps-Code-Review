"use client";

import { useMemo, useState } from "react";
import type { LlmProvider, ProviderConfig, ReviewResult, ReviewSettings } from "@/lib/types";

const providers: LlmProvider[] = ["openai", "anthropic", "gemini", "ollama", "lmstudio"];

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

export default function HomePage() {
  const [settings, setSettings] = useState<ReviewSettings>(initialSettings);
  const [candidate, setCandidate] = useState<ProviderConfig>({ provider: "openai" });
  const [models, setModels] = useState<string[]>([]);
  const [repos, setRepos] = useState<RepoPick[]>([]);
  const [prId, setPrId] = useState<string>("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState<string>("");

  const selectedRepoIds = useMemo(() => new Set(settings.azure.selectedRepositories.map((x) => x.repositoryId)), [settings.azure.selectedRepositories]);

  async function loadSaved() {
    const res = await fetch("/api/settings");
    const json = await res.json();
    if (json) setSettings(json);
  }

  async function saveAll() {
    setBusy("Saving settings...");
    await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
    setBusy("");
  }

  async function fetchRepos() {
    setBusy("Fetching accessible repos...");
    const res = await fetch("/api/azure/repos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pat: settings.azure.pat }),
    });
    const json = await res.json();
    setRepos(json.repos ?? []);
    setBusy("");
  }

  async function detectModels() {
    setBusy("Detecting models...");
    const res = await fetch("/api/models", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(candidate) });
    const json = await res.json();
    setModels(json.models ?? []);
    setBusy("");
  }

  async function buildProfile() {
    setBusy("Building style profile...");
    await fetch("/api/profile", { method: "POST" });
    setBusy("");
  }

  async function run() {
    setBusy("Running review...");
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pullRequestId: Number(prId) }),
    });
    const json = await res.json();
    setReview(json);
    setBusy("");
  }

  return (
    <main className="shell">
      <h1>Azure DevOps Code Review AI</h1>
      <p>Context-aware PR review with project style profile and multi-model support.</p>

      <div className="bar">
        <button onClick={loadSaved}>Load Settings</button>
        <button onClick={saveAll}>Save Settings</button>
        <button onClick={buildProfile}>Analyze Style</button>
        <span>{busy}</span>
      </div>

      <section className="panel">
        <h2>Azure Access</h2>
        <input placeholder="PAT" value={settings.azure.pat} onChange={(e) => setSettings({ ...settings, azure: { ...settings.azure, pat: e.target.value } })} />
        <button onClick={fetchRepos}>Fetch My Repositories</button>
        <div className="repoList">
          {repos.map((repo) => {
            const checked = selectedRepoIds.has(repo.repositoryId);
            return (
              <label key={`${repo.organization}-${repo.project}-${repo.repositoryId}`} className="repoItem">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...settings.azure.selectedRepositories, repo]
                      : settings.azure.selectedRepositories.filter((x) => x.repositoryId !== repo.repositoryId);
                    setSettings({ ...settings, azure: { ...settings.azure, selectedRepositories: next, organizationUrl: repo.organizationUrl } });
                  }}
                />
                {repo.organization} / {repo.project} / {repo.repositoryName}
              </label>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Provider + Model</h2>
        <select value={candidate.provider} onChange={(e) => setCandidate({ ...candidate, provider: e.target.value as LlmProvider })}>
          {providers.map((p) => <option key={p}>{p}</option>)}
        </select>
        <input placeholder="Base URL (optional)" value={candidate.baseUrl ?? ""} onChange={(e) => setCandidate({ ...candidate, baseUrl: e.target.value })} />
        <input placeholder="API Token" value={candidate.apiKey ?? ""} onChange={(e) => setCandidate({ ...candidate, apiKey: e.target.value })} />
        <button onClick={detectModels}>Auto Detect Models</button>
        <select value={candidate.model ?? ""} onChange={(e) => setCandidate({ ...candidate, model: e.target.value })}>
          <option value="">Select model</option>
          {models.map((m) => <option key={m}>{m}</option>)}
        </select>
        <button
          onClick={() => {
            if (!candidate.model) return;
            setSettings({ ...settings, providers: [...settings.providers.filter((p) => p.provider !== candidate.provider), candidate] });
          }}
        >
          Save Provider
        </button>
      </section>

      <section className="panel">
        <h2>Review</h2>
        <input placeholder="PR Number" value={prId} onChange={(e) => setPrId(e.target.value)} />
        <button onClick={run}>Run Review</button>
      </section>

      {review && (
        <section className="panel">
          <h2>Findings ({review.findings.length})</h2>
          <p>{review.summary}</p>
          {review.findings.map((f, i) => (
            <article key={`${f.filePath}-${i}`} className="finding">
              <div><strong>{f.severity.toUpperCase()}</strong> {f.filePath}:{f.lineStart} - {f.title}</div>
              <p>{f.why}</p>
              <p><strong>Fix:</strong> {f.suggestion}</p>
              {(f.before || f.after) && <pre>{`- ${f.before ?? ""}\n+ ${f.after ?? ""}`}</pre>}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
