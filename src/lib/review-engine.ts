import path from "node:path";
import { fetchPullRequestContext } from "./azure-devops";
import { reviewWithProvider } from "./llm";
import { loadSettings } from "./settings-store";
import { loadStyleProfile } from "./style-profile";
import { appendReviewHistory } from "./user-store";
import type { ReviewResult } from "./types";

export async function runReview(userId: string, pullRequestId: number): Promise<ReviewResult> {
  const settings = await loadSettings(userId);
  if (!settings) {
    throw new Error("Settings missing. Save settings first.");
  }

  const provider = settings.providers.find((x) => x.model);
  if (!provider?.model) {
    throw new Error("No provider model configured.");
  }

  const pr = await fetchPullRequestContext(settings, pullRequestId);
  const profilePath = settings.styleProfilePath ?? path.join(process.cwd(), "data", "style-profiles", `${userId}.json`);
  const style = await loadStyleProfile(profilePath);

  const styleRules = (style?.rules ?? []).map((r) => `- ${r}`).join("\n") || "- Follow team coding conventions";
  const workItems = pr.linkedWorkItems.length
    ? pr.linkedWorkItems.map((w) => `  [#${w.id}] ${w.title} (${w.state ?? "Active"})`).join("\n")
    : "  (none)";
  const relatedPRs = pr.relatedPullRequests.length
    ? pr.relatedPullRequests.map((r) => `  #${r.id} – ${r.title}`).join("\n")
    : "  (none)";
  const files = pr.changedFiles.map((f) => `  ${f.path}`).join("\n") || "  (unknown)";

  const prompt = [
    `PR #${pr.pullRequestId}: "${pr.title}"`,
    `Branch: ${pr.sourceBranch ?? "?"} → ${pr.targetBranch ?? "?"}`,
    pr.description ? `Description: ${pr.description.slice(0, 600)}` : "",
    "",
    `Linked work items:\n${workItems}`,
    `Related PRs:\n${relatedPRs}`,
    `Changed files:\n${files}`,
    "",
    `Project style rules:\n${styleRules}`,
    "",
    "Review the PR thoroughly. For each issue found produce one finding object.",
    "Use filePath matching one of the changed files listed above.",
    "Be specific: quote relevant code in 'before' and show corrected code in 'after'.",
  ]
    .filter(Boolean)
    .join("\n");

  const findings = await reviewWithProvider({ provider, model: provider.model, prompt });

  const result: ReviewResult = {
    id: `${pullRequestId}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    summary: `Reviewed PR #${pullRequestId} with ${provider.provider}/${provider.model}. Found ${findings.length} issue(s).`,
    sources: {
      pullRequestId,
      linkedWorkItemIds: pr.linkedWorkItemIds,
      relatedPullRequestIds: pr.relatedPullRequests.map((x) => x.id),
    },
    findings,
  };

  await appendReviewHistory(userId, result);
  return result;
}
