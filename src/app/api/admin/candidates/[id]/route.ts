import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { candidates } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** PATCH: Update a candidate */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth("admin");
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      grade?: string;
      introduction?: string;
      platform?: string;
      imageUrl?: string;
      approved?: boolean;
      displayOrder?: number;
    };

    const [updated] = await db
      .update(candidates)
      .set(body)
      .where(eq(candidates.id, id))
      .returning();

    if (!updated) {
      return Response.json(
        { error: "Candidate not found." },
        { status: 404 },
      );
    }

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

/** DELETE: Remove a candidate */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth("admin");
    const { id } = await params;

    const [deleted] = await db
      .delete(candidates)
      .where(eq(candidates.id, id))
      .returning();

    if (!deleted) {
      return Response.json(
        { error: "Candidate not found." },
        { status: 404 },
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Delete candidate error:", error);
    return Response.json(
      { error: "Failed to delete candidate." },
      { status: 500 },
    );
  }
}
