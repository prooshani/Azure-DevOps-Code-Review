import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadSettings, saveSettings } from "@/lib/settings-store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json((await loadSettings(user.id)) ?? null);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await request.json();
  const saved = await saveSettings(user.id, payload);
  return NextResponse.json(saved);
}
