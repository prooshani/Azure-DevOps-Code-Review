import path from "node:path";
import { promises as fs } from "node:fs";
import type { ReviewResult, StoredUser } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const SETTINGS_DIR = path.join(DATA_DIR, "settings");
const REVIEWS_DIR = path.join(DATA_DIR, "reviews");

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.mkdir(REVIEWS_DIR, { recursive: true });
}

export async function getUsers(): Promise<StoredUser[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(USERS_PATH, "utf8");
    return JSON.parse(raw) as StoredUser[];
  } catch {
    return [];
  }
}

export async function saveUsers(users: StoredUser[]) {
  await ensureDirs();
  await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2), "utf8");
}

export function userSettingsPath(userId: string): string {
  return path.join(SETTINGS_DIR, `${userId}.json`);
}

export function userReviewsPath(userId: string): string {
  return path.join(REVIEWS_DIR, `${userId}.json`);
}

export async function getReviewHistory(userId: string): Promise<ReviewResult[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(userReviewsPath(userId), "utf8");
    return JSON.parse(raw) as ReviewResult[];
  } catch {
    return [];
  }
}

export async function appendReviewHistory(userId: string, entry: ReviewResult): Promise<void> {
  const history = await getReviewHistory(userId);
  history.unshift(entry);
  await fs.writeFile(userReviewsPath(userId), JSON.stringify(history.slice(0, 100), null, 2), "utf8");
}
