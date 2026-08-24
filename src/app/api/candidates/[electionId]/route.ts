import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { candidates, electionPositions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  try {
    const { electionId } = await params;

    const positions = await db
      .select()
      .from(electionPositions)
      .where(eq(electionPositions.electionId, electionId));

    const positionIds = positions.map((p) => p.id);
    if (positionIds.length === 0) {
      return Response.json({ positions: [], candidates: [] });
    }

    // Only approved, non-archived candidates may appear on a ballot.
    const candidateList = await db
      .select()
      .from(candidates)
      .where(
        and(eq(candidates.approved, true), eq(candidates.archived, false)),
      );

    // Filter candidates that belong to this election's positions
    const filtered = candidateList.filter((c) =>
      positionIds.includes(c.positionId),
    );

    return Response.json({ positions, candidates: filtered });
  } catch (error) {
    console.error("Error fetching candidates:", error);
    return Response.json(
      { error: "Failed to fetch candidates." },
      { status: 500 },
    );
  }
}
