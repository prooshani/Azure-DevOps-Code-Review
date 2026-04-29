import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runReview } from "@/lib/review-engine";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) as { pullRequestId: number };
    const result = await runReview(user.id, body.pullRequestId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Review failed." }, { status: 500 });
  }
}
