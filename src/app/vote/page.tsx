import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  candidates,
  electionPositions,
  electionVoters,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  isOpenForVoting,
  resolveCurrentElection,
} from "@/lib/elections";
import VoteArea from "@/components/vote/VoteArea";

export const dynamic = "force-dynamic";

export default async function VotePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const election = await resolveCurrentElection();

  // No election to participate in at all.
  if (!election || election.state === "draft") {
    return (
      <div className="app-shell">
        <header className="app-topbar">
          <div className="topbar-left">
            <div className="topbar-brand">
              <div className="mini-crest">N</div>
              <strong>Northfield Academy</strong>
            </div>
          </div>
        </header>
        <div className="app-body">
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              background: "white",
              borderRadius: "var(--radius)",
              border: "1px solid var(--line)",
            }}
          >
            <h2
              style={{
                font: "600 22px Georgia, serif",
                color: "var(--deep-navy)",
                margin: "0 0 8px",
              }}
            >
              No election is currently running
            </h2>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
              When the school council opens an election, it will appear here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Eligibility / voted status for this student in this election.
  const [voterRecord] = await db
    .select({
      eligible: electionVoters.eligible,
      votedAt: electionVoters.votedAt,
    })
    .from(electionVoters)
    .where(
      and(
        eq(electionVoters.electionId, election.id),
        eq(electionVoters.voterId, user.id),
      ),
    )
    .limit(1);

  // Positions + approved, non-archived candidates for the ballot.
  const positions = await db
    .select()
    .from(electionPositions)
    .where(eq(electionPositions.electionId, election.id))
    .orderBy(electionPositions.displayOrder);

  const positionIds = positions.map((p) => p.id);
  const candidateList =
    positionIds.length > 0
      ? await db
          .select()
          .from(candidates)
          .where(eq(candidates.approved, true))
      : [];
  const ballotCandidates = candidateList.filter(
    (c) => positionIds.includes(c.positionId) && !c.archived,
  );

  return (
    <VoteArea
      user={{
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        schoolId: user.schoolId,
        email: user.email,
        grade: user.grade ?? "",
        role: user.role,
      }}
      status={{
        hasVoted: !!voterRecord?.votedAt,
        isEligible: voterRecord?.eligible ?? false,
        isOpen: isOpenForVoting(election),
        election: {
          id: election.id,
          title: election.title,
          description: election.description ?? "",
          schoolYear: election.schoolYear,
          state: election.state,
          showLiveResults: election.showLiveResults,
          startsAt: election.startsAt.toISOString(),
          endsAt: election.endsAt.toISOString(),
        },
      }}
      positions={positions.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        displayOrder: p.displayOrder,
      }))}
      candidates={ballotCandidates.map((c) => ({
        id: c.id,
        name: c.name,
        grade: c.grade ?? "",
        introduction: c.introduction,
        platform: c.platform,
        imageUrl: c.imageUrl,
        positionId: c.positionId,
      }))}
    />
  );
}
