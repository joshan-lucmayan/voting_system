import { NextRequest } from "next/server";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  elections,
  electionPositions,
  candidates,
  electionVoters,
  ballots,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import {
  ElectionTransitionError,
  canTransition,
  transitionElection,
  type ElectionState,
} from "@/lib/elections";

const VALID_STATES = new Set<string>([
  "draft",
  "scheduled",
  "open",
  "closed",
  "published",
]);

export const dynamic = "force-dynamic";

/** Parse a client datetime string; returns null when invalid. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

/** GET: List all elections with stats */
export async function GET() {
  try {
    await requireAuth("admin");

    const allElections = await db.select().from(elections);
    const electionIds = allElections.map((e) => e.id);

    if (electionIds.length === 0) {
      return Response.json({ elections: [] });
    }

    // Batch aggregate queries for all elections at once
    const [positionCounts, candidateCounts, voterCounts, ballotCounts] =
      await Promise.all([
        // Position counts per election
        db
          .select({
            electionId: electionPositions.electionId,
            count: sql<number>`count(*)::int`,
          })
          .from(electionPositions)
          .where(inArray(electionPositions.electionId, electionIds))
          .groupBy(electionPositions.electionId),
        // Approved candidate counts per election
        db
          .select({
            electionId: electionPositions.electionId,
            count: sql<number>`count(*)::int`,
          })
          .from(candidates)
          .innerJoin(
            electionPositions,
            eq(candidates.positionId, electionPositions.id),
          )
          .where(
            and(
              inArray(electionPositions.electionId, electionIds),
              eq(candidates.approved, true),
              eq(candidates.archived, false),
            ),
          )
          .groupBy(electionPositions.electionId),
        // Eligible voter counts per election
        db
          .select({
            electionId: electionVoters.electionId,
            count: sql<number>`count(*)::int`,
          })
          .from(electionVoters)
          .where(
            and(
              inArray(electionVoters.electionId, electionIds),
              eq(electionVoters.eligible, true),
            ),
          )
          .groupBy(electionVoters.electionId),
        // Ballot counts per election
        db
          .select({
            electionId: ballots.electionId,
            count: sql<number>`count(*)::int`,
          })
          .from(ballots)
          .where(inArray(ballots.electionId, electionIds))
          .groupBy(ballots.electionId),
      ]);

    // Build lookup maps for O(1) access
    const posMap = new Map(positionCounts.map((r) => [r.electionId, r.count]));
    const candMap = new Map(candidateCounts.map((r) => [r.electionId, r.count]));
    const voterMap = new Map(voterCounts.map((r) => [r.electionId, r.count]));
    const ballotMap = new Map(ballotCounts.map((r) => [r.electionId, r.count]));

    const enriched = allElections.map((election) => ({
      ...election,
      positionCount: posMap.get(election.id) ?? 0,
      candidateCount: candMap.get(election.id) ?? 0,
      eligibleVoters: voterMap.get(election.id) ?? 0,
      votesCast: ballotMap.get(election.id) ?? 0,
    }));

    return Response.json({ elections: enriched });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin elections error:", error);
    return Response.json(
      { error: "Failed to fetch elections." },
      { status: 500 },
    );
  }
}

/** POST: Create a new election (draft by default). */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const body = (await request.json()) as Record<string, unknown>;

    // Strict field extraction — unknown properties are ignored.
    const title = asTrimmedString(body.title);
    const schoolYear = asTrimmedString(body.schoolYear);
    const description = asTrimmedString(body.description);
    const startsAt = parseDate(body.startsAt);
    const endsAt = parseDate(body.endsAt);
    const requestedState =
      body.state === undefined ? "draft" : asTrimmedString(body.state);

    const errors: string[] = [];
    if (!title || title.length < 3 || title.length > 200)
      errors.push("Title is required (3-200 characters).");
    if (!schoolYear || schoolYear.length > 20)
      errors.push("School year is required (max 20 characters).");
    if (!startsAt) errors.push("A valid start time is required.");
    if (!endsAt) errors.push("A valid end time is required.");
    if (startsAt && endsAt && endsAt <= startsAt)
      errors.push("The end time must be after the start time.");

    const validInitialStates = new Set(["draft", "scheduled"]);
    if (
      requestedState !== null &&
      typeof requestedState === "string" &&
      !validInitialStates.has(requestedState)
    ) {
      errors.push("New elections may only start as draft or scheduled.");
    }

    if (errors.length > 0 || !title || !schoolYear || !startsAt || !endsAt) {
      return Response.json({ error: errors[0] ?? "Invalid input." }, { status: 400 });
    }

    const initialState = (requestedState ?? "draft") as "draft" | "scheduled";

    const [election] = await db
      .insert(elections)
      .values({
        title,
        schoolYear,
        description: description ?? "",
        startsAt,
        endsAt,
        state: initialState,
        createdBy: admin.id,
      })
      .returning();

    await db.insert(auditLogs).values({
      electionId: election.id,
      actorId: admin.id,
      action: "create",
      entityType: "election",
      entityId: election.id,
      metadata: { title, initialState },
    });

    return Response.json({ election });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create election error:", error);
    return Response.json(
      { error: "Failed to create election." },
      { status: 500 },
    );
  }
}

/**
 * PATCH: Update election fields and/or lifecycle state.
 *
 * - Field edits are allowlisted per state:
 *     draft     → title, schoolYear, description, startsAt, endsAt
 *     scheduled → startsAt, endsAt
 *     open/closed → no configuration edits
 *     published → immutable
 * - showLiveResults is a visibility setting allowed in every
 *   non-published state.
 * - State changes MUST go through transitionElection() — clients cannot
 *   bypass the lifecycle matrix.
 */
