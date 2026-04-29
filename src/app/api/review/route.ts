import { NextResponse } from "next/server";
import { runReview } from "@/lib/review-engine";

export async function POST(request: Request) {
  const body = (await request.json()) as { pullRequestId: number };
  const result = await runReview(body.pullRequestId);
  return NextResponse.json(result);
}
