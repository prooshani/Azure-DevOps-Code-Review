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

  // Build diff content for each changed file (only files with actual diffs)
  const filesWithDiffs = pr.changedFiles.filter((f) => f.patch && f.patch.length > 0);
  const diffSections = filesWithDiffs
    .map(
      (f) => `
=== DIFF: ${f.path} ===
${f.patch}
=== END DIFF: ${f.path} ===`,
    )
    .join("\n");

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
    diffSections
      ? `=== ACTUAL CODE DIFFS (USE THIS TO VERIFY FINDINGS) ===\n${diffSections}\n=== END ACTUAL CODE DIFFS ===`
      : "NOTE: No diff content available. Review based on file paths only.",
    "",
    `Project style rules:\n${styleRules}`,
    "",
    "REVIEW INSTRUCTIONS:",
    "1. Read the actual diff content above carefully.",
    "2. Only report issues in the changed code shown in the diffs.",
    "3. For each finding, include the EXACT line number from the diff where the issue starts.",
    "   - Use the lineStart field to specify the starting line number in the original file.",
    "   - The line numbers in the diff correspond to line numbers in the actual file.",
    "4. The 'before' field must contain the EXACT code from the diff (without line numbers).",
    "5. The 'after' field must show the corrected version (without line numbers).",
    "6. Do NOT flag issues in code that was NOT changed in this PR.",
    "7. Do NOT assume code exists outside the diff — only review what's shown.",
    "8. If a style rule is already followed in the changed code, do NOT flag it.",
    "",
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
