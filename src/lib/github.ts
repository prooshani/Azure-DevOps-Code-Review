import type { PullRequestContext, ReviewSettings } from "./types";

type GitHubRepoPick = {
  owner: string;
  name: string;
  fullName: string;
};

function ghHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function listGithubRepositories(token: string): Promise<GitHubRepoPick[]> {
  const repos = await ghFetch<Array<{ owner: { login: string }; name: string; full_name: string }>>(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    token,
  );
  return repos.map((r) => ({ owner: r.owner.login, name: r.name, fullName: r.full_name }));
}

export async function listGithubBranches(token: string, repoFullName: string): Promise<string[]> {
  const branches = await ghFetch<Array<{ name: string }>>(
    `https://api.github.com/repos/${repoFullName}/branches?per_page=100`,
    token,
  );
  return branches.map((b) => b.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export async function fetchGithubPullRequestContext(
  settings: ReviewSettings,
  pullRequestNumber: number,
  repositoryFullName?: string,
): Promise<PullRequestContext> {
  const token = settings.github.token?.trim();
  const repo = repositoryFullName
    ? settings.github.selectedRepositories.find((r) => r.fullName === repositoryFullName)
    : settings.github.selectedRepositories[0];
  if (!token) throw new Error("GitHub token missing.");
  if (!repo) throw new Error("Select at least one GitHub repository first.");

  const pr = await ghFetch<{
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    base: { ref: string };
    head: { ref: string };
    issue_url: string;
  }>(`https://api.github.com/repos/${repo.fullName}/pulls/${pullRequestNumber}`, token);

  const files = await ghFetch<Array<{ filename: string; patch?: string }>>(
    `https://api.github.com/repos/${repo.fullName}/pulls/${pullRequestNumber}/files?per_page=100`,
    token,
  );

  const timeline = await ghFetch<Array<{ event?: string; source?: { issue?: { number?: number; title?: string } } }>>(
    `${pr.issue_url}/timeline?per_page=100`,
    token,
  ).catch(() => []);

  const linked = timeline
    .filter((e) => e.event === "cross-referenced" && e.source?.issue?.number)
    .map((e) => ({ id: Number(e.source!.issue!.number), title: e.source!.issue!.title ?? `Issue #${e.source!.issue!.number}` }));

  return {
    provider: "github",
    reference: `${repo.fullName}#${pullRequestNumber}`,
    pullRequestId: pullRequestNumber,
    title: pr.title,
    description: pr.body ?? "",
    sourceBranch: pr.head.ref,
    targetBranch: pr.base.ref,
    linkedWorkItemIds: linked.map((x) => x.id),
    linkedWorkItems: linked.map((x) => ({ id: x.id, title: x.title, state: "Open", description: "" })),
    changedFiles: files.map((f) => ({ path: f.filename, patch: f.patch ?? "" })),
    relatedPullRequests: [],
  };
}

export async function fetchGithubBranchCompareContext(
  settings: ReviewSettings,
  input: { repositoryFullName: string; sourceBranch: string; targetBranch: string },
): Promise<PullRequestContext> {
  const token = settings.github.token?.trim();
  const repo = settings.github.selectedRepositories.find((r) => r.fullName === input.repositoryFullName);
  if (!token) throw new Error("GitHub token missing.");
  if (!repo) throw new Error("Select at least one GitHub repository first.");

  const sourceBranch = input.sourceBranch.trim();
  const targetBranch = input.targetBranch.trim();
  if (!sourceBranch || !targetBranch) throw new Error("Source and target branches are required.");

  const compare = await ghFetch<{
    files: Array<{ filename: string; patch?: string }>;
  }>(
    `https://api.github.com/repos/${repo.fullName}/compare/${encodeURIComponent(targetBranch)}...${encodeURIComponent(sourceBranch)}`,
    token,
  );

  return {
    provider: "github",
    reference: `${repo.fullName}:${sourceBranch}->${targetBranch}`,
    pullRequestId: Math.abs(hashCode(`${repo.fullName}:${sourceBranch}:${targetBranch}`)),
    title: `GitHub branch review ${sourceBranch} -> ${targetBranch}`,
    description: `Repository: ${repo.fullName}`,
    sourceBranch,
    targetBranch,
    linkedWorkItemIds: [],
    linkedWorkItems: [],
    changedFiles: compare.files.map((f) => ({ path: f.filename, patch: f.patch ?? "" })),
    relatedPullRequests: [],
  };
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
