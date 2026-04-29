import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/settings-store";

export async function GET() {
  return NextResponse.json((await loadSettings()) ?? null);
}

export async function POST(request: Request) {
  const payload = await request.json();
  const saved = await saveSettings(payload);
  return NextResponse.json(saved);
}
