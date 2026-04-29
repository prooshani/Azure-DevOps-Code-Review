import { NextResponse } from "next/server";
import { listAccessibleRepositories } from "@/lib/azure-devops";

function statusFromMessage(message: string): number {
  if (message.includes("(401)")) {
    return 401;
  }
  if (message.includes("(403)")) {
    return 403;
  }
  if (message.includes("(400)")) {
    return 400;
  }
  return 500;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pat?: string; organizationUrl?: string };
    if (!body.pat?.trim()) {
      return NextResponse.json({ error: "PAT required." }, { status: 400 });
    }

    const repos = await listAccessibleRepositories(body.pat.trim(), body.organizationUrl?.trim() || undefined);
    return NextResponse.json({ repos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository discovery failed.";
    return NextResponse.json({ error: message }, { status: statusFromMessage(message) });
  }
}

