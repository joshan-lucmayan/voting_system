import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import {
  getClientIp,
  loginFailures,
  loginPerIdentifier,
  loginPerIp,
} from "@/lib/rate-limit";

/**
 * A bcrypt hash of an unrelated random string. Compared against when the
 * School ID does not exist so that response timing does not reveal whether
 * an account exists. It is not a secret and matches no real account.
 */
const DUMMY_HASH = "$2b$12$Sa.FdNAG/EPOXfgFx4UMPuRxXn/AhTtZcL/VLRhH1Q0cqiErCWGyO";

/** Generic failure message for every authentication failure mode. */
const GENERIC_FAILURE = { error: "Invalid School ID or password." };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      schoolId?: string;
      password?: string;
    };

    const schoolId = (body.schoolId ?? "").trim();
    const password = body.password ?? "";

    if (!schoolId || !password) {
      return Response.json(
        { error: "School ID and password are required." },
        { status: 400 },
      );
    }

    const ip = getClientIp(request);

    // Rate limit: per-IP burst first, then per-(IP, identifier) window.
    const perIp = loginPerIp.check(`login:ip:${ip}`);
    if (!perIp.allowed) {
      return Response.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(perIp.retryAfterSeconds) } },
      );
    }

    const perId = loginPerIdentifier.check(`login:id:${ip}:${schoolId}`);
    if (!perId.allowed) {
      return Response.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(perId.retryAfterSeconds) } },
      );
    }

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
        passwordHash: profiles.passwordHash,
        active: profiles.active,
      })
      .from(profiles)
      .where(eq(profiles.schoolId, schoolId))
      .limit(1);

    // Always run a bcrypt comparison before responding so unknown School IDs
    // are indistinguishable from wrong passwords by timing or behavior.
    let passwordValid = false;
    if (user) {
      passwordValid = await verifyPassword(password, user.passwordHash);
    } else {
      await verifyPassword(password, DUMMY_HASH);
    }

    if (!user || !passwordValid || !user.active) {
      // Progressive delay after repeated failures for this identifier.
      loginFailures.record(`${ip}:${schoolId}`);
      const delayMs = loginFailures.delayMs(`${ip}:${schoolId}`);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return Response.json(GENERIC_FAILURE, { status: 401 });
    }

    loginFailures.reset(`${ip}:${schoolId}`);

    await createSession(user.id, user.role as "student" | "admin");

    return Response.json({
      ok: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        schoolId: user.schoolId,
        email: user.email,
        grade: user.grade,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return Response.json(
      { error: "An unexpected error occurred during login." },
      { status: 500 },
    );
  }
}
