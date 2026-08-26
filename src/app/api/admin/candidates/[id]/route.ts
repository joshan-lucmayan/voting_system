import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  ballotSelections,
  candidates,
  electionPositions,
  elections,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

import { isValidCandidateImageUrl } from "@/lib/validators";

async function loadCandidateWithElection(id: string) {
  const [row] = await db
    .select({
      candidateId: candidates.id,
      positionId: candidates.positionId,
      name: candidates.name,
      electionId: elections.id,
      electionState: elections.state,
    })
    .from(candidates)
    .innerJoin(
      electionPositions,
      eq(candidates.positionId, electionPositions.id),
    )
    .innerJoin(elections, eq(electionPositions.electionId, elections.id))
    .where(eq(candidates.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * PATCH: Update a candidate.
 *
 * Strict allowlist: name, grade, introduction, platform, imageUrl,
 * displayOrder, approved — and positionId only when the candidate has zero
 * votes and the election has not opened. `archived`, ids and vote data are
 * never client-writable. Content edits are allowed only in draft/scheduled;
 * during open/closed the DELETE route provides archive-only handling, and
 * published elections are fully immutable.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAuth("admin");
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const candidate = await loadCandidateWithElection(id);
    if (!candidate) {
      return Response.json({ error: "Candidate not found." }, { status: 404 });
    }
    if (candidate.electionState === "published") {
      return Response.json(
        { error: "A published election can no longer be changed." },
        { status: 409 },
      );
    }
    if (
      candidate.electionState === "open" ||
      candidate.electionState === "closed"
    ) {
      return Response.json(
        {
          error: `Candidates can no longer be edited while the election is "${candidate.electionState}".`,
        },
        { status: 409 },
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 160) {
        return Response.json(
          { error: "Name is required (max 160 characters)." },
          { status: 400 },
        );
      }
      updates.name = name;
    }
    if (body.grade !== undefined) {
      const grade = typeof body.grade === "string" ? body.grade.trim() : "";
      if (grade.length > 30) {
        return Response.json(
          { error: "Grade is limited to 30 characters." },
          { status: 400 },
        );
      }
      updates.grade = grade || null;
    }
    if (body.introduction !== undefined) {
      const introduction =
        typeof body.introduction === "string" ? body.introduction.trim() : "";
      if (!introduction) {
        return Response.json(
          { error: "Introduction cannot be empty." },
          { status: 400 },
        );
      }
      updates.introduction = introduction;
    }
    if (body.platform !== undefined) {
      const platform =
        typeof body.platform === "string" ? body.platform.trim() : "";
      if (!platform) {
        return Response.json(
          { error: "Platform cannot be empty." },
          { status: 400 },
        );
      }
      updates.platform = platform;
    }
    if (body.imageUrl !== undefined) {
      const imageUrl =
        typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
      if (!isValidCandidateImageUrl(imageUrl)) {
        return Response.json(
          { error: "Image must be a school candidate asset like /candidates/name.svg." },
          { status: 400 },
        );
      }
      updates.imageUrl = imageUrl;
    }
    if (body.displayOrder !== undefined) {
      const displayOrder = Number(body.displayOrder);
      if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000) {
        return Response.json(
          { error: "Display order must be a whole number between 0 and 1000." },
          { status: 400 },
        );
      }
      updates.displayOrder = displayOrder;
    }
    if (body.approved !== undefined) {
      updates.approved = body.approved === true;
    }

    if (body.positionId !== undefined) {
      // Moving a candidate is only safe before any votes exist. (Open/closed
      // states are already rejected by the content-edit guard above.)
      const [{ voteCount }] = await db
        .select({ voteCount: sql<number>`count(*)::int` })
        .from(ballotSelections)
        .where(eq(ballotSelections.candidateId, id));

      if (voteCount > 0) {
        return Response.json(
          { error: "This candidate can no longer be moved to another position." },
          { status: 409 },
        );
      }
      const targetPositionId =
        typeof body.positionId === "string" ? body.positionId.trim() : "";
      const [targetPosition] = await db
        .select({ id: electionPositions.id })
        .from(electionPositions)
        .where(eq(electionPositions.id, targetPositionId))
        .limit(1);
      if (!targetPosition || targetPosition.id === candidate.positionId) {
        return Response.json(
          { error: "Invalid target position." },
          { status: 400 },
        );
      }
      updates.positionId = targetPosition.id;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const [updated] = await db
      .update(candidates)
      .set(updates)
      .where(eq(candidates.id, id))
      .returning();

    await db.insert(auditLogs).values({
      electionId: candidate.electionId,
      actorId: admin.id,
      action: "update",
      entityType: "candidate",
      entityId: id,
      metadata: { fields: Object.keys(updates).join(","), name: updated.name },
    });

    return Response.json({ candidate: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update candidate error:", error);
    return Response.json(
      { error: "Failed to update candidate." },
      { status: 500 },
    );
  }
}

/**
 * DELETE: Remove a candidate while preserving ballot integrity.
 *
 * - draft/scheduled → hard delete (votes are impossible in these states).
 * - open/closed     → ARCHIVE instead (archived = true); the candidate
 *   disappears from ballots/lists but historical tallies stay intact.
 * - published       → rejected entirely.
 *
 * The response states explicitly whether the candidate was deleted or archived.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAuth("admin");
    const { id } = await params;

    const candidate = await loadCandidateWithElection(id);
    if (!candidate) {
      return Response.json({ error: "Candidate not found." }, { status: 404 });
    }
    if (candidate.electionState === "published") {
      return Response.json(
        { error: "A published election can no longer be changed." },
        { status: 409 },
      );
    }

    if (candidate.electionState === "draft" || candidate.electionState === "scheduled") {
      const [deleted] = await db
        .delete(candidates)
        .where(eq(candidates.id, id))
        .returning();
      if (!deleted) {
        return Response.json({ error: "Candidate not found." }, { status: 404 });
      }

      await db.insert(auditLogs).values({
        electionId: candidate.electionId,
        actorId: admin.id,
        action: "update",
        entityType: "candidate",
        entityId: id,
        metadata: { removed: "deleted", name: deleted.name },
      });

      return Response.json({ ok: true, action: "deleted", candidate: deleted });
    }

    // open / closed → archive only.
    const [archived] = await db
      .update(candidates)
      .set({ archived: true, approved: false })
      .where(eq(candidates.id, id))
      .returning();

    await db.insert(auditLogs).values({
      electionId: candidate.electionId,
      actorId: admin.id,
      action: "update",
      entityType: "candidate",
      entityId: id,
      metadata: { removed: "archived", name: archived.name },
    });

    return Response.json({
      ok: true,
      action: "archived",
      message:
        "This candidate has votes, so they were archived instead of deleted.",
      candidate: archived,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Delete candidate error:", error);
    return Response.json(
      { error: "Failed to remove candidate." },
      { status: 500 },
    );
  }
}
