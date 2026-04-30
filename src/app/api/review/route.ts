import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runReview } from "@/lib/review-engine";
import type { ProviderConfig } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) as { pullRequestId: number; provider?: ProviderConfig };
    const result = await runReview(user.id, body.pullRequestId, body.provider);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Review failed." }, { status: 500 });
  }
}
