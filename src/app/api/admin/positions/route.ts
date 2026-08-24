import { NextRequest } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, candidates, electionPositions, elections } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Positions are structural content: editable only before an election opens. */
function assertPositionEditable(state: string): Response | null {
  if (state === "open" || state === "closed" || state === "published") {
    return Response.json(
      {
        error: `Positions can no longer be changed while the election is "${state}".`,
      },
      { status: 409 },
    );
  }
  return null;
}

async function loadElectionState(electionId: string): Promise<string | null> {
  const [election] = await db
    .select({ state: elections.state })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);
  return election?.state ?? null;
}

/** GET: List positions for an election. */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("admin");
    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get("electionId");

    if (!electionId) {
      return Response.json(
        { error: "Election ID is required." },
        { status: 400 },
      );
    }

    const positions = await db
      .select()
      .from(electionPositions)
      .where(eq(electionPositions.electionId, electionId))
      .orderBy(asc(electionPositions.displayOrder), asc(electionPositions.name));

    return Response.json({ positions });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Positions error:", error);
    return Response.json(
      { error: "Failed to fetch positions." },
      { status: 500 },
    );
  }
}

/** POST: Create a position. */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const body = (await request.json()) as Record<string, unknown>;

    const electionId = typeof body.electionId === "string" ? body.electionId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const displayOrder =
      body.displayOrder === undefined ? 0 : Number(body.displayOrder);
    const maxSelections =
      body.maxSelections === undefined ? 1 : Number(body.maxSelections);

    if (!electionId || !name) {
      return Response.json(
        { error: "Election ID and position name are required." },
        { status: 400 },
      );
    }
    if (name.length > 120) {
      return Response.json(
        { error: "Position name is limited to 120 characters." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000) {
      return Response.json(
        { error: "Display order must be a whole number between 0 and 1000." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(maxSelections) || maxSelections < 1 || maxSelections > 10) {
      return Response.json(
        { error: "Max selections must be between 1 and 10." },
        { status: 400 },
      );
    }

    const state = await loadElectionState(electionId);
    if (!state) {
      return Response.json({ error: "Election not found." }, { status: 404 });
    }
    const blocked = assertPositionEditable(state);
    if (blocked) return blocked;

    try {
      const [position] = await db
        .insert(electionPositions)
        .values({
          electionId,
          name,
          description,
          displayOrder,
          maxSelections,
        })
        .returning();

      await db.insert(auditLogs).values({
        electionId,
        actorId: admin.id,
        action: "create",
        entityType: "position",
        entityId: position.id,
        metadata: { name },
      });

      return Response.json({ position });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        return Response.json(
          { error: "A position with this name already exists in the election." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create position error:", error);
    return Response.json(
      { error: "Failed to create position." },
      { status: 500 },
    );
  }
}

/** PATCH: Edit a position (name/description/displayOrder/maxSelections). */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const body = (await request.json()) as Record<string, unknown>;

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return Response.json(
        { error: "Position ID is required." },
        { status: 400 },
      );
    }

    const [position] = await db
      .select()
      .from(electionPositions)
      .where(eq(electionPositions.id, id))
      .limit(1);
    if (!position) {
      return Response.json({ error: "Position not found." }, { status: 404 });
    }

    const state = await loadElectionState(position.electionId);
    const blocked = state ? assertPositionEditable(state) : null;
    if (blocked) return blocked;

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 120) {
        return Response.json(
          { error: "Position name is required (max 120 characters)." },
          { status: 400 },
        );
      }
      updates.name = name;
    }
    if (body.description !== undefined) {
      updates.description =
        typeof body.description === "string" ? body.description.trim() : "";
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
    if (body.maxSelections !== undefined) {
      const maxSelections = Number(body.maxSelections);
      if (!Number.isInteger(maxSelections) || maxSelections < 1 || maxSelections > 10) {
        return Response.json(
          { error: "Max selections must be between 1 and 10." },
          { status: 400 },
        );
      }
      updates.maxSelections = maxSelections;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const [updated] = await db
      .update(electionPositions)
      .set(updates)
      .where(eq(electionPositions.id, id))
      .returning();

    await db.insert(auditLogs).values({
      electionId: position.electionId,
      actorId: admin.id,
      action: "update",
      entityType: "position",
      entityId: position.id,
      metadata: { fields: Object.keys(updates).join(",") },
    });

    return Response.json({ position: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update position error:", error);
    return Response.json(
      { error: "Failed to update position." },
      { status: 500 },
    );
  }
}

/** DELETE: Remove a position when safe (draft/scheduled, no candidates). */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { error: "Position ID is required." },
        { status: 400 },
      );
    }

    const [position] = await db
      .select()
      .from(electionPositions)
      .where(eq(electionPositions.id, id))
      .limit(1);
    if (!position) {
      return Response.json({ error: "Position not found." }, { status: 404 });
    }

    const state = await loadElectionState(position.electionId);
    const blockedByState = state ? assertPositionEditable(state) : null;
    if (blockedByState) return blockedByState;

    const [{ candidateCount }] = await db
      .select({ candidateCount: sql<number>`count(*)::int` })
      .from(candidates)
      .where(eq(candidates.positionId, id));

    if (candidateCount > 0) {
      return Response.json(
        { error: "Remove or delete this position's candidates first." },
        { status: 409 },
      );
    }

    await db
      .delete(electionPositions)
      .where(and(eq(electionPositions.id, id)));

    await db.insert(auditLogs).values({
      electionId: position.electionId,
      actorId: admin.id,
      action: "update",
      entityType: "position",
      entityId: id,
      metadata: { deleted: true, name: position.name },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Delete position error:", error);
    return Response.json(
      { error: "Failed to delete position." },
      { status: 500 },
    );
  }
}
