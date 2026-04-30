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
    "",
    "=== CHANGED FILES IN THIS PR (REVIEW SCOPE) ===",
    "IMPORTANT: You MUST only produce findings for files listed below.",
    "DO NOT comment on, reference, or audit any file that is NOT in this list.",
    "If you notice a pattern that concerns other files outside this list, you MAY",
    "briefly mention it as context inside a finding's 'why' field, but the 'filePath'",
    "must still be one of the changed files.",
    `${files}`,
    "=== END OF CHANGED FILES ===",
    "",
    `Project style rules:\n${styleRules}`,
    "",
    "Review only the changed files listed above against the style rules and PR context.",
    "For each issue found, produce exactly one finding object with 'filePath' set to one",
    "of the changed files. Quote the problematic code snippet in 'before' and show the",
    "corrected version in 'after'. Be specific and actionable.",
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
