import { cookies } from "next/headers";
import { eq, and, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions } from "@/db/schema";
import { createHash, randomBytes } from "node:crypto";

const SESSION_COOKIE = "scv_session";
const SESSION_MAX_AGE_HOURS = Number(process.env.SESSION_MAX_AGE_HOURS ?? 8);

/** Create a new session and set the cookie. */
export async function createSession(userId: string, role: "student" | "admin") {
  const rawToken = randomBytes(48).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_MAX_AGE_HOURS * 60 * 60 * 1000,
  );

  await db.insert(sessions).values({
    token: tokenHash,
    userId,
    role,
    expiresAt,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_HOURS * 60 * 60,
  });

  return tokenHash;
}

/** Read the current session from the cookie, returning null if invalid. */
export async function getSession() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const now = new Date();

  const [session] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      role: sessions.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(
      and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, now)),
    )
    .limit(1);

  return session ?? null;
}

/** Get the full profile for the current session user. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db
    .select({
      id: profiles.id,
      schoolId: profiles.schoolId,
      email: profiles.email,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      fullName: profiles.fullName,
      grade: profiles.grade,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.id, session.userId))
    .limit(1);

  return user ?? null;
}

/** Destroy the current session (logout). */
export async function destroySession() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await db.delete(sessions).where(eq(sessions.token, tokenHash));
  }
  store.delete(SESSION_COOKIE);
}

/** Validate the session and return the role, or throw. */
export async function requireAuth(expectedRole?: "student" | "admin") {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (expectedRole && user.role !== expectedRole) {
    throw new Response(
      JSON.stringify({ error: "Insufficient permissions" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return user;
}

/** Hash an IP address for logging (not identifying). */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** Clean up expired sessions. */
export async function cleanupExpiredSessions() {
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
}
