import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { ProviderConfig, ReviewFinding } from "./types";

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

export async function reviewWithProvider(input: {
  provider: ProviderConfig;
  model: string;
  prompt: string;
}): Promise<ReviewFinding[]> {
  const { provider, model, prompt } = input;

  if (provider.provider === "anthropic") {
    const client = new Anthropic({ apiKey: provider.apiKey });
    const res = await client.messages.create({ model, max_tokens: 1800, messages: [{ role: "user", content: prompt }] });
    const text = res.content.find((c) => c.type === "text");
    return extractFindings(text && "text" in text ? text.text : "");
  }

  if (provider.provider === "gemini") {
    const client = new GoogleGenAI({ apiKey: provider.apiKey });
    const res = await client.models.generateContent({ model, contents: prompt });
    return extractFindings(res.text ?? "");
  }

  const openai = new OpenAI({
    apiKey: provider.apiKey ?? "local",
    baseURL:
      provider.provider === "openai"
        ? undefined
        : provider.baseUrl ?? (provider.provider === "ollama" ? "http://localhost:11434/v1" : "http://localhost:1234/v1"),
  });

  const completion = await openai.responses.create({
    model,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "review_findings",
        schema: {
          type: "object",
          properties: {
            findings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  filePath: { type: "string" },
                  lineStart: { type: "number" },
                  severity: { type: "string", enum: ["info", "warning", "error"] },
                  title: { type: "string" },
                  why: { type: "string" },
                  suggestion: { type: "string" },
                  before: { type: "string" },
                  after: { type: "string" },
                },
                required: ["filePath", "lineStart", "severity", "title", "why", "suggestion"],
              },
            },
          },
          required: ["findings"],
          additionalProperties: false,
        },
      },
    },
  });

  const text = completion.output_text;
  return extractFindings(text);
}

function extractFindings(text: string): ReviewFinding[] {
  try {
    const parsed = JSON.parse(text) as { findings?: ReviewFinding[] };
    return parsed.findings ?? [];
  } catch {
    return [];
  }
}
