import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getReviewHistory } from "@/lib/user-store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const history = await getReviewHistory(user.id);
  return NextResponse.json({ history });
}
