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

/** Strict runtime shape check for the parsed request body. */
function parseBallotPayload(raw: unknown): {
  electionId: string;
  selections: Record<string, string[]>;
} | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const body = raw as Record<string, unknown>;

  // Extra fields are ignored (no mass assignment); these two are read.
  const electionId = body.electionId;
  if (typeof electionId !== "string" || electionId.length === 0) {
    return null;
  }

  const selections = body.selections;
  if (typeof selections !== "object" || selections === null || Array.isArray(selections)) {
    return null;
  }

  const normalized: Record<string, string[]> = {};
  for (const [positionId, choices] of Object.entries(selections)) {
    // JSON objects cannot contain duplicate keys (last one wins), so every
    // entry here is a distinct position by construction.
    if (!Array.isArray(choices)) return null;
    for (const candidateId of choices) {
      if (typeof candidateId !== "string") return null;
    }
    normalized[positionId] = choices;
  }

  return { electionId, selections: normalized };
}

export async function POST(request: Request) {
  try {
    // Require authenticated student
    const user = await requireAuth("student");

    let parsed: ReturnType<typeof parseBallotPayload>;
    try {
      const raw: unknown = await request.json();
      parsed = parseBallotPayload(raw);
    } catch {
      return Response.json(
        { error: "Your ballot could not be read." },
        { status: 400 },
      );
    }
    if (!parsed) {
      return Response.json(
        { error: "Your ballot is malformed." },
        { status: 400 },
      );
    }

    // The election is resolved server-side from authenticated context —
    // there is no default election and no client-controlled fallback.
    const { electionId, selections } = parsed;

    const candidateIds = Object.values(selections).flat();

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

      // COMPLETENESS: submitted position keys must exactly equal ALL
      // positions of the election. Missing or unknown positions are both
      // rejected — no abstentions in v1.
      if (positions.length !== Object.keys(selections).length) {
        throw new Error("INCOMPLETE_BALLOT");
      }
      for (const position of positions) {
        if (!(position.id in selections)) {
          throw new Error("INCOMPLETE_BALLOT");
        }
      }

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
      for (const [positionId, choices] of Object.entries(selections)) {
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

      // Create anonymous ballot.
      // 6 random bytes = 48 bits of entropy: collision probability stays
      // negligible across realistic election sizes (the receipts table has
      // a unique constraint as the final guard).
      const receiptCode = `NF-${randomBytes(6).toString("hex").toUpperCase()}`;
      const ballotId = randomUUID();

      await tx.insert(ballots).values({
        id: ballotId,
        electionId,
        receiptCode,
      });

      await tx.insert(ballotSelections).values(
        Object.entries(selections).flatMap(([positionId, choices]) =>
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
    const known: Record<string, { message: string; status: number }> = {
      NOT_ELIGIBLE: { message: "You are not eligible for this election.", status: 409 },
      ALREADY_VOTED: { message: "You have already voted in this election.", status: 409 },
      ELECTION_NOT_OPEN: {
        message: "This election is not currently open for voting.",
        status: 409,
      },
      INCOMPLETE_BALLOT: {
        message: "Your ballot must include exactly one selection for every position.",
        status: 400,
      },
      INVALID_CANDIDATE: { message: "The ballot contains an invalid candidate.", status: 400 },
      INVALID_SELECTION_COUNT: {
        message: "A position has an invalid number of selections.",
        status: 400,
      },
      CANDIDATE_POSITION_MISMATCH: {
        message: "A candidate does not belong to the selected position.",
        status: 400,
      },
    };
    const matched = known[message];
    return Response.json(
      { error: matched?.message ?? "We could not securely submit your ballot." },
      { status: matched?.status ?? (message === "UNKNOWN" ? 500 : 400) },
    );
  }
}
