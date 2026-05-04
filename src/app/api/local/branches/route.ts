import { NextResponse } from "next/server";
import { listLocalBranches } from "@/lib/local-git";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rootPath?: string };
    const rootPath = body.rootPath?.trim();
    if (!rootPath) return NextResponse.json({ error: "Repository path required." }, { status: 400 });

    const branches = await listLocalBranches(rootPath);
    return NextResponse.json({ branches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list local branches.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}