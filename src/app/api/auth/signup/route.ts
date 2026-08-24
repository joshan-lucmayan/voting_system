import { NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import {
  isValidEmail,
  isValidPassword,
  isValidSchoolId,
  isValidName,
  sanitize,
} from "@/lib/validators";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      firstName?: string;
      lastName?: string;
      schoolId?: string;
      email?: string;
      password?: string;
      deviceFingerprint?: string;
    };

    const firstName = sanitize(body.firstName ?? "", 80);
    const lastName = sanitize(body.lastName ?? "", 80);
    const schoolId = sanitize(body.schoolId ?? "", 40);
    const email = sanitize(body.email ?? "", 255).toLowerCase();
    const password = body.password ?? "";

    // Validate inputs
    if (!isValidName(firstName)) {
      return Response.json(
        { error: "Please enter a valid first name." },
        { status: 400 },
      );
    }
    if (!isValidName(lastName)) {
      return Response.json(
        { error: "Please enter a valid last name." },
        { status: 400 },
      );
    }
    if (!isValidSchoolId(schoolId)) {
      return Response.json(
        {
          error:
            "Please enter a valid School ID (4-40 characters, letters, numbers, and hyphens).",
        },
        { status: 400 },
      );
    }
    if (!isValidEmail(email)) {
      return Response.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }
    if (!isValidPassword(password)) {
      return Response.json(
        {
          error:
            "Password must be between 6 and 128 characters.",
        },
        { status: 400 },
      );
    }

    // Check for duplicates
    const existing = await db
      .select({ id: profiles.id, schoolId: profiles.schoolId, email: profiles.email })
      .from(profiles)
      .where(or(eq(profiles.schoolId, schoolId), eq(profiles.email, email)))
      .limit(2);

    if (existing.some((e) => e.schoolId === schoolId)) {
      return Response.json(
        { error: "An account with this School ID already exists." },
        { status: 409 },
      );
    }
    if (existing.some((e) => e.email === email)) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    // Create account
    const passwordHash = await hashPassword(password);
    const fullName = `${firstName} ${lastName}`;

    const [newUser] = await db
      .insert(profiles)
      .values({
        schoolId,
        email,
        firstName,
        lastName,
        fullName,
        passwordHash,
        role: "student",
      })
      .returning({ id: profiles.id, role: profiles.role });

    // Create session
    await createSession(newUser.id, newUser.role as "student");

    return Response.json({
      ok: true,
      user: {
        id: newUser.id,
        firstName,
        lastName,
        schoolId,
        email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    if (error instanceof Response) return error;
    return Response.json(
      { error: "An unexpected error occurred during signup." },
      { status: 500 },
    );
  }
}
