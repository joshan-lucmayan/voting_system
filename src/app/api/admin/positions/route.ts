import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { electionPositions } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST: Create a position */
export async function POST(request: NextRequest) {
  try {
    await requireAuth("admin");
    const body = (await request.json()) as {
      electionId?: string;
      name?: string;
      description?: string;
      displayOrder?: number;
    };

    if (!body.electionId || !body.name) {
      return Response.json(
        { error: "Election ID and position name are required." },
        { status: 400 },
      );
    }

    const [position] = await db
      .insert(electionPositions)
      .values({
        electionId: body.electionId,
        name: body.name,
        description: body.description ?? "",
        displayOrder: body.displayOrder ?? 0,
      })
      .returning();

    return Response.json({ position });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create position error:", error);
    return Response.json(
      { error: "Failed to create position." },
      { status: 500 },
    );
  }
}

/** GET: List positions for an election */
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
      .where(eq(electionPositions.electionId, electionId));

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

/** DELETE: Remove a position */
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth("admin");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { error: "Position ID is required." },
        { status: 400 },
      );
    }

    await db.delete(electionPositions).where(eq(electionPositions.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: "Failed to delete position." },
      { status: 500 },
    );
  }
}
