import { NextResponse } from "next/server";
import { discoverModels } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const provider = await request.json();
    const models = await discoverModels(provider);
    if (!models.length) {
      return NextResponse.json({ ok: false, message: "Connected but no models returned." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: `Connection successful. ${models.length} model(s) available.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

