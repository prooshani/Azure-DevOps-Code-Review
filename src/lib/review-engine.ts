import path from "node:path";
import { fetchPullRequestContext } from "./azure-devops";
import { reviewWithProvider } from "./llm";
import { loadSettings } from "./settings-store";
import { loadStyleProfile } from "./style-profile";
import type { ReviewResult } from "./types";

export async function runReview(pullRequestId: number): Promise<ReviewResult> {
  const settings = await loadSettings();
  if (!settings) {
    throw new Error("Settings missing. Save settings first.");
  }

  const provider = settings.providers.find((x) => x.model);
  if (!provider?.model) {
    throw new Error("No provider model configured.");
  }

  const pr = await fetchPullRequestContext(settings, pullRequestId);
  const profilePath = settings.styleProfilePath ?? path.join(process.cwd(), "data", "style-profile.json");
  const style = await loadStyleProfile(profilePath);

  const prompt = `You are strict enterprise code reviewer.\nReturn JSON only: {"findings": [...]}.\n\nProject style rules:\n${(style?.rules ?? []).map((r) => `- ${r}`).join("\n")}\n\nPR Context:\nTitle: ${pr.title}\nDescription: ${pr.description}\nSource: ${pr.sourceBranch}\nTarget: ${pr.targetBranch}\n\nLinked work items:\n${pr.linkedWorkItems.map((w) => `- [${w.id}] ${w.title} (${w.state})`).join("\n")}\n\nRelated PRs:\n${pr.relatedPullRequests.map((r) => `- #${r.id} ${r.title}`).join("\n")}\n\nChanged files:\n${pr.changedFiles.map((f) => `- ${f.path}`).join("\n")}\n\nFocus: bugs, regressions, style mismatch, maintainability, test gaps. Provide concrete fix suggestion.`;

  const findings = await reviewWithProvider({ provider, model: provider.model, prompt });

  return {
    summary: `Reviewed PR #${pullRequestId} with ${provider.provider}/${provider.model}. Found ${findings.length} issue(s).`,
    sources: {
      pullRequestId,
      linkedWorkItemIds: pr.linkedWorkItemIds,
      relatedPullRequestIds: pr.relatedPullRequests.map((x) => x.id),
    },
    findings,
  };
}
