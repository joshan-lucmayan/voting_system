import { NextRequest } from "next/server";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ballotSelections,
  ballots,
  candidates,
  electionPositions,
  elections,
  electionVoters,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  try {
    await requireAuth("admin");
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

    // Total eligible voters
    const [eligibleRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(electionVoters)
      .where(
        and(
          eq(electionVoters.electionId, electionId),
          eq(electionVoters.eligible, true),
        ),
      );

    // Total votes cast
    const [votesRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ballots)
      .where(eq(ballots.electionId, electionId));

    const totalEligible = eligibleRow?.count ?? 0;
    const totalVotes = votesRow?.count ?? 0;
    const turnout =
      totalEligible > 0
        ? Math.round((totalVotes / totalEligible) * 1000) / 10
        : 0;

    // Fetch all positions for this election
    const positions = await db
      .select()
      .from(electionPositions)
      .where(eq(electionPositions.electionId, electionId));

    const positionIds = positions.map((p) => p.id);

    // Fetch all candidates for these positions in one query
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

    // Batch vote counts: aggregate all votes by candidate in one query
    const voteCounts =
      positionIds.length > 0
        ? await db
            .select({
              candidateId: ballotSelections.candidateId,
              voteCount: sql<number>`count(*)::int`,
            })
            .from(ballotSelections)
            .innerJoin(ballots, eq(ballotSelections.ballotId, ballots.id))
            .where(eq(ballots.electionId, electionId))
            .groupBy(ballotSelections.candidateId)
        : [];

    const votesByCandidate = new Map<string, number>();
    for (const row of voteCounts) {
      votesByCandidate.set(row.candidateId, row.voteCount);
    }

    // Build per-position stats
    const positionStats = positions.map((position) => {
      const candidateStats = allCandidates
        .filter((c) => c.positionId === position.id)
        .map((c) => ({
          ...c,
          votes: votesByCandidate.get(c.id) ?? 0,
        }))
        .sort((a, b) => b.votes - a.votes);

      return {
        position: {
          id: position.id,
          name: position.name,
          description: position.description,
        },
        candidates: candidateStats,
      };
    });

    return Response.json({
      election: {
        id: election.id,
        title: election.title,
        state: election.state,
        showLiveResults: election.showLiveResults,
      },
      stats: {
        totalEligible,
        totalVotes,
        turnout,
      },
      positions: positionStats,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Stats error:", error);
    return Response.json(
      { error: "Failed to fetch statistics." },
      { status: 500 },
    );
  }
}
