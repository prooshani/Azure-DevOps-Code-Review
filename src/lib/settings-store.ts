import { promises as fs } from "node:fs";
import { z } from "zod";
import type { ReviewSettings } from "./types";
import { userSettingsPath } from "./user-store";

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
      isActive: z.boolean().optional(),
    }),
  ),
  workspaceRoots: z.array(z.string().min(1)).default([]),
  styleProfilePath: z.string().optional(),
});

export async function loadSettings(userId: string): Promise<ReviewSettings | null> {
  try {
    const raw = await fs.readFile(userSettingsPath(userId), "utf8");
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveSettings(userId: string, settings: ReviewSettings): Promise<ReviewSettings> {
  const parsed = schema.parse(settings);
  await fs.writeFile(userSettingsPath(userId), JSON.stringify(parsed, null, 2), "utf8");
  return parsed;
}
