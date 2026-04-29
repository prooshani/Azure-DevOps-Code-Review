import { NextResponse } from "next/server";
import { loginUser, setSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email: string; password: string };
    const user = await loginUser(body.email, body.password);
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
    setSession(res, user.id);
    return res;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Login failed." }, { status: 401 });
  }
}
