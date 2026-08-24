import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, candidates, electionPositions, elections } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { isValidCandidateImageUrl as isValidImageUrl } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * Candidate content is structural ballot material: creatable/editable only
 * while the election has not opened. (Archival during open/closed is
 * handled by the [id] DELETE route.)
 */
function assertCandidateContentEditable(state: string): Response | null {
  if (state === "open" || state === "closed" || state === "published") {
    return Response.json(
      {
        error: `Candidates can no longer be changed while the election is "${state}".`,
      },
      { status: 409 },
    );
  }
  return null;
}

async function positionWithElection(positionId: string) {
  const [row] = await db
    .select({
      positionId: electionPositions.id,
      positionName: electionPositions.name,
      electionId: elections.id,
      electionState: elections.state,
    })
    .from(electionPositions)
    .innerJoin(elections, eq(electionPositions.electionId, elections.id))
    .where(eq(electionPositions.id, positionId))
    .limit(1);
  return row ?? null;
}

/** GET: List candidates for an election (or all). */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get("electionId");

    const baseColumns = {
      id: candidates.id,
      name: candidates.name,
      grade: candidates.grade,
      introduction: candidates.introduction,
      platform: candidates.platform,
      imageUrl: candidates.imageUrl,
      approved: candidates.approved,
      archived: candidates.archived,
      displayOrder: candidates.displayOrder,
      positionId: candidates.positionId,
      positionName: electionPositions.name,
      electionId: electionPositions.electionId,
    };

    const candidateList = electionId
      ? await db
          .select(baseColumns)
          .from(candidates)
          .innerJoin(
            electionPositions,
            eq(candidates.positionId, electionPositions.id),
          )
          .where(
            and(
              eq(electionPositions.electionId, electionId),
              eq(candidates.archived, false),
            ),
          )
      : await db
          .select(baseColumns)
          .from(candidates)
          .innerJoin(
            electionPositions,
            eq(candidates.positionId, electionPositions.id),
          )
          .where(eq(candidates.archived, false));

    return Response.json({ candidates: candidateList });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin candidates error:", error);
    return Response.json(
      { error: "Failed to fetch candidates." },
      { status: 500 },
    );
  }
}

/** POST: Add a new candidate (strict allowlist). */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const body = (await request.json()) as Record<string, unknown>;

    // Strict allowlist — studentProfileId, ids, vote counts etc. are never read.
    const positionId =
      typeof body.positionId === "string" ? body.positionId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const grade = typeof body.grade === "string" ? body.grade.trim() : "";
    const introduction =
      typeof body.introduction === "string" ? body.introduction.trim() : "";
    const platform = typeof body.platform === "string" ? body.platform.trim() : "";
    const imageUrlRaw = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const displayOrder =
      body.displayOrder === undefined ? 0 : Number(body.displayOrder);
    const approved = body.approved === undefined ? true : body.approved === true;

    if (!positionId) {
      return Response.json({ error: "Position is required." }, { status: 400 });
    }
    if (!name || name.length > 160) {
      return Response.json(
        { error: "Name is required (max 160 characters)." },
        { status: 400 },
      );
    }
    if (grade.length > 30) {
      return Response.json(
        { error: "Grade is limited to 30 characters." },
        { status: 400 },
      );
    }
    if (!introduction) {
      return Response.json({ error: "Introduction is required." }, { status: 400 });
    }
    if (!platform) {
      return Response.json({ error: "Platform is required." }, { status: 400 });
    }
    if (imageUrlRaw && !isValidImageUrl(imageUrlRaw)) {
      return Response.json(
        { error: "Image must be a school candidate asset like /candidates/name.svg." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000) {
      return Response.json(
        { error: "Display order must be a whole number between 0 and 1000." },
        { status: 400 },
      );
    }

    const target = await positionWithElection(positionId);
    if (!target) {
      return Response.json({ error: "Position not found." }, { status: 404 });
    }
    const blocked = assertCandidateContentEditable(target.electionState);
    if (blocked) return blocked;

    const imageUrl = imageUrlRaw || "/candidates/placeholder.svg";

    const [candidate] = await db
      .insert(candidates)
      .values({
        positionId,
        name,
        grade: grade || null,
        introduction,
        platform,
        imageUrl,
        approved,
        displayOrder,
      })
      .returning();

    await db.insert(auditLogs).values({
      electionId: target.electionId,
      actorId: admin.id,
      action: "create",
      entityType: "candidate",
      entityId: candidate.id,
      metadata: { name },
    });

    return Response.json({ candidate });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Add candidate error:", error);
    return Response.json(
      { error: "Failed to add candidate." },
      { status: 500 },
    );
  }
}
