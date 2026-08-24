import { NextRequest } from "next/server";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, electionVoters, elections, profiles } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { isValidSchoolId } from "@/lib/validators";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_BULK = 500;

/**
 * Voter administration. Responses contain ONLY eligibility/turnout data —
 * never ballot ids, receipt codes or selections. The ballots table has no
 * voter identity by design and no query in this file may join to it.
 */

async function loadElection(electionId: string) {
  const [election] = await db
    .select({ id: elections.id, state: elections.state })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);
  return election ?? null;
}

/** GET: paginated, searchable voter roster for an election. */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get("electionId")?.trim() ?? "";
    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

    if (!electionId) {
      return Response.json(
        { error: "Election ID is required." },
        { status: 400 },
      );
    }
    if (status && !["eligible", "voted", "ineligible"].includes(status)) {
      return Response.json(
        { error: "status must be eligible, voted, or ineligible." },
        { status: 400 },
      );
    }

    const conditions = [eq(electionVoters.electionId, electionId)];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(profiles.schoolId, pattern),
          ilike(profiles.fullName, pattern),
        )!,
      );
    }
    if (status === "eligible") {
      conditions.push(eq(electionVoters.eligible, true));
      conditions.push(sql`${electionVoters.votedAt} is null`);
    } else if (status === "voted") {
      conditions.push(sql`${electionVoters.votedAt} is not null`);
    } else if (status === "ineligible") {
      conditions.push(eq(electionVoters.eligible, false));
      conditions.push(sql`${electionVoters.votedAt} is null`);
    }
    const where = and(...conditions);

    const [{ total }] = await db
      .select({ total: count() })
      .from(electionVoters)
      .innerJoin(profiles, eq(electionVoters.voterId, profiles.id))
      .where(where);

    const rows = await db
      .select({
        voterId: profiles.id,
        schoolId: profiles.schoolId,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        grade: profiles.grade,
        eligible: electionVoters.eligible,
        votedAt: electionVoters.votedAt,
      })
      .from(electionVoters)
      .innerJoin(profiles, eq(electionVoters.voterId, profiles.id))
      .where(where)
      .orderBy(asc(profiles.schoolId), desc(electionVoters.votedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    return Response.json({
      voters: rows.map((r) => ({
        voterId: r.voterId,
        schoolId: r.schoolId,
        name: `${r.firstName} ${r.lastName}`.trim(),
        grade: r.grade ?? "",
        eligible: r.eligible,
        votedAt: r.votedAt,
      })),
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: Number(total),
        totalPages: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)),
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Voter list error:", error);
    return Response.json(
      { error: "Failed to fetch voters." },
      { status: 500 },
    );
  }
}

