import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadSettings, saveSettings } from "@/lib/settings-store";
import { buildStyleProfile, loadStyleProfile, saveStyleProfile } from "@/lib/style-profile";

function defaultProfilePath(userId: string): string {
  return path.join(process.cwd(), "data", "style-profiles", `${userId}.json`);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await loadSettings(user.id);
  const profilePath = settings?.styleProfilePath ?? defaultProfilePath(user.id);
  const profile = await loadStyleProfile(profilePath);
  return NextResponse.json({ profile, profilePath });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await loadSettings(user.id);
  if (!settings) {
    return NextResponse.json({ error: "Save settings first." }, { status: 400 });
  }

  const profile = await buildStyleProfile(settings.workspaceRoots);
  const profilePath = settings.styleProfilePath ?? defaultProfilePath(user.id);
  await saveStyleProfile(profilePath, profile);
  await saveSettings(user.id, { ...settings, styleProfilePath: profilePath });

  return NextResponse.json({ profilePath, profile });
}
