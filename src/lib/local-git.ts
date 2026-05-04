import { basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PullRequestContext, ReviewSettings } from "./types";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

type LocalBranchReviewInput = {
  repositoryRoot?: string;
  sourceBranch: string;
  targetBranch?: string;
};

export async function listLocalBranches(repositoryRoot: string): Promise<string[]> {
  const raw = await git(["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"], repositoryRoot);
  const cleaned = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== "HEAD" && !s.endsWith("/HEAD"))
    .map((s) => (s.startsWith("origin/") ? s.slice("origin/".length) : s));
  return [...new Set(cleaned)].sort((a, b) => a.localeCompare(b));
}

export async function fetchLocalBranchContext(
  settings: ReviewSettings,
  input?: LocalBranchReviewInput,
): Promise<PullRequestContext> {
  const selected = settings.local.selectedRepositories[0];
  const repoRoot = input?.repositoryRoot ?? selected?.rootPath;
  if (!repoRoot) throw new Error("Select local repository first.");
  const sourceBranch = input?.sourceBranch?.trim();
  const targetBranch = input?.targetBranch?.trim() ?? selected?.defaultBaseBranch ?? "main";
  if (!sourceBranch) throw new Error("Source branch required for local review.");

  const mergeBase = (await git(["merge-base", sourceBranch, targetBranch], repoRoot)).trim();
  const nameOnly = await git(["diff", "--name-only", `${mergeBase}...${sourceBranch}`], repoRoot);
  const files = nameOnly.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const changedFiles = await Promise.all(
    files.map(async (filePath) => {
      const patch = await git(["diff", `${mergeBase}...${sourceBranch}`, "--", filePath], repoRoot).catch(() => "");
      return { path: filePath, patch };
    }),
  );

  return {
    provider: "local",
    reference: `${basename(repoRoot)}:${sourceBranch}->${targetBranch}`,
    pullRequestId: Math.abs(hashCode(`${repoRoot}:${sourceBranch}:${targetBranch}`)),
    title: `Local review ${sourceBranch} -> ${targetBranch}`,
    description: `Repository: ${repoRoot}`,
    sourceBranch,
    targetBranch,
    linkedWorkItemIds: [],
    linkedWorkItems: [],
    changedFiles,
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
