import path from "node:path";
import { fetchPullRequestContext } from "./azure-devops";
import { reviewWithProvider } from "./llm";
import { loadSettings } from "./settings-store";
import { loadStyleProfile } from "./style-profile";
import { appendReviewHistory } from "./user-store";
import type { ProviderConfig, ReviewResult } from "./types";

export async function runReview(userId: string, pullRequestId: number, overrideProvider?: ProviderConfig): Promise<ReviewResult> {
  const settings = await loadSettings(userId);
  if (!settings) {
    throw new Error("Settings missing. Save settings first.");
  }

  // Priority: 1) explicit override, 2) active provider, 3) first provider with model
  let provider: ProviderConfig | undefined;
  let providerLabel = "";

  if (overrideProvider?.model) {
    provider = overrideProvider;
    providerLabel = `${overrideProvider.provider}/${overrideProvider.model}`;
  } else {
    provider = settings.providers.find((x) => x.isActive) ?? settings.providers.find((x) => x.model);
    if (provider) {
      providerLabel = `${provider.provider}/${provider.model}`;
    }
  }

  if (!provider?.model) {
    throw new Error("No provider model configured. Please set a default provider in Settings > AI Providers, or select a provider below before running the review.");
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
    "",
    `Linked work items:\n${workItems}`,
    `Related PRs:\n${relatedPRs}`,
    "",
    "=== CHANGED FILES ===",
    "Review ONLY the code shown in the diffs below. DO NOT review, reference, or comment on any code NOT shown.",
    "DO NOT hallucinate, invent, or assume code that is not explicitly shown in the diff.",
    "",
    `${files}`,
    "=== END CHANGED FILES ===",
    "",
    diffSections
      ? `=== ACTUAL DIFFS (REVIEW ONLY THIS CODE) ===\n${diffSections}\n=== END ACTUAL DIFFS ===`
      : "NOTE: No diff content available.",
    "",
    `Project style rules:\n${styleRules}`,
    "",
    "=== STRICT REVIEW RULES (FOLLOW EXACTLY) ===",
    "",
    "1. SCOPE: Review ONLY the code shown in the diffs above.",
    "   - If a line is not in the diff, DO NOT mention it.",
    "   - If a method/class is not shown, DO NOT comment on it.",
    "   - DO NOT use your training data to guess what code exists.",
    "",
    "2. LINE NUMBERS: Use the @@ header in the diff to determine line numbers.",
    "   - Format: @@ -<start>,<count> +<start>,<count> @@",
    "   - The first number after '-' is the original file starting line.",
    "   - Count from that starting line to find the issue.",
    "   - If you cannot determine the line number, use lineStart: 0.",
    "",
    "3. FINDINGS: Only report issues you can SEE in the diff.",
    "   - If you cannot see the issue in the diff, DO NOT report it.",
    "   - DO NOT report missing documentation for methods not shown.",
    "   - DO NOT report missing error handling for methods not shown.",
    "   - DO NOT report security issues that require context outside the diff.",
    "",
    "4. CODE SNIPPETS: Quote ONLY the exact code shown in the diff.",
    "   - The 'before' field must match the diff EXACTLY.",
    "   - The 'after' field must be a reasonable fix for the shown code.",
    "   - If you cannot provide an accurate snippet, omit the finding.",
    "",
    "5. FALSE POSITIVES: It is better to miss a finding than to report a false one.",
    "   - If you are uncertain, DO NOT report it.",
    "   - If the issue requires context outside the diff, DO NOT report it.",
    "   - If the code snippet you would quote does not exist, DO NOT report it.",
    "",
    "=== EXAMPLE OF CORRECT BEHAVIOR ===",
    "✓ CORRECT: Diff shows 'if (x) Do();' → Report missing braces",
    "✗ WRONG: Diff shows 'public void Foo()' → Report missing XML docs (method not fully shown)",
    "✗ WRONG: Diff shows 'db.Query()' → Report missing try-catch (context outside diff)",
    "✗ WRONG: Report line 34 when diff only shows lines 12-15",
    "",
    "=== OUTPUT FORMAT ===",
    "Return ONLY valid JSON. No explanation, no markdown, no code fences.",
    "Schema: {\"findings\":[{\"filePath\":\"string\",\"lineStart\":number,\"severity\":\"error\"|\"warning\"|\"info\",\"title\":\"string\",\"why\":\"string\",\"suggestion\":\"string\",\"before\":\"string\",\"after\":\"string\"}]}",
    "",
    "REMEMBER: Only report what you can SEE. If you cannot see it, do not report it.",
  ]
    .filter(Boolean)
    .join("\n");

  const findings = await reviewWithProvider({ provider, model: provider.model, prompt });

  // Validate and filter findings - remove those with obviously wrong line numbers
  const validFindings = findings.filter((f) => {
    // Filter out findings with line numbers that are clearly wrong
    // (line 0 means unknown, which is acceptable, but very high numbers are suspicious)
    if (f.lineStart < 0 || f.lineStart > 10000) {
      return false; // Unreasonable line number
    }
    // Filter out findings where the code snippet doesn't match the file path
    // (this helps catch hallucinated findings)
    if (f.filePath && f.before) {
      // Basic validation: if the file path suggests a specific language,
      // check if the code snippet looks reasonable
      const ext = f.filePath.split(".").pop()?.toLowerCase();
      if (ext === "cs" || ext === "cshtml") {
        // C# files should have C#-like code
        const hasCSharpKeywords = /\b(if|else|for|while|class|public|private|void|return|new|this|base)\b/i.test(f.before);
        if (!hasCSharpKeywords && f.before.length > 10) {
          // Might be a hallucinated finding
          return false;
        }
      }
    }
    return true;
  });

  const result: ReviewResult = {
    id: `${pullRequestId}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    summary: `Reviewed PR #${pullRequestId} with ${providerLabel}. Found ${validFindings.length} issue(s).`,
    sources: {
      pullRequestId,
      linkedWorkItemIds: pr.linkedWorkItemIds,
      relatedPullRequestIds: pr.relatedPullRequests.map((x) => x.id),
    },
    findings: validFindings,
  };

  await appendReviewHistory(userId, result);
  return result;
}
