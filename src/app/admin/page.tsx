import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  listElections,
  resolveCurrentElection,
} from "@/lib/elections";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

/**
 * Server-level authentication and election-resolution boundary.
 * Unauthenticated users never receive the admin application shell;
 * API routes remain the authoritative authorization layer.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/vote");

  const [elections, currentElection] = await Promise.all([
    listElections(),
    resolveCurrentElection(),
  ]);

  return (
    <AdminDashboard
      user={{
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        schoolId: user.schoolId,
        email: user.email,
        role: user.role,
      }}
      initialElections={elections.map((e) => ({
        id: e.id,
        title: e.title,
        schoolYear: e.schoolYear,
        description: e.description ?? "",
        state: e.state,
        showLiveResults: e.showLiveResults,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        positionCount: 0,
        candidateCount: 0,
        eligibleVoters: 0,
        votesCast: 0,
      }))}
      initialActiveElectionId={currentElection?.id ?? null}
    />
  );
}
