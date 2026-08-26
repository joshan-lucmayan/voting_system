import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { electionVoters, elections } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { isOpenForVoting } from "@/lib/elections";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth("student");
    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get("electionId");

    if (!electionId) {
      return Response.json(
        { error: "Election ID is required." },
        { status: 400 },
      );
    }

    // Get election info
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

    // Check voter status
    const [voterRecord] = await db
      .select({
        eligible: electionVoters.eligible,
        votedAt: electionVoters.votedAt,
      })
      .from(electionVoters)
      .where(
        and(
          eq(electionVoters.electionId, electionId),
          eq(electionVoters.voterId, user.id),
        ),
      )
      .limit(1);

    const hasVoted = !!voterRecord?.votedAt;
    const isEligible = voterRecord?.eligible ?? false;
    const isOpen = isOpenForVoting(election);
    const showResults = election.showLiveResults;

    return Response.json({
      hasVoted,
      isEligible,
      isOpen,
      election: {
        id: election.id,
        title: election.title,
        description: election.description,
        schoolYear: election.schoolYear,
        state: election.state,
        showLiveResults: showResults,
        startsAt: election.startsAt,
        endsAt: election.endsAt,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Vote status error:", error);
    return Response.json(
      { error: "Failed to check vote status." },
      { status: 500 },
    );
  }
}
