import path from "node:path";
import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/settings-store";
import { buildStyleProfile, saveStyleProfile } from "@/lib/style-profile";

export async function POST() {
  const settings = await loadSettings();
  if (!settings) {
    return NextResponse.json({ error: "Save settings first." }, { status: 400 });
  }

  const profile = await buildStyleProfile(settings.workspaceRoots);
  const profilePath = settings.styleProfilePath ?? path.join(process.cwd(), "data", "style-profile.json");
  await saveStyleProfile(profilePath, profile);
  await saveSettings({ ...settings, styleProfilePath: profilePath });

  return NextResponse.json({ profilePath, profile });
}
