import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { ProviderConfig, ReviewFinding } from "./types";

// Models that only support the completions endpoint (not chat)
const COMPLETION_ONLY_MODELS = [
  "code-davinci-002",
  "code-davinci-001",
  "code-cushman-001",
  "davinci",
  "curie",
  "babbage",
  "ada",
  /codex/i, // Match any codex model
];

function isCompletionOnlyModel(model: string): boolean {
  return COMPLETION_ONLY_MODELS.some(
    (pattern) =>
      pattern instanceof RegExp ? pattern.test(model) : pattern === model,
  );
}

export { isCompletionOnlyModel };

export async function discoverModels(provider: ProviderConfig): Promise<string[]> {
  if (provider.provider === "ollama") {
    const res = await fetch(`${provider.baseUrl ?? "http://localhost:11434"}/api/tags`);
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    return (json.models ?? []).map((x) => x.name);
  }

  if (provider.provider === "lmstudio") {
    const openai = new OpenAI({ apiKey: provider.apiKey ?? "lm-studio", baseURL: provider.baseUrl ?? "http://localhost:1234/v1" });
    const models = await openai.models.list();
    return models.data.map((x) => x.id);
  }

  if (provider.provider === "openai") {
    const openai = new OpenAI({ apiKey: provider.apiKey });
    const models = await openai.models.list();
    return models.data.map((x) => x.id);
  }

  if (provider.provider === "anthropic") {
    const client = new Anthropic({ apiKey: provider.apiKey });
    const models = await client.models.list();
    return models.data.map((x) => x.id);
  }

  const gemini = new GoogleGenAI({ apiKey: provider.apiKey });
  const models = await gemini.models.list();
  return models.page?.map((m) => m.name ?? "").filter(Boolean) ?? [];
}

const JSON_SYSTEM_PROMPT = `You are a senior staff engineer performing a rigorous, evidence-based pull-request code review.
Your readers are the PR author and reviewers; they need precise, actionable findings they can apply without further investigation.

OUTPUT CONTRACT
- Reply with EXACTLY ONE JSON object. No prose, no markdown, no code fences, no comments before or after.
- The JSON MUST conform to this schema:
  {
    "findings": [
      {
        "filePath":   "<path copied verbatim from the diff header>",
        "lineStart":  <integer line in the NEW (target-branch) file; use 0 only when truly unknown>,
        "severity":   "error" | "warning" | "info",
        "title":      "<<= 80 char headline>",
        "why":        "<concise explanation tying the issue to a concrete failure mode, <= 3 sentences>",
        "suggestion": "<plain-language fix instruction, <= 3 sentences>",
        "before":     "<the EXACT problematic code, copied verbatim from the diff with leading + - or space markers STRIPPED>",
        "after":      "<the EXACT replacement code, syntactically valid, ready to paste over 'before'>"
      }
    ]
  }
- If you find no qualifying issues, reply with exactly: {"findings":[]}

SEVERITY RUBRIC
- "error":   definite bug, crash, data loss, security vulnerability, broken contract, or regression.
- "warning": likely correctness, performance, concurrency, resource-leak, or maintainability problem; or a project style-rule violation.
- "info":    minor readability, naming, or non-blocking improvement.

QUALITY BAR
- Prefer fewer, higher-confidence findings over many speculative ones. False positives erode reviewer trust.
- Each finding must be self-contained and independently actionable: replacing 'before' with 'after' must resolve the issue without further edits elsewhere.
- Do not duplicate findings; collapse repeated patterns into a single finding citing the most representative location.
- Do not flag pure formatting, whitespace, or import-order noise.
- When uncertain, omit the finding.`;