const FIELD_EDITS_BY_STATE: Record<string, string[]> = {
  draft: ["title", "schoolYear", "description", "startsAt", "endsAt"],
  scheduled: ["startsAt", "endsAt"],
  open: [],
  closed: [],
  published: [],
};

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const body = (await request.json()) as Record<string, unknown>;

    const electionId = asTrimmedString(body.electionId);
    if (!electionId) {
      return Response.json(
        { error: "Election ID is required." },
        { status: 400 },
      );
    }

    const [election] = await db
      .select()
      .from(elections)
      .where(eq(elections.id, electionId))
      .limit(1);
    if (!election) {
      return Response.json({ error: "Election not found." }, { status: 404 });
    }

    const currentState = election.state;
    const wantsFieldEdit =
      body.title !== undefined ||
      body.schoolYear !== undefined ||
      body.description !== undefined ||
      body.startsAt !== undefined ||
      body.endsAt !== undefined;
    const wantsVisibilityToggle = body.showLiveResults !== undefined;
    let targetState: ElectionState | null = null;
    if (body.state !== undefined) {
      const requested = asTrimmedString(body.state);
      if (!requested || !VALID_STATES.has(requested)) {
        return Response.json(
          { error: `"${requested ?? ""}" is not a valid election state.` },
          { status: 400 },
        );
      }
      targetState = requested as ElectionState;
    }

    if (
      currentState === "published" &&
      (wantsFieldEdit || wantsVisibilityToggle || (targetState && targetState !== currentState))
    ) {
      return Response.json(
        { error: "A published election can no longer be changed." },
        { status: 409 },
      );
    }

    // ── Field edits ─────────────────────────────────────────
    let fieldUpdates: Record<string, unknown> | null = null;

    if (wantsFieldEdit) {
      const allowed = FIELD_EDITS_BY_STATE[currentState] ?? [];
      if (allowed.length === 0) {
        return Response.json(
          {
            error: `Election settings can no longer be edited while "${currentState}".`,
          },
          { status: 409 },
        );
      }
      for (const key of ["title", "schoolYear", "description", "startsAt", "endsAt"]) {
        if (body[key] === undefined) continue;
        if (!allowed.includes(key)) {
          return Response.json(
            { error: `"${key}" cannot be edited while the election is "${currentState}".` },
            { status: 409 },
          );
        }
      }

      fieldUpdates = {};
      if (body.title !== undefined) {
        const title = asTrimmedString(body.title);
        if (!title || title.length < 3 || title.length > 200) {
          return Response.json(
            { error: "Title must be 3-200 characters." },
            { status: 400 },
          );
        }
        fieldUpdates.title = title;
      }
      if (body.schoolYear !== undefined) {
        const schoolYear = asTrimmedString(body.schoolYear);
        if (!schoolYear || schoolYear.length > 20) {
          return Response.json(
            { error: "School year is required (max 20 characters)." },
            { status: 400 },
          );
        }
        fieldUpdates.schoolYear = schoolYear;
      }
      if (body.description !== undefined) {
        const description = asTrimmedString(body.description);
        if (description && description.length > 2000) {
          return Response.json(
            { error: "Description is limited to 2000 characters." },
            { status: 400 },
          );
        }
        fieldUpdates.description = description ?? "";
      }
      if (body.startsAt !== undefined || body.endsAt !== undefined) {
        const startsAt =
          body.startsAt !== undefined ? parseDate(body.startsAt) : election.startsAt;
        const endsAt =
          body.endsAt !== undefined ? parseDate(body.endsAt) : election.endsAt;
        if (!startsAt || !endsAt) {
          return Response.json(
            { error: "Start and end times must be valid dates." },
            { status: 400 },
          );
        }
        if (endsAt <= startsAt) {
          return Response.json(
            { error: "The end time must be after the start time." },
            { status: 400 },
          );
        }
        fieldUpdates.startsAt = startsAt;
        fieldUpdates.endsAt = endsAt;
      }
    }

    if (wantsVisibilityToggle) {
      if (typeof body.showLiveResults !== "boolean") {
        return Response.json(
          { error: "showLiveResults must be true or false." },
          { status: 400 },
        );
      }
      fieldUpdates = fieldUpdates ?? {};
      fieldUpdates.showLiveResults = body.showLiveResults;
    }

    if (fieldUpdates && Object.keys(fieldUpdates).length > 0) {
      fieldUpdates.updatedAt = new Date();
      await db
        .update(elections)
        .set(fieldUpdates)
        .where(eq(elections.id, electionId));

      await db.insert(auditLogs).values({
        electionId,
        actorId: admin.id,
        action: "update",
        entityType: "election",
        entityId: electionId,
        metadata: {
          fields: Object.keys(fieldUpdates)
            .filter((f) => f !== "updatedAt")
            .join(","),
        },
      });
    }

    // ── Lifecycle transition (authoritative path) ────────────
    if (targetState !== null) {
      if (!canTransition(currentState, targetState)) {
        return Response.json(
          {
            error: `Cannot change an election from "${currentState}" to "${targetState}".`,
          },
          { status: 409 },
        );
      }
      try {
        const updated = await transitionElection(admin.id, electionId, targetState);
        return Response.json({ election: updated });
      } catch (error) {
        if (error instanceof ElectionTransitionError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    }

    const [fresh] = await db
      .select()
      .from(elections)
      .where(eq(elections.id, electionId))
      .limit(1);
    return Response.json({ election: fresh });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update election error:", error);
    return Response.json(
      { error: "Failed to update election." },
      { status: 500 },
    );
  }
}
