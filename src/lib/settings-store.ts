import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import type { ReviewSettings } from "./types";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

const schema = z.object({
  azure: z.object({
    pat: z.string().min(1),
    organizationUrl: z.string().optional(),
    selectedRepositories: z
      .array(
        z.object({
          organization: z.string().min(1),
          organizationUrl: z.string().min(1),
          project: z.string().min(1),
          repositoryId: z.string().min(1),
          repositoryName: z.string().min(1),
        }),
      )
      .default([]),
  }),
  providers: z.array(
    z.object({
      provider: z.enum(["openai", "anthropic", "gemini", "ollama", "lmstudio"]),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      model: z.string().optional(),
    }),
  ),
  workspaceRoots: z.array(z.string().min(1)).default([]),
  styleProfilePath: z.string().optional(),
});

async function ensureDataDir() {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
}

export async function loadSettings(): Promise<ReviewSettings | null> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveSettings(settings: ReviewSettings): Promise<ReviewSettings> {
  const parsed = schema.parse(settings);
  await ensureDataDir();
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(parsed, null, 2), "utf8");
  return parsed;
}
