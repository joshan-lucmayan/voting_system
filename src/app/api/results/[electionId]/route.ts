import { NextRequest } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ballotSelections,
  ballots,
  candidates,
  electionPositions,
  elections,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  try {
    const user = await requireAuth();
    const { electionId } = await params;

    const [election] = await db
      .select()
      .from(elections)
      .where(eq(elections.id, electionId))
      .limit(1);

    if (!election) {
      return Response.json(
        { error: "Election not found." },
        { status: 404 },
      );
    }

    // Students can only see results if showLiveResults is enabled
    if (
      user.role === "student" &&
      !election.showLiveResults &&
      election.state !== "published"
    ) {
      return Response.json(
        { error: "Results are not available yet." },
        { status: 403 },
      );
    }

    // Fetch positions for this election
    const positions = await db
      .select()
      .from(electionPositions)
      .where(eq(electionPositions.electionId, electionId));

    // Fetch all candidates for this election in one query
    const positionIds = positions.map((p) => p.id);
    const allCandidates =
      positionIds.length > 0
        ? await db
            .select({
              id: candidates.id,
              name: candidates.name,
              grade: candidates.grade,
              imageUrl: candidates.imageUrl,
              positionId: candidates.positionId,
            })
            .from(candidates)
            .where(inArray(candidates.positionId, positionIds))
        : [];

    // Batch vote counts: aggregate all votes grouped by candidate in one query
    const voteCounts =
      positions.length > 0
        ? await db
            .select({
              candidateId: ballotSelections.candidateId,
              positionId: ballotSelections.positionId,
              voteCount: sql<number>`count(*)::int`,
            })
            .from(ballotSelections)
            .innerJoin(ballots, eq(ballotSelections.ballotId, ballots.id))
            .where(eq(ballots.electionId, electionId))
            .groupBy(
              ballotSelections.candidateId,
              ballotSelections.positionId,
            )
        : [];

    // Build a lookup for vote counts
    const votesByCandidate = new Map<string, number>();
    for (const row of voteCounts) {
      votesByCandidate.set(row.candidateId, row.voteCount);
    }

    // Group candidates by position and build results
    const results = positions.map((position) => {
      const positionCandidates = allCandidates
        .filter((c) => c.positionId === position.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          grade: c.grade,
          imageUrl: c.imageUrl,
          votes: votesByCandidate.get(c.id) ?? 0,
        }))
        .sort((a, b) => b.votes - a.votes);

      return {
        position: {
          id: position.id,
          name: position.name,
          description: position.description,
        },
        candidates: positionCandidates,
      };
    });

    // Get total ballot count
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ballots)
      .where(eq(ballots.electionId, electionId));

    return Response.json({
      election: {
        id: election.id,
        title: election.title,
        showLiveResults: election.showLiveResults,
        state: election.state,
      },
      totalBallots: totalRow?.count ?? 0,
      results,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Results error:", error);
    return Response.json(
      { error: "Failed to fetch results." },
      { status: 500 },
    );
  }
}
