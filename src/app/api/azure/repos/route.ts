import { NextResponse } from "next/server";
import { listAccessibleRepositories } from "@/lib/azure-devops";

export async function POST(request: Request) {
  const body = (await request.json()) as { pat: string };
  const repos = await listAccessibleRepositories(body.pat);
  return NextResponse.json({ repos });
}