export async function reviewWithProvider(input: {
  provider: ProviderConfig;
  model: string;
  prompt: string;
}): Promise<ReviewFinding[]> {
  const { provider, model, prompt } = input;

  if (provider.provider === "anthropic") {
    const client = new Anthropic({ apiKey: provider.apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0.1,
      system: JSON_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((c) => c.type === "text");
    return extractFindings(text && "text" in text ? text.text : "");
  }

  if (provider.provider === "gemini") {
    const client = new GoogleGenAI({ apiKey: provider.apiKey });
    const res = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: JSON_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });
    return extractFindings(res.text ?? "");
  }

  // OpenAI (cloud), Ollama, LM Studio — all via OpenAI-compatible completions
  const isCloud = provider.provider === "openai";
  const openai = new OpenAI({
    apiKey: provider.apiKey ?? "local",
    baseURL: isCloud
      ? undefined
      : provider.baseUrl ??
        (provider.provider === "ollama" ? "http://localhost:11434/v1" : "http://localhost:1234/v1"),
  });

  let findings: ReviewFinding[] = [];

  if (isCompletionOnlyModel(model)) {
    // Completion-only models (Codex, Davinci, etc.) use /v1/completions
    const completion = await openai.completions.create({
      model,
      prompt: `${JSON_SYSTEM_PROMPT}\n\n${prompt}`,
      max_tokens: 4096,
      temperature: 0.1,
    });
    findings = extractFindings(completion.choices[0]?.text ?? "");
  } else {
    // Chat models (GPT-3.5, GPT-4, etc.) use /v1/chat/completions
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 4096,
      temperature: 0.1,
      response_format: isCloud ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: JSON_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });
    findings = extractFindings(completion.choices[0]?.message?.content ?? "");
  }

  return findings;
}

/**
 * Robustly parses LLM output into ReviewFinding[].
 * Handles: markdown code fences, different key naming conventions,
 * top-level array vs {findings:[...]} wrapper, partial/null fields.
 */
function extractFindings(rawText: string): ReviewFinding[] {
  if (!rawText?.trim()) return [];

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  let text = rawText.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  // Find first { or [ to skip any preamble text
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let startIdx = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace <= firstBracket)) startIdx = firstBrace;
  else if (firstBracket !== -1) startIdx = firstBracket;
  if (startIdx > 0) text = text.slice(startIdx);

  try {
    const parsed = JSON.parse(text) as unknown;
    let raw: unknown[];

    if (Array.isArray(parsed)) {
      raw = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      // Accept any key that holds an array: findings, issues, results, comments, violations
      raw = (["findings", "issues", "results", "comments", "violations", "review"]
        .map((k) => obj[k])
        .find(Array.isArray) as unknown[] | undefined) ?? [];
    } else {
      raw = [];
    }

    return raw
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const f = item as Record<string, unknown>;

        // Normalize field name variants produced by different models
        const filePath = str(f.filePath ?? f.file_path ?? f.file ?? f.path ?? f.fileName ?? f.filename ?? "");
        const lineStart = num(f.lineStart ?? f.line_start ?? f.line ?? f.startLine ?? f.start_line ?? f.lineNumber ?? 0);
        const severity = normalizeSeverity(f.severity ?? f.level ?? f.priority ?? f.type ?? "warning");
        const title = str(f.title ?? f.name ?? f.issue ?? f.summary ?? f.category ?? "Code issue");
        const why = str(f.why ?? f.reason ?? f.message ?? f.description ?? f.explanation ?? f.detail ?? f.body ?? "");
        const suggestion = str(f.suggestion ?? f.fix ?? f.recommendation ?? f.how_to_fix ?? f.howToFix ?? f.resolution ?? "");
        const before = f.before != null ? str(f.before) : undefined;
        const after = f.after != null ? str(f.after) : undefined;

        return { filePath, lineStart, severity, title, why, suggestion, before, after };
      })
      .filter((f) => f.title || f.why); // drop completely empty findings
  } catch {
    return [];
  }
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSeverity(raw: unknown): ReviewFinding["severity"] {
  const s = str(raw).toLowerCase();
  if (["error", "critical", "fatal", "blocker", "high", "severe"].includes(s)) return "error";
  if (["info", "low", "note", "minor", "suggestion", "style"].includes(s)) return "info";
  return "warning";
}
