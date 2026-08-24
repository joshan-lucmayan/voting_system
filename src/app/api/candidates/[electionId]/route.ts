import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { candidates, electionPositions } from "@/db/schema";
import { ensureDemoElection } from "@/lib/election-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  try {
    await ensureDemoElection();
    const { electionId } = await params;

    const positions = await db
      .select()
      .from(electionPositions)
      .where(eq(electionPositions.electionId, electionId));

    const positionIds = positions.map((p) => p.id);
    if (positionIds.length === 0) {
      return Response.json({ positions: [], candidates: [] });
    }

    const candidateList = await db
      .select()
      .from(candidates)
      .where(
        eq(candidates.approved, true),
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
