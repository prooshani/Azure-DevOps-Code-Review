import path from "node:path";
import { promises as fs } from "node:fs";
import type { StyleProfile } from "./types";

const TARGET_EXTENSIONS = new Set([".cs", ".ts", ".tsx", ".js", ".jsx"]);

async function collectFiles(root: string, out: string[]) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "bin" || e.name === "obj") {
      continue;
    }
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      await collectFiles(full, out);
      continue;
    }
    if (TARGET_EXTENSIONS.has(path.extname(e.name))) {
      out.push(full);
    }
  }
}

function detectRules(source: string): string[] {
  const rules: string[] = [];
  if (/if\s*\([^)]*\)\s*\n?\s*\{/.test(source)) {
    rules.push("Use braces for every if/else branch.");
  }
  if (/\}\s*\n\s*return\s+/.test(source)) {
    rules.push("Keep empty line before return after closing block.");
  }
  if (/public\s+(async\s+)?[A-Z]/.test(source)) {
    rules.push("Method names follow PascalCase.");
  }
  return rules;
}

export async function buildStyleProfile(workspaceRoots: string[]): Promise<StyleProfile> {
  const files: string[] = [];
  for (const root of workspaceRoots) {
    await collectFiles(root, files);
  }

  const aggregate = new Map<string, { count: number; file: string; sample: string }>();
  for (const file of files.slice(0, 400)) {
    const source = await fs.readFile(file, "utf8");
    const rules = detectRules(source);
    for (const rule of rules) {
      const current = aggregate.get(rule);
      if (current) {
        current.count += 1;
      } else {
        aggregate.set(rule, { count: 1, file, sample: source.split("\n").slice(0, 8).join("\n") });
      }
    }
  }

  const sorted = [...aggregate.entries()].sort((a, b) => b[1].count - a[1].count);
  return {
    generatedAt: new Date().toISOString(),
    rules: sorted.map(([rule]) => rule),
    evidence: sorted.map(([rule, info]) => ({ rule, file: info.file, sample: info.sample })),
  };
}

export async function saveStyleProfile(profilePath: string, profile: StyleProfile) {
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), "utf8");
}

export async function loadStyleProfile(profilePath: string): Promise<StyleProfile | null> {
  try {
    const raw = await fs.readFile(profilePath, "utf8");
    return JSON.parse(raw) as StyleProfile;
  } catch {
    return null;
  }
}
