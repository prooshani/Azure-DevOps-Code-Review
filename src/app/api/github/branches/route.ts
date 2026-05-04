import { NextResponse } from "next/server";
import { listGithubBranches } from "@/lib/github";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; repoFullName?: string };
    const token = body.token?.trim();
    const repoFullName = body.repoFullName?.trim();
    if (!token) return NextResponse.json({ error: "GitHub token required." }, { status: 400 });
    if (!repoFullName) return NextResponse.json({ error: "Repository required." }, { status: 400 });

    const branches = await listGithubBranches(token, repoFullName);
    return NextResponse.json({ branches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list GitHub branches.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}