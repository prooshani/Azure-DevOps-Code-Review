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
    ? pr.relatedPullRequests.map((r) => `  #${r.id} - ${r.title}`).join("\n")
    : "  (none)";
  const files = pr.changedFiles.map((f) => `  ${f.path}`).join("\n") || "  (unknown)";

  // Per-file unified diffs. Only include files where Azure DevOps actually returned a patch.
  const filesWithDiffs = pr.changedFiles.filter((f) => f.patch && f.patch.length > 0);
  const diffSections = filesWithDiffs
    .map(
      (f) => `\n=== DIFF: ${f.path} ===\n${f.patch}\n=== END DIFF: ${f.path} ===`,
    )
    .join("\n");

  const prompt = [
    "PULL REQUEST UNDER REVIEW",
    "=========================",
    `PR #${pr.pullRequestId}: "${pr.title}"`,
    `Branch: ${pr.sourceBranch ?? "?"} -> ${pr.targetBranch ?? "?"}`,
    pr.description ? `\nAuthor's description:\n${pr.description.trim()}` : "",
    "",
    "LINKED WORK ITEMS (the intent of this change)",
    workItems,
    "",
    "RELATED PULL REQUESTS",
    relatedPRs,
    "",
    "PROJECT STYLE RULES (treat violations as at least \"warning\")",
    styleRules,
    "",
    "FILES CHANGED IN THIS PR",
    files,
    "",
    "UNIFIED DIFFS",
    "=============",
    "These hunks are the ONLY source of truth. Review nothing else; do not infer code outside them.",
    diffSections || "(no diff content was returned by the server)",
    "",
    "HOW TO READ EACH HUNK",
    "- Each hunk header has the form:  @@ -<oldStart>,<oldLen> +<newStart>,<newLen> @@",
    "- `+<newStart>` is the line number, IN THE NEW (target-branch) FILE, where the hunk begins.",
    "- Lines starting with `+` are ADDED by this PR. Lines starting with `-` are REMOVED. Lines starting with a space are unchanged context.",
    "- To compute `lineStart`: start a counter at <newStart>; walk the hunk top-down, incrementing the counter for every `+` and ` ` line (NEVER for `-` lines); report the counter value at the FIRST line that contains the issue.",
    "- Use the file path from the `=== DIFF: <path> ===` banner verbatim as `filePath`.",
    "",
    "WHAT TO LOOK FOR",
    "Review across ALL of the dimensions below, but only report issues you can anchor to a concrete added or context line in the diff above.",
    "1.  Correctness & bugs - null/undefined deref, off-by-one, wrong operator, swapped arguments, wrong type, lost return, broken control flow, wrong async/await usage, incorrect equality.",
    "2.  Security - injection (SQL/HTML/shell/LDAP), deserialization, XSS, SSRF, path traversal, hardcoded secrets, unsafe `eval`/`exec`, broken auth/authz, weak crypto, unsafe randomness, missing input validation at trust boundaries.",
    "3.  Concurrency & async - data races, missing locks, unawaited promises/tasks, fire-and-forget without error handling, shared mutable state, deadlock risk.",
    "4.  Resource management - files/streams/handles/connections not closed, missing `using`/`with`/`defer`/`finally`, unbounded retries, memory leaks via captured references.",
    "5.  Performance - quadratic loops over potentially large inputs, redundant queries, N+1 patterns, sync I/O on hot paths, missing pagination/limits, unnecessary allocations in tight loops.",
    "6.  API & contract changes - breaking signature changes, removed/renamed public fields, changed enum values, response-shape regressions, changes that silently break existing callers.",
    "7.  Error handling - swallowed exceptions, generic catches that mask bugs, lost stack traces, error messages leaking internals, missing handling at trust boundaries.",
    "8.  Tests - assertions that don't actually assert, time/random/network flakiness introduced in this PR, only-happy-path coverage for non-trivial logic added in this PR.",
    "9.  Maintainability & structure - duplicated logic shipped in this PR, dead code added in this PR, name/intent mismatch, deeply nested branches that obscure correctness, leaky abstractions.",
    "10. Style-rule violations - any rule from PROJECT STYLE RULES above that this diff breaks.",
    "11. Intent mismatch - code changes that don't match the linked work item or the PR title/description (e.g. work item says \"fix login bug\" but code touches unrelated billing logic).",
    "",
    "WRITING `before` AND `after` (this is the most common source of bad reviews - read carefully)",
    "- `before`: copy the EXACT problematic code straight from the diff. STRIP the leading `+`, `-`, or space diff marker. Preserve indentation and language. Do not paraphrase.",
    "- `after`: provide the EXACT replacement code that the author should paste over `before`. It must be syntactically valid in the file's language and must contain NO placeholders like `// ...`, `TODO`, or `<your code here>`.",
    "- Keep both snippets MINIMAL - usually one expression, statement, or small block. Do not include surrounding unchanged lines.",
    "- `before` and `after` must be different. If they are equal, omit the finding.",
    "",
    "DO NOT REPORT",
    "- Anything whose existence depends on code NOT shown in the diff.",
    "- \"Missing documentation/tests/error handling\" for symbols whose body is not visible here.",
    "- Vague suggestions (\"consider\", \"might want to\", \"could be cleaner\") - if you cannot point to a concrete failure mode, omit it.",
    "- Pure whitespace, line-ending, or import-ordering noise.",
    "- Issues you cannot anchor to a specific line that appears in the diff above.",
    "",
    "EXAMPLE - CORRECT FINDING",
    "Diff hunk in `src/auth/token.ts`:",
    "    @@ -22,3 +22,5 @@",
    "     export function verify(token: string) {",
    "    +  const decoded = jwt.decode(token);",
    "    +  return decoded.userId;",
    "     }",
    "Output:",
    "{\"findings\":[{\"filePath\":\"src/auth/token.ts\",\"lineStart\":23,\"severity\":\"error\",\"title\":\"JWT decoded without signature verification\",\"why\":\"`jwt.decode` only parses the token; it does not verify the signature. An attacker can forge any payload, so trusting `decoded.userId` here authenticates arbitrary users.\",\"suggestion\":\"Use `jwt.verify` with the signing secret and pin the algorithm.\",\"before\":\"const decoded = jwt.decode(token);\\nreturn decoded.userId;\",\"after\":\"const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as { userId: string };\\nreturn decoded.userId;\"}]}",
    "",
    "EXAMPLE - DO NOT REPORT",
    "Diff hunk in `src/utils/log.ts`:",
    "    @@ -1,2 +1,3 @@",
    "     export function log(msg: string) {",
    "    +  console.log(msg);",
    "     }",
    "Do NOT flag \"missing log levels\" or \"should use a logger library\" - that is taste, not a defect.",
    "",
    "FINAL OUTPUT",
    "Return EXACTLY ONE JSON object matching the schema in the system message. No markdown, no code fences, no commentary. If you find no qualifying issues, return: {\"findings\":[]}",
  ].join("\n");

  const findings = await reviewWithProvider({ provider, model: provider.model, prompt });

  // Build a per-file lookup of patch text with diff markers stripped, so we can
  // reject findings whose `before` quote does not actually appear in the diff.
  const patchHaystackByPath = new Map<string, string>();
  for (const f of pr.changedFiles) {
    if (!f.patch) continue;
    const stripped = f.patch
      .split("\n")
      .filter((l) => !l.startsWith("---") && !l.startsWith("+++") && !l.startsWith("@@"))
      .map((l) => (l.length > 0 && (l[0] === "+" || l[0] === "-" || l[0] === " ") ? l.slice(1) : l))
      .join("\n");
    patchHaystackByPath.set(f.path, normalizeWhitespace(stripped));
  }

  const validFindings = findings.filter((f) => {
    if (f.lineStart < 0 || f.lineStart > 1_000_000) return false;
    if (!f.title?.trim() && !f.why?.trim()) return false;
    // Reject self-trivial fixes where before == after.
    if (f.before && f.after && normalizeWhitespace(f.before) === normalizeWhitespace(f.after)) {
      return false;
    }
    // Anti-hallucination: if we have the file's diff and `before` is non-trivial,
    // require that `before` actually appears (whitespace-insensitive) in the diff.
    if (f.before && f.filePath) {
      const haystack = patchHaystackByPath.get(f.filePath);
      if (haystack) {
        const needle = normalizeWhitespace(f.before);
        if (needle.length > 8 && !haystack.includes(needle)) {
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

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
