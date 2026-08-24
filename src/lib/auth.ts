import { cookies } from "next/headers";
import { eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions } from "@/db/schema";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const SESSION_COOKIE = "scv_session";
const SESSION_MAX_AGE_HOURS = Number(process.env.SESSION_MAX_AGE_HOURS ?? 8);
const MAX_SESSIONS_PER_USER = 5;

let warnedMissingSecret = false;

/**
 * The HMAC signing key for the session cookie.
 * - Production: REQUIRED — the server refuses to issue/accept sessions
 *   without it (fail securely).
 * - Development: falls back to a random per-process key so local setups
 *   work without configuration; sessions reset on restart in that case.
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to at least 16 characters in production.",
    );
  }
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      "WARNING: SESSION_SECRET not set. Using an ephemeral development key " +
        "(sessions will be invalidated on restart).",
    );
  }
  return randomBytes(32).toString("hex");
}

/** HMAC-SHA256(rawToken, secret) as hex. */
function signToken(rawToken: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(rawToken)
    .digest("hex");
}

/**
 * Build the signed cookie value: `<rawToken>.<hmac>`.
 * Only SHA-256(rawToken) is ever stored server-side.
 */
export function buildSessionCookieValue(rawToken: string): string {
  return `${rawToken}.${signToken(rawToken)}`;
}

/**
 * Verify the signature of a cookie value using constant-time comparison
 * and return the raw token, or null if malformed/tampered.
 */
export function verifySessionCookieValue(cookieValue: string): string | null {
  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex <= 0) return null;

  const rawToken = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);

  // Raw tokens are always 96 hex chars (48 random bytes); signatures are
  // always 64 hex chars. Rejecting wrong lengths early also guarantees
  // equal-length buffers for timingSafeEqual.
  const expected = signToken(rawToken);
  if (
    rawToken.length !== 96 ||
    !/^[0-9a-f]+$/.test(rawToken) ||
    signature.length !== expected.length ||
    !/^[0-9a-f]+$/.test(signature)
  ) {
    return null;
  }

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return timingSafeEqual(a, b) ? rawToken : null;
}

function hashRawToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Create a new session, set the signed cookie, enforce the per-user cap. */
export async function createSession(userId: string, role: "student" | "admin") {
  const rawToken = randomBytes(48).toString("hex");
  const tokenHash = hashRawToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_HOURS * 60 * 60 * 1000);

  await db.insert(sessions).values({
    token: tokenHash,
    userId,
    role,
    expiresAt,
  });

  // Keep at most MAX_SESSIONS_PER_USER active sessions: evict oldest.
  await db.execute(sql`
    delete from sessions
    where user_id = ${userId}
      and id not in (
        select id from sessions
        where user_id = ${userId}
        order by created_at desc
        limit ${MAX_SESSIONS_PER_USER}
      )
  `);

  const store = await cookies();
  store.set(SESSION_COOKIE, buildSessionCookieValue(rawToken), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_HOURS * 60 * 60,
  });

  return tokenHash;
}

/**
 * Read the current session from the signed cookie.
 * - Rejects unsigned/tampered/malformed cookies without a DB lookup.
 * - Lazily deletes expired rows it encounters.
 */
export async function getSession() {
  const store = await cookies();
  const cookieValue = store.get(SESSION_COOKIE)?.value;
  if (!cookieValue) return null;

  const rawToken = verifySessionCookieValue(cookieValue);
  if (!rawToken) return null;

  const tokenHash = hashRawToken(rawToken);
  const now = new Date();

  const [session] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      role: sessions.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.token, tokenHash))
    .limit(1);

  if (!session) return null;

  if (session.expiresAt <= now) {
    // Lazy cleanup: remove the expired row so it cannot accumulate.
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  return session;
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
  const cookieValue = store.get(SESSION_COOKIE)?.value;
  if (cookieValue) {
    const rawToken = verifySessionCookieValue(cookieValue);
    if (rawToken) {
      await db.delete(sessions).where(eq(sessions.token, hashRawToken(rawToken)));
    }
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

/** Delete all expired sessions. Called by instrumentation daily. */
export async function cleanupExpiredSessions() {
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
}
