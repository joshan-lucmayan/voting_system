import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  candidates,
  electionPositions,
  elections,
  profiles,
} from "@/db/schema";

export type ElectionState = "draft" | "scheduled" | "open" | "closed" | "published";

export type Election = typeof elections.$inferSelect;

/** Legal lifecycle transitions. Published is terminal. */
const ALLOWED_TRANSITIONS: Record<ElectionState, ElectionState[]> = {
  draft: ["scheduled", "open"],
  scheduled: ["open"],
  open: ["closed"],
  closed: ["published"],
  published: [],
};

export function canTransition(from: ElectionState, to: ElectionState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Resolve the election a student should interact with.
 *
 * Priority:
 * 1. The open election whose voting window contains `now`.
 *    (The DB partial unique index guarantees at most one open election.)
 * 2. The earliest scheduled election.
 * 3. The most recently ended closed/published election.
 * 4. null — no relevant election exists.
 */
export async function resolveCurrentElection(): Promise<Election | null> {
  const now = new Date();

  const [open] = await db
    .select()
    .from(elections)
    .where(
      and(
        eq(elections.state, "open"),
        lte(elections.startsAt, now),
        gte(elections.endsAt, now),
      ),
    )
    .limit(1);
  if (open) return open;

  const [scheduled] = await db
    .select()
    .from(elections)
    .where(eq(elections.state, "scheduled"))
    .orderBy(elections.startsAt)
    .limit(1);
  if (scheduled) return scheduled;

  const [ended] = await db
    .select()
    .from(elections)
    .where(inArray(elections.state, ["closed", "published"]))
    .orderBy(desc(elections.endsAt))
    .limit(1);
  if (ended) return ended;

  return null;
}

export async function getElection(id: string): Promise<Election | null> {
  const [election] = await db
    .select()
    .from(elections)
    .where(eq(elections.id, id))
    .limit(1);
  return election ?? null;
}

export async function listElections(): Promise<Election[]> {
  return db.select().from(elections).orderBy(desc(elections.createdAt));
}

/** True when the election is accepting votes right now. */
export function isOpenForVoting(
  election: Pick<Election, "state" | "startsAt" | "endsAt">,
  now = new Date(),
): boolean {
  return (
    election.state === "open" &&
    now >= election.startsAt &&
    now <= election.endsAt
  );
}

export interface OpenValidationIssue {
  code:
    | "NO_POSITIONS"
    | "POSITION_WITHOUT_CANDIDATES"
    | "INVALID_DATES"
    | "ANOTHER_ELECTION_OPEN"
    | "NOT_FOUND";
  message: string;
}

/**
 * Validate that an election can legally transition to `open`.
 * The DB partial unique index (one_open_election_idx) remains the final
 * concurrency safeguard; this check gives friendly errors up front.
 */
export async function validateElectionCanOpen(
  electionId: string,
): Promise<OpenValidationIssue | null> {
  const election = await getElection(electionId);
  if (!election) {
    return { code: "NOT_FOUND", message: "Election not found." };
  }

  if (election.endsAt <= election.startsAt) {
    return {
      code: "INVALID_DATES",
      message: "The end time must be after the start time.",
    };
  }

  const positions = await db
    .select({ id: electionPositions.id, name: electionPositions.name })
    .from(electionPositions)
    .where(eq(electionPositions.electionId, electionId));

  if (positions.length === 0) {
    return {
      code: "NO_POSITIONS",
      message: "Add at least one position before opening the election.",
    };
  }

  const approvedCounts = await db
    .select({
      positionId: candidates.positionId,
      approvedCount: sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.approved, true),
        eq(candidates.archived, false),
        inArray(
          candidates.positionId,
          positions.map((p) => p.id),
        ),
      ),
    )
    .groupBy(candidates.positionId);

  for (const position of positions) {
    const count =
      approvedCounts.find((c) => c.positionId === position.id)?.approvedCount ??
      0;
    if (count === 0) {
      return {
        code: "POSITION_WITHOUT_CANDIDATES",
        message: `"${position.name}" has no approved candidates.`,
      };
    }
  }

  const [{ openCount }] = await db
    .select({ openCount: sql<number>`count(*)::int` })
    .from(elections)
    .where(eq(elections.state, "open"));

  if (openCount > 0) {
    return {
      code: "ANOTHER_ELECTION_OPEN",
      message: "Another election is already open. Close it first.",
    };
  }

  return null;
}
