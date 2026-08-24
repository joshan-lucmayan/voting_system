import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { ensureDemoElection } from "@/lib/election-data";

export async function POST(request: NextRequest) {
  try {
    await ensureDemoElection();
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

    // Find user by school ID
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

    if (!user) {
      return Response.json(
        { error: "Invalid School ID or password." },
        { status: 401 },
      );
    }

    if (!user.active) {
      return Response.json(
        { error: "This account has been deactivated." },
        { status: 403 },
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return Response.json(
        { error: "Invalid School ID or password." },
        { status: 401 },
      );
    }

    // Create session
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
