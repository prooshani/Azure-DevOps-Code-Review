import { NextResponse } from "next/server";
import { discoverModels } from "@/lib/llm";

export async function POST(request: Request) {
  const provider = await request.json();
  const models = await discoverModels(provider);
  return NextResponse.json({ models });
}
