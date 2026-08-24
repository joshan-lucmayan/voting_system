import { NextRequest } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ballotSelections,
  ballots,
  candidates,
  electionPositions,
  elections,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { ensureDemoElection } from "@/lib/election-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> },
) {
  try {
    await ensureDemoElection();
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

    const positions = await db
      .select()
      .from(electionPositions)
      .where(eq(electionPositions.electionId, electionId));

    const results = [];

    for (const position of positions) {
      // Count votes for each candidate in this position
      const votes = await db
        .select({
          candidateId: ballotSelections.candidateId,
          voteCount: sql<number>`count(*)::int`,
        })
        .from(ballotSelections)
        .innerJoin(ballots, eq(ballotSelections.ballotId, ballots.id))
        .where(
          and(
            eq(ballots.electionId, electionId),
            eq(ballotSelections.positionId, position.id),
          ),
        )
        .groupBy(ballotSelections.candidateId);

      // Get candidate details
      const candidateIds = votes.map((v) => v.candidateId);
      const candidateList =
        candidateIds.length > 0
          ? await db
              .select({
                id: candidates.id,
                name: candidates.name,
                grade: candidates.grade,
                imageUrl: candidates.imageUrl,
              })
              .from(candidates)
              .where(
                eq(candidates.positionId, position.id),
              )
          : [];

      const candidateResults = candidateList.map((c) => ({
        id: c.id,
        name: c.name,
        grade: c.grade,
        imageUrl: c.imageUrl,
        votes: votes.find((v) => v.candidateId === c.id)?.voteCount ?? 0,
      }));

      // Sort by votes descending
      candidateResults.sort((a, b) => b.votes - a.votes);

      results.push({
        position: {
          id: position.id,
          name: position.name,
          description: position.description,
        },
        candidates: candidateResults,
      });
    }

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
