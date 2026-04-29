import { NextResponse } from "next/server";
import { registerUser, setSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name: string; email: string; password: string };
    const user = await registerUser(body);
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
    setSession(res, user.id);
    return res;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Registration failed." }, { status: 400 });
  }
}