/** POST: bulk-enroll students by School ID (set-based, idempotent). */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const body = (await request.json()) as Record<string, unknown>;

    const electionId =
      typeof body.electionId === "string" ? body.electionId.trim() : "";
    const rawIds = Array.isArray(body.schoolIds) ? body.schoolIds : [];

    if (!electionId) {
      return Response.json(
        { error: "Election ID is required." },
        { status: 400 },
      );
    }
    if (rawIds.length === 0 || rawIds.length > MAX_BULK) {
      return Response.json(
        { error: `Provide between 1 and ${MAX_BULK} School IDs.` },
        { status: 400 },
      );
    }

    // Normalize + dedupe while preserving order.
    const schoolIds = [
      ...new Set(
        rawIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];

    const election = await loadElection(electionId);
    if (!election) {
      return Response.json({ error: "Election not found." }, { status: 404 });
    }
    if (election.state === "published") {
      return Response.json(
        { error: "A published election can no longer be changed." },
        { status: 409 },
      );
    }

    // Classify every requested ID against the profile table in one query.
    const matchedProfiles = schoolIds.length
      ? await db
          .select({
            schoolId: profiles.schoolId,
            role: profiles.role,
            active: profiles.active,
            id: profiles.id,
          })
          .from(profiles)
          .where(inArray(profiles.schoolId, schoolIds))
      : [];

    const bySchoolId = new Map(matchedProfiles.map((p) => [p.schoolId, p]));

    const results = schoolIds.map((schoolId) => {
      const profile = bySchoolId.get(schoolId);
      if (!isValidSchoolId(schoolId)) {
        return { schoolId, status: "invalid" as const };
      }
      if (!profile) return { schoolId, status: "not_found" as const };
      if (!profile.active) return { schoolId, status: "inactive" as const };
      if (profile.role !== "student")
        return { schoolId, status: "not_student" as const };
      return { schoolId, status: "enrollable" as const, profileId: profile.id };
    });

    const enrollable = results.filter(
      (r): r is { schoolId: string; status: "enrollable"; profileId: string } =>
        r.status === "enrollable",
    );

    // One set-based insert; RETURNING tells us which rows were new.
    let insertedProfileIds = new Set<string>();
    if (enrollable.length > 0) {
      const inserted = await db
        .insert(electionVoters)
        .values(
          enrollable.map((r) => ({ electionId, voterId: r.profileId })),
        )
        .onConflictDoNothing()
        .returning({ voterId: electionVoters.voterId });
      insertedProfileIds = new Set(inserted.map((i) => i.voterId));
    }

    const finalResults = results.map(({ schoolId, status }) => {
      if (status !== "enrollable") return { schoolId, status };
      const profileId = enrollable.find((e) => e.schoolId === schoolId)!
        .profileId;
      return {
        schoolId,
        status: insertedProfileIds.has(profileId)
          ? ("enrolled" as const)
          : ("already_enrolled" as const),
      };
    });

    const summary = finalResults.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    if (insertedProfileIds.size > 0) {
      await db.insert(auditLogs).values({
        electionId,
        actorId: admin.id,
        action: "update",
        entityType: "election_voters",
        entityId: null,
        metadata: { manuallyEnrolled: insertedProfileIds.size },
      });
    }

    return Response.json({ results: finalResults, summary });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Bulk enrollment error:", error);
    return Response.json(
      { error: "Failed to enroll voters." },
      { status: 500 },
    );
  }
}

/** DELETE: mark an unused voter ineligible (history preserved). */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get("electionId")?.trim() ?? "";
    const voterId = searchParams.get("voterId")?.trim() ?? "";

    if (!electionId || !voterId) {
      return Response.json(
        { error: "Election ID and voter ID are required." },
        { status: 400 },
      );
    }

    const election = await loadElection(electionId);
    if (!election) {
      return Response.json({ error: "Election not found." }, { status: 404 });
    }
    if (election.state === "published") {
      return Response.json(
        { error: "A published election can no longer be changed." },
        { status: 409 },
      );
    }

    const [voter] = await db
      .select()
      .from(electionVoters)
      .where(
        and(
          eq(electionVoters.electionId, electionId),
          eq(electionVoters.voterId, voterId),
        ),
      )
      .limit(1);

    if (!voter) {
      return Response.json({ error: "Voter not found." }, { status: 404 });
    }
    if (voter.votedAt) {
      return Response.json(
        { error: "This voter has already voted; their record cannot be changed." },
        { status: 409 },
      );
    }
    if (!voter.eligible) {
      return Response.json(
        { error: "This voter is already ineligible." },
        { status: 409 },
      );
    }

    await db
      .update(electionVoters)
      .set({ eligible: false })
      .where(eq(electionVoters.id, voter.id));

    await db.insert(auditLogs).values({
      electionId,
      actorId: admin.id,
      action: "update",
      entityType: "election_voter",
      entityId: voter.id,
      metadata: { markedIneligible: true },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Mark ineligible error:", error);
    return Response.json(
      { error: "Failed to update voter." },
      { status: 500 },
    );
  }
}
