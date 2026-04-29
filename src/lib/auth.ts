import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUsers, saveUsers } from "./user-store";
import type { StoredUser } from "./types";

const COOKIE_NAME = "adcr_session";
const SECRET = process.env.APP_SESSION_SECRET ?? "local-dev-secret-change-me";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [salt, hash] = encoded.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return timingSafeEqual(actual, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

function tokenForUser(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function parseToken(token: string | undefined): { userId: string } | null {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length < 3) {
    return null;
  }
  const userId = parts[0];
  const issuedAt = parts[1];
  const signature = parts.slice(2).join(".");
  const payload = `${userId}.${issuedAt}`;
  if (sign(payload) !== signature) {
    return null;
  }
  return { userId };
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const users = await getUsers();
  const normalizedEmail = input.email.trim().toLowerCase();
  if (users.some((u) => u.email === normalizedEmail)) {
    throw new Error("Email already registered.");
  }

  const user: StoredUser = {
    id: randomBytes(8).toString("hex"),
    name: input.name.trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await saveUsers(users);
  return user;
}

export async function loginUser(email: string, password: string): Promise<StoredUser> {
  const users = await getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find((u) => u.email === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid email or password.");
  }
  return user;
}

export function setSession(response: NextResponse, userId: string) {
  response.cookies.set(COOKIE_NAME, tokenForUser(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const parsed = parseToken(token);
  if (!parsed) {
    return null;
  }
  const users = await getUsers();
  return users.find((u) => u.id === parsed.userId) ?? null;
}
