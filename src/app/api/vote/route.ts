import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  ballots,
  ballotSelections,
  candidates,
  elections,
  electionPositions,
  electionVoters,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { IDS } from "@/lib/election-ids";

export async function POST(request: Request) {
  try {
    // Require authenticated student
    const user = await requireAuth("student");

    const payload = (await request.json()) as {
      selections?: Record<string, string[]>;
      electionId?: string;
    };

    const electionId = payload.electionId ?? IDS.election;
    const submitted = payload.selections ?? {};
    const candidateIds = Object.values(submitted).flat();

    if (!candidateIds.length || candidateIds.length > 20) {
      return Response.json(
        { error: "Your ballot is empty or invalid." },
        { status: 400 },
      );
    }

    const result = await db.transaction(async (tx) => {
      // Lock the voter row to prevent concurrent submissions
      const locked = await tx.execute(sql`
        select eligible, voted_at from election_voters
        where election_id = ${electionId} and voter_id = ${user.id}
        for update
      `);
      const voter = locked.rows[0] as
        | { eligible: boolean; voted_at: Date | null }
        | undefined;

      if (!voter?.eligible)
        throw new Error("NOT_ELIGIBLE");
      if (voter.voted_at) throw new Error("ALREADY_VOTED");

      // Verify election is open
      const [election] = await tx
        .select()
        .from(elections)
        .where(eq(elections.id, electionId));
      const now = new Date();
      if (
        !election ||
        election.state !== "open" ||
        now < election.startsAt ||
        now > election.endsAt
      ) {
        throw new Error("ELECTION_NOT_OPEN");
      }

      // Validate candidates exist and belong to positions
      const positions = await tx
        .select()
        .from(electionPositions)
        .where(eq(electionPositions.electionId, electionId));

      const validCandidates = await tx
        .select({
          id: candidates.id,
          positionId: candidates.positionId,
          approved: candidates.approved,
        })
        .from(candidates)
        .where(inArray(candidates.id, candidateIds));

      if (validCandidates.length !== new Set(candidateIds).size)
        throw new Error("INVALID_CANDIDATE");

      // Validate selections per position
      for (const [positionId, choices] of Object.entries(submitted)) {
        const position = positions.find((item) => item.id === positionId);
        if (
          !position ||
          choices.length > position.maxSelections ||
          choices.length < 1
        )
          throw new Error("INVALID_SELECTION_COUNT");

        if (
          choices.some(
            (id) =>
              !validCandidates.some(
                (c) =>
                  c.id === id &&
                  c.positionId === positionId &&
                  c.approved,
              ),
          )
        ) {
          throw new Error("CANDIDATE_POSITION_MISMATCH");
        }
      }

      // Create anonymous ballot
      const receiptCode = `NF-${randomBytes(4).toString("hex").toUpperCase()}`;
      const ballotId = randomUUID();

      await tx.insert(ballots).values({
        id: ballotId,
        electionId,
        receiptCode,
      });

      await tx.insert(ballotSelections).values(
        Object.entries(submitted).flatMap(([positionId, choices]) =>
          choices.map((candidateId) => ({
            ballotId,
            positionId,
            candidateId,
          })),
        ),
      );

      // Mark voter as having voted (no link to ballot)
      const receiptHash = createHash("sha256")
        .update(receiptCode)
        .digest("hex");
      await tx
        .update(electionVoters)
        .set({ votedAt: now, receiptHash })
        .where(
          and(
            eq(electionVoters.electionId, electionId),
            eq(electionVoters.voterId, user.id),
          ),
        );

      // Audit log (no voter identity exposed)
      await tx.insert(auditLogs).values({
        electionId,
        actorId: null,
        action: "vote_submitted",
        entityType: "ballot",
        entityId: ballotId,
        metadata: { verified: true },
      });

      return { receiptCode };
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) return error;

    const message = error instanceof Error ? error.message : "UNKNOWN";
    const known: Record<string, string> = {
      NOT_ELIGIBLE: "You are not eligible for this election.",
      ALREADY_VOTED:
        "You have already voted in this election.",
      ELECTION_NOT_OPEN:
        "This election is not currently open for voting.",
      INVALID_CANDIDATE: "The ballot contains an invalid candidate.",
      INVALID_SELECTION_COUNT:
        "A position has an invalid number of selections.",
      CANDIDATE_POSITION_MISMATCH:
        "A candidate does not belong to the selected position.",
    };
    return Response.json(
      { error: known[message] ?? "We could not securely submit your ballot." },
      { status: known[message] ? 409 : 500 },
    );
  }
}
