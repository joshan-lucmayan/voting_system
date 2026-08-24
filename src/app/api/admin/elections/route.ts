import { NextRequest } from "next/server";
import { eq, sql, and } from "drizzle-orm";
import { db } from "@/db";
import {
  elections,
  electionPositions,
  candidates,
  electionVoters,
  ballots,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET: List all elections with stats */
export async function GET() {
  try {
    await requireAuth("admin");

    const allElections = await db.select().from(elections);

    const enriched = await Promise.all(
      allElections.map(async (election) => {
        const [positionCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(electionPositions)
          .where(eq(electionPositions.electionId, election.id));

        const [candidateCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(candidates)
          .innerJoin(
            electionPositions,
            eq(candidates.positionId, electionPositions.id),
          )
          .where(
            and(
              eq(electionPositions.electionId, election.id),
              eq(candidates.approved, true),
            ),
          );

        const [voterCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(electionVoters)
          .where(
            and(
              eq(electionVoters.electionId, election.id),
              eq(electionVoters.eligible, true),
            ),
          );

        const [voteCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(electionVoters)
          .where(
            and(
              eq(electionVoters.electionId, election.id),
              sql`${electionVoters.votedAt} IS NOT NULL`,
            ),
          );

        const [ballotCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(ballots)
          .where(eq(ballots.electionId, election.id));

        return {
          ...election,
          positionCount: positionCount?.count ?? 0,
          candidateCount: candidateCount?.count ?? 0,
          eligibleVoters: voterCount?.count ?? 0,
          votesCast: ballotCount?.count ?? 0,
        };
      }),
    );

    return Response.json({ elections: enriched });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin elections error:", error);
    return Response.json(
      { error: "Failed to fetch elections." },
      { status: 500 },
    );
  }
}

/** POST: Create a new election */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAuth("admin");
    const body = (await request.json()) as {
      title?: string;
      schoolYear?: string;
      description?: string;
      startsAt?: string;
      endsAt?: string;
    };

    if (!body.title || !body.schoolYear || !body.startsAt || !body.endsAt) {
      return Response.json(
        { error: "Title, school year, start and end times are required." },
        { status: 400 },
      );
    }

    const [election] = await db
      .insert(elections)
      .values({
        title: body.title,
        schoolYear: body.schoolYear,
        description: body.description ?? "",
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        state: "draft",
        createdBy: admin.id,
      })
      .returning();

    return Response.json({ election });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create election error:", error);
    return Response.json(
      { error: "Failed to create election." },
      { status: 500 },
    );
  }
}

/** PATCH: Update election settings (state, showLiveResults, etc.) */
export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("admin");
    const body = (await request.json()) as {
      electionId?: string;
      state?: string;
      showLiveResults?: boolean;
      title?: string;
      description?: string;
    };

    if (!body.electionId) {
      return Response.json(
        { error: "Election ID is required." },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (body.state) updates.state = body.state;
    if (body.showLiveResults !== undefined)
      updates.showLiveResults = body.showLiveResults;
    if (body.title) updates.title = body.title;
    if (body.description !== undefined)
      updates.description = body.description;

    if (body.state === "published") {
      updates.resultsPublishedAt = new Date();
    }

    const [updated] = await db
      .update(elections)
      .set(updates)
      .where(eq(elections.id, body.electionId))
      .returning();

    return Response.json({ election: updated });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update election error:", error);
    return Response.json(
      { error: "Failed to update election." },
      { status: 500 },
    );
  }
}
