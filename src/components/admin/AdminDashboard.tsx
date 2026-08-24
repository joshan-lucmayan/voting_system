"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Calendar,
  Check,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Eye,
  EyeOff,
  Flag,
  LayoutDashboard,
  Lock,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Trophy,
  UserPlus,
  Users,
  Vote,
  X,
  Trash2,
  Edit,
} from "lucide-react";

type UserInfo = {
  id: string;
  firstName: string;
  lastName: string;
  schoolId: string;
  email: string;
  role: string;
};

type Election = {
  id: string;
  title: string;
  schoolYear: string;
  description: string;
  state: string;
  showLiveResults: boolean;
  startsAt: string;
  endsAt: string;
  positionCount: number;
  candidateCount: number;
  eligibleVoters: number;
  votesCast: number;
};

type CandidateData = {
  id: string;
  name: string;
  grade: string;
  introduction: string;
  platform: string;
  imageUrl: string;
  approved: boolean;
  positionId: string;
  positionName: string;
};

type StatsData = {
  election: { id: string; title: string; state: string; showLiveResults: boolean };
  stats: { totalEligible: number; totalVotes: number; turnout: number };
  positions: {
    position: { id: string; name: string };
    candidates: { id: string; name: string; grade: string; votes: number }[];
  }[];
};

type VoterRow = {
  voterId: string;
  schoolId: string;
  name: string;
  grade: string;
  eligible: boolean;
  votedAt: string | null;
};

type AdminTab = "dashboard" | "candidates" | "voters" | "stats" | "settings";

export default function AdminDashboard({
  user,
  initialElections,
  initialActiveElectionId,
}: {
  user: UserInfo;
  initialElections: Election[];
  initialActiveElectionId: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [elections, setElections] = useState<Election[]>(initialElections);
  const [activeElectionId, setActiveElectionId] = useState<string | null>(
    initialActiveElectionId,
  );
  const [candidates, setCandidates] = useState<CandidateData[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [availablePositions, setAvailablePositions] = useState<
    { id: string; name: string }[]
  >([]);
  const [newElection, setNewElection] = useState({
    title: "",
    schoolYear: "",
    description: "",
    startsAt: "",
    endsAt: "",
  });

  // Voter management state
  const [voters, setVoters] = useState<VoterRow[]>([]);
  const [votersPagination, setVotersPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [votersLoading, setVotersLoading] = useState(false);
  const [voterSearch, setVoterSearch] = useState("");
  const [voterStatusFilter, setVoterStatusFilter] = useState("");
  const [bulkSchoolIds, setBulkSchoolIds] = useState("");
  const [bulkSummary, setBulkSummary] = useState("");

  // Modal states
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [showCreateElection, setShowCreateElection] = useState(false);
  const [newCandidate, setNewCandidate] = useState({
    name: "",
    grade: "",
    introduction: "",
    platform: "",
    positionId: "",
  });

  const activeElection =
    elections.find((e) => e.id === activeElectionId) ?? null;

  const fetchAdminData = useCallback(async () => {
    try {
      const elecRes = await fetch("/api/admin/elections");
      if (elecRes.status === 401 || elecRes.status === 403) {
        router.push("/login");
        return;
      }
      const elecData = await elecRes.json();
      setElections(elecData.elections || []);

      const electionForFetch = activeElection ?? elecData.elections?.[0];
      if (electionForFetch) {
        const candRes = await fetch(
          `/api/admin/candidates?electionId=${electionForFetch.id}`,
        );
        const candData = await candRes.json();
        setCandidates(candData.candidates || []);

        const statsRes = await fetch(`/api/admin/stats/${electionForFetch.id}`);
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      }
    } catch {
      setError("Could not load dashboard data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, [router, activeElection]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  /** Shared mutation helper: applies server feedback or shows the error. */
  const applyAction = async (
    action: () => Promise<Response>,
    successMessage?: string,
  ): Promise<boolean> => {
    try {
      const res = await action();
      if (res.ok) {
        setNotice(successMessage ?? "");
        setError("");
        await fetchAdminData();
        return true;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error || `Request failed (${res.status}).`);
      return false;
    } catch {
      setError("A network error occurred. Please try again.");
      return false;
    }
  };

  const toggleLiveResults = (showLive: boolean) => {
    if (!activeElection) return;
    void applyAction(
      () =>
        fetch("/api/admin/elections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            electionId: activeElection.id,
            showLiveResults: showLive,
          }),
        }),
      `Live results ${showLive ? "enabled" : "disabled"}.`,
    );
  };

  const toggleElectionState = (newState: string) => {
    if (!activeElection) return;
    void applyAction(
      () =>
        fetch("/api/admin/elections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            electionId: activeElection.id,
            state: newState,
          }),
        }),
      `Election is now "${newState}".`,
    );
  };

  const createElection = async () => {
    if (!newElection.title || !newElection.startsAt || !newElection.endsAt) return;
    const ok = await applyAction(
      () =>
        fetch("/api/admin/elections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // datetime-local values are converted to ISO-8601 UTC here.
          body: JSON.stringify({
            ...newElection,
            startsAt: new Date(newElection.startsAt).toISOString(),
            endsAt: new Date(newElection.endsAt).toISOString(),
          }),
        }),
      "Election created as draft.",
    );
    if (ok) {
      setShowCreateElection(false);
      setNewElection({
        title: "",
        schoolYear: "",
        description: "",
        startsAt: "",
        endsAt: "",
      });
    }
  };

  /** Positions come from the positions API — never derived from candidates. */
  const loadPositions = async () => {
    if (!activeElection) return;
    try {
      const res = await fetch(
        `/api/admin/positions?electionId=${activeElection.id}`,
      );
      const data = await res.json();
      setAvailablePositions(data.positions || []);
    } catch {
      setError("Could not load positions. Please try again.");
    }
  };

  const addCandidate = async () => {
    if (!newCandidate.name || !newCandidate.positionId) return;
    const ok = await applyAction(
      () =>
        fetch("/api/admin/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newCandidate),
        }),
      "Candidate added.",
    );
    if (ok) {
      setShowAddCandidate(false);
      setNewCandidate({
        name: "",
        grade: "",
        introduction: "",
        platform: "",
        positionId: "",
      });
    }
  };

  const deleteCandidate = async (id: string) => {
    if (!confirm("Remove this candidate? Candidates with votes will be archived.")) return;
    const ok = await applyAction(() =>
      fetch(`/api/admin/candidates/${id}`, { method: "DELETE" }),
    );
    if (ok) setNotice("Candidate removed.");
  };

  // ── Voter management ─────────────────────────────────────
  const loadVoters = useCallback(
    async (page = 1) => {
      if (!activeElection) return;
      setVotersLoading(true);
      try {
        const params = new URLSearchParams({
          electionId: activeElection.id,
          page: String(page),
        });
        if (voterSearch.trim()) params.set("q", voterSearch.trim());
        if (voterStatusFilter) params.set("status", voterStatusFilter);
        const res = await fetch(`/api/admin/voters?${params.toString()}`);
        const data = await res.json();
        if (res.ok) {
          setVoters(data.voters || []);
          if (data.pagination) {
            setVotersPagination({
              page: data.pagination.page,
              totalPages: data.pagination.totalPages,
              total: data.pagination.total,
            });
          }
          setError("");
        } else {
          setError(data.error || "Could not load voters.");
        }
      } catch {
        setError("Could not load voters. Please try again.");
      } finally {
        setVotersLoading(false);
      }
    },
    [activeElection, voterSearch, voterStatusFilter],
  );

  useEffect(() => {
    if (tab === "voters" && activeElection) {
      void loadVoters(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeElection?.id]);

  const bulkEnrollVoters = async () => {
    if (!activeElection || !bulkSchoolIds.trim()) return;
    // One School ID per line; normalize before submission.
    const schoolIds = [
      ...new Set(
        bulkSchoolIds
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ];
    try {
      const res = await fetch("/api/admin/voters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionId: activeElection.id, schoolIds }),
      });
      const data = await res.json();
      if (res.ok) {
        const s = data.summary ?? {};
        const parts: string[] = [];
        if (s.enrolled) parts.push(`${s.enrolled} enrolled`);
        if (s.already_enrolled) parts.push(`${s.already_enrolled} already enrolled`);
        if (s.not_found) parts.push(`${s.not_found} not found`);
        if (s.inactive) parts.push(`${s.inactive} inactive`);
        if (s.not_student) parts.push(`${s.not_student} not a student`);
        if (s.invalid) parts.push(`${s.invalid} invalid`);
        setBulkSummary(parts.join(" · ") || "Nothing to enroll.");
        setBulkSchoolIds("");
        await loadVoters(1);
        fetchAdminData();
      } else {
        setError(data.error || "Bulk enrollment failed.");
      }
    } catch {
      setError("A network error occurred during enrollment.");
    }
  };

  const markVoterIneligible = async (voterId: string) => {
    if (!confirm("Mark this voter as ineligible?")) return;
    await applyAction(
      () =>
        fetch(
          `/api/admin/voters?electionId=${activeElection?.id}&voterId=${voterId}`,
          { method: "DELETE" },
        ),
      "Voter marked ineligible.",
    );
    await loadVoters(votersPagination.page);
  };

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
      </div>
    );
  }

  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`;
  const turnoutPercent = stats?.stats.turnout ?? 0;
  const totalVotes = stats?.stats.totalVotes ?? 0;
  const totalEligible = stats?.stats.totalEligible ?? 0;

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-sidebar-header">
          <strong>School Council</strong>
          <span>Admin Dashboard</span>
        </div>
        <nav className="admin-nav">
          <p className="admin-nav-label">MANAGEMENT</p>
          <button
            className={`admin-nav-btn ${tab === "dashboard" ? "active" : ""}`}
            onClick={() => { setTab("dashboard"); setSidebarOpen(false); }}
          >
            <LayoutDashboard /> Dashboard
          </button>
          <button
            className={`admin-nav-btn ${tab === "candidates" ? "active" : ""}`}
            onClick={() => { setTab("candidates"); setSidebarOpen(false); }}
          >
            <Users /> Candidates
            {activeElection && (
              <span className="badge">{activeElection.candidateCount}</span>
            )}
          </button>
          <button
            className={`admin-nav-btn ${tab === "voters" ? "active" : ""}`}
            onClick={() => { setTab("voters"); setSidebarOpen(false); }}
          >
            <UserPlus /> Voters
          </button>
          <button
            className={`admin-nav-btn ${tab === "stats" ? "active" : ""}`}
            onClick={() => { setTab("stats"); setSidebarOpen(false); }}
          >
            <BarChart3 /> Vote Statistics
          </button>
          <button
            className={`admin-nav-btn ${tab === "settings" ? "active" : ""}`}
            onClick={() => { setTab("settings"); setSidebarOpen(false); }}
          >
            <Settings /> Settings
          </button>
        </nav>
        <div className="admin-sidebar-footer">
          <div className="avatar">{initials}</div>
          <div>
            <strong>{user.firstName} {user.lastName}</strong>
            <span>Administrator</span>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className={`admin-mobile-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Content */}
      <div className="admin-content">
        <header className="admin-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <LayoutDashboard size={20} />
            </button>
            <h2>
              {tab === "dashboard" && "Dashboard"}
              {tab === "candidates" && "Candidate Management"}
              {tab === "stats" && "Vote Statistics"}
              {tab === "voters" && "Voter Eligibility"}
              {tab === "settings" && "Election Settings"}
            </h2>
          </div>
          <div className="admin-topbar-actions">
            {elections.length > 0 && (
              <select
                value={activeElection?.id ?? ""}
                onChange={(e) => {
                  setActiveElectionId(e.target.value);
                  setError("");
                  setNotice("");
                }}
                aria-label="Active election"
                style={{
                  height: 36, border: "1.5px solid var(--line)", borderRadius: "var(--radius-sm)",
                  padding: "0 10px", fontSize: 13, background: "#fff", maxWidth: 260,
                }}
              >
                {elections.map((e2) => (
                  <option key={e2.id} value={e2.id}>
                    {e2.title} ({e2.state})
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreateElection(true)}
            >
              <Plus size={16} /> New Election
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              <LogOut size={16} /> Log out
            </button>
          </div>
        </header>

        <main className="admin-main">
          {error && (
            <div className="form-error" role="alert">{error}</div>
          )}
          {notice && !error && (
            <div
              className="status-banner voted"
              role="status"
              style={{ marginBottom: 16 }}
            >
              <CheckCircle />
              <span>{notice}</span>
            </div>
          )}
          {/* Dashboard Tab */}
          {tab === "dashboard" && (
            <>
              <div className="admin-banner">
                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background:
                        activeElection?.state === "open"
                          ? "rgba(26, 154, 104, 0.2)"
                          : "rgba(255, 255, 255, 0.12)",
                      borderRadius: 14,
                      padding: "4px 12px",
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background:
                          activeElection?.state === "open"
                            ? "#34d399"
                            : "#888",
                      }}
                    />
                    {activeElection?.state === "open"
                      ? "Voting Open"
                      : activeElection?.state?.toUpperCase() ?? "No Election"}
                  </span>
                  <h3>{activeElection?.title ?? "No Active Election"}</h3>
                  <p>
                    {activeElection?.schoolYear ?? ""} ·{" "}
                    {activeElection?.state === "open"
                      ? "Voting is running normally"
                      : "Set up or open an election"}
                  </p>
                </div>
                <div className="admin-banner-actions">
                  {activeElection?.state === "draft" && (
                    <button
                      className="btn btn-outline"
                      onClick={() => toggleElectionState("open")}
                    >
                      <Vote /> Open Election
                    </button>
                  )}
                  {activeElection?.state === "open" && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => toggleElectionState("closed")}
                    >
                      <Lock /> Close Election
                    </button>
                  )}
                </div>
              </div>

              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-card-icon">
                    <Users />
                  </div>
                  <small>Eligible voters</small>
                  <strong>{totalEligible.toLocaleString()}</strong>
                  <p>Registered for this election</p>
                </div>
                <div className="stat-card">
                  <div className="stat-card-icon">
                    <ClipboardCheck />
                  </div>
                  <small>Votes cast</small>
                  <strong>{totalVotes.toLocaleString()}</strong>
                  <p>Ballots submitted</p>
                </div>
                <div className="stat-card">
                  <div className="stat-card-icon">
                    <BarChart3 />
                  </div>
                  <small>Voter turnout</small>
                  <strong>{turnoutPercent}%</strong>
                  <p>Of eligible voters</p>
                </div>
                <div className="stat-card">
                  <div className="stat-card-icon">
                    <Clock />
                  </div>
                  <small>Status</small>
                  <strong style={{ fontSize: 20 }}>
                    {activeElection?.state === "open"
                      ? "Active"
                      : activeElection?.state ?? "None"}
                  </strong>
                  <p>{activeElection?.candidateCount ?? 0} candidates</p>
                </div>
              </div>

              <div className="admin-panels">
                <div className="admin-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Candidates Overview</h3>
                      <p>Manage candidates for this election</p>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => { setShowAddCandidate(true); loadPositions(); }}
                    >
                      <Plus /> Add Candidate
                    </button>
                  </div>
                  {candidates.length === 0 ? (
                    <div className="panel-body" style={{ textAlign: "center", padding: 40 }}>
                      <p style={{ color: "var(--muted)" }}>No candidates yet. Add your first candidate.</p>
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="candidate-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Position</th>
                            <th>Grade</th>
                            <th style={{ width: 80 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {candidates.slice(0, 8).map((c) => (
                            <tr key={c.id}>
                              <td>
                                <div className="name-cell">
                                  <div className="mini-avatar">
                                    {c.name.split(" ").map((n) => n[0]).join("")}
                                  </div>
                                  <div>
                                    <strong>{c.name}</strong>
                                  </div>
                                </div>
                              </td>
                              <td>{c.positionName}</td>
                              <td>{c.grade}</td>
                              <td>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => deleteCandidate(c.id)}
                                  style={{ color: "var(--error)" }}
                                  title="Remove candidate"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="admin-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Quick Actions</h3>
                      <p>Common administration tasks</p>
                    </div>
                  </div>
                  <div className="quick-links">
                    <button className="quick-link-btn" onClick={() => { setTab("candidates"); }}>
                      <div className="ql-icon">
                        <Users />
                      </div>
                      <div>
                        <strong>Candidates</strong>
                        <small>{activeElection?.candidateCount ?? 0} approved</small>
                      </div>
                      <ChevronRight />
                    </button>
                    <button className="quick-link-btn" onClick={() => { setTab("stats"); }}>
                      <div className="ql-icon">
                        <BarChart3 />
                      </div>
                      <div>
                        <strong>Vote Statistics</strong>
                        <small>{turnoutPercent}% turnout</small>
                      </div>
                      <ChevronRight />
                    </button>
                    <button className="quick-link-btn" onClick={() => toggleLiveResults(!activeElection?.showLiveResults)}>
                      <div className="ql-icon">
                        {activeElection?.showLiveResults ? <Eye /> : <EyeOff />}
                      </div>
                      <div>
                        <strong>Live Results</strong>
                        <small>{activeElection?.showLiveResults ? "Enabled" : "Disabled"}</small>
                      </div>
                      <ChevronRight />
                    </button>
                    <button className="quick-link-btn" onClick={() => { setTab("settings"); }}>
                      <div className="ql-icon">
                        <Settings />
                      </div>
                      <div>
                        <strong>Election Settings</strong>
                        <small>Configure election</small>
                      </div>
                      <ChevronRight />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Candidates Tab */}
          {tab === "candidates" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
                    {candidates.length} candidates across {activeElection?.positionCount ?? 0} positions
                  </p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowAddCandidate(true); loadPositions(); }}>
                  <UserPlus /> Add Candidate
                </button>
              </div>

              {candidates.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: 60, background: "white",
                  borderRadius: "var(--radius)", border: "1px solid var(--line)"
                }}>
                  <Users style={{ width: 40, height: 40, color: "var(--icy-blue)", marginBottom: 16 }} />
                  <h3 style={{ font: "600 18px Georgia, serif", color: "var(--deep-navy)", margin: "0 0 8px" }}>
                    No candidates yet
                  </h3>
                  <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>
                    Add candidates to start building your election ballot.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setShowAddCandidate(true); loadPositions(); }}>
                    <Plus /> Add First Candidate
                  </button>
                </div>
              ) : (
                <div style={{
                  background: "white", border: "1px solid var(--line)",
                  borderRadius: "var(--radius)", overflow: "hidden"
                }}>
                  <table className="candidate-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Position</th>
                        <th>Grade</th>
                        <th>Status</th>
                        <th style={{ width: 100 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="name-cell">
                              <div className="mini-avatar">
                                {c.name.split(" ").map((n) => n[0]).join("")}
                              </div>
                              <div>
                                <strong>{c.name}</strong>
                                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                                  {c.introduction}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>{c.positionName}</td>
                          <td>{c.grade}</td>
                          <td>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              background: c.approved ? "var(--success-bg)" : "#f0f0f0",
                              color: c.approved ? "var(--success)" : "var(--muted)",
                              padding: "3px 10px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                            }}>
                              {c.approved ? <Check size={10} /> : <X size={10} />}
                              {c.approved ? "Approved" : "Pending"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => deleteCandidate(c.id)}
                              style={{ color: "var(--error)" }}
                              title="Remove candidate"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Voters Tab */}
          {tab === "voters" && (
            <>
              {!activeElection ? (
                <div style={{ textAlign: "center", padding: 60 }}>
                  <p style={{ color: "var(--muted)" }}>
                    Create or select an election first.
                  </p>
                </div>
              ) : (
                <>
                  <div className="admin-panels">
                    <div className="admin-panel">
                      <div className="panel-header">
                        <div>
                          <h3>Bulk Enroll Students</h3>
                          <p>One School ID per line</p>
                        </div>
                      </div>
                      <div style={{ padding: "0 20px 20px" }}>
                        <textarea
                          aria-label="School IDs to enroll, one per line"
                          rows={5}
                          placeholder={"STU-2026-0001\nSTU-2026-0002"}
                          value={bulkSchoolIds}
                          onChange={(e) => setBulkSchoolIds(e.target.value)}
                          style={{
                            width: "100%", border: "1.5px solid var(--line)",
                            borderRadius: "var(--radius-sm)", padding: "10px 14px",
                            fontSize: 14, fontFamily: "inherit", resize: "vertical",
                          }}
                        />
                        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={bulkEnrollVoters}
                            disabled={!bulkSchoolIds.trim()}
                          >
                            <UserPlus size={14} /> Enroll
                          </button>
                          {bulkSummary && (
                            <span role="status" style={{ fontSize: 12, color: "var(--muted)" }}>
                              {bulkSummary}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "white", border: "1px solid var(--line)",
                      borderRadius: "var(--radius)", overflow: "hidden", marginTop: 20,
                    }}
                  >
                    <div
                      style={{
                        display: "flex", gap: 12, alignItems: "center",
                        padding: "16px 20px", borderBottom: "1px solid var(--line)",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="search"
                        aria-label="Search voters by school ID or name"
                        placeholder="Search School ID or name…"
                        value={voterSearch}
                        onChange={(e) => setVoterSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void loadVoters(1);
                        }}
                        style={{
                          height: 38, border: "1.5px solid var(--line)",
                          borderRadius: "var(--radius-sm)", padding: "0 12px",
                          fontSize: 13, flex: 1, minWidth: 180,
                        }}
                      />
                      <select
                        aria-label="Filter voters by status"
                        value={voterStatusFilter}
                        onChange={(e) => setVoterStatusFilter(e.target.value)}
                        style={{
                          height: 38, border: "1.5px solid var(--line)",
                          borderRadius: "var(--radius-sm)", padding: "0 10px", fontSize: 13,
                        }}
                      >
                        <option value="">All statuses</option>
                        <option value="eligible">Eligible</option>
                        <option value="voted">Voted</option>
                        <option value="ineligible">Ineligible</option>
                      </select>
                      <button className="btn btn-outline btn-sm" onClick={() => void loadVoters(1)}>
                        Apply
                      </button>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        {votersPagination.total} voters
                      </span>
                    </div>

                    {votersLoading ? (
                      <div style={{ textAlign: "center", padding: 40 }}>
                        <span style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</span>
                      </div>
                    ) : voters.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 40 }}>
                        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
                          No voters found for this filter.
                        </p>
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="candidate-table" style={{ width: "100%" }}>
                          <thead>
                            <tr>
                              <th>School ID</th>
                              <th>Name</th>
                              <th>Grade</th>
                              <th>Status</th>
                              <th style={{ width: 110 }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {voters.map((v) => {
                              const voted = !!v.votedAt;
                              const statusLabel = voted
                                ? "Voted"
                                : v.eligible
                                  ? "Eligible"
                                  : "Ineligible";
                              return (
                                <tr key={v.voterId}>
                                  <td><strong>{v.schoolId}</strong></td>
                                  <td>{v.name}</td>
                                  <td>{v.grade || "—"}</td>
                                  <td>
                                    <span
                                      style={{
                                        display: "inline-flex", alignItems: "center", gap: 4,
                                        background: voted
                                          ? "var(--success-bg)"
                                          : v.eligible
                                            ? "#eef4ff"
                                            : "#f0f0f0",
                                        color: voted
                                          ? "var(--success)"
                                          : v.eligible
                                            ? "var(--persian-blue)"
                                            : "var(--muted)",
                                        padding: "3px 10px", borderRadius: 10,
                                        fontSize: 10, fontWeight: 700,
                                      }}
                                    >
                                      {statusLabel}
                                    </span>
                                  </td>
                                  <td>
                                    {!voted && v.eligible && (
                                      <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => void markVoterIneligible(v.voterId)}
                                        title="Mark ineligible"
                                      >
                                        <X size={14} /> Ineligible
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", padding: "12px 20px",
                        borderTop: "1px solid var(--line)",
                      }}
                    >
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={votersPagination.page <= 1 || votersLoading}
                        onClick={() => void loadVoters(votersPagination.page - 1)}
                      >
                        Previous
                      </button>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        Page {votersPagination.page} of {votersPagination.totalPages}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={
                          votersPagination.page >= votersPagination.totalPages ||
                          votersLoading
                        }
                        onClick={() => void loadVoters(votersPagination.page + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Stats Tab */}
          {tab === "stats" && (
            <>
              {stats ? (
                <>
                  <div className="stat-grid">
                    <div className="stat-card">
                      <div className="stat-card-icon"><Users /></div>
                      <small>Total Eligible</small>
                      <strong>{stats.stats.totalEligible.toLocaleString()}</strong>
                      <p>Registered voters</p>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card-icon"><ClipboardCheck /></div>
                      <small>Votes Cast</small>
                      <strong>{stats.stats.totalVotes.toLocaleString()}</strong>
                      <p>Ballots submitted</p>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card-icon"><BarChart3 /></div>
                      <small>Turnout</small>
                      <strong>{stats.stats.turnout}%</strong>
                      <p>Participation rate</p>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card-icon"><Flag /></div>
                      <small>Positions</small>
                      <strong>{stats.positions.length}</strong>
                      <p>Up for election</p>
                    </div>
                  </div>

                  {stats.positions.map((p) => {
                    const maxVotes = Math.max(1, ...p.candidates.map((c) => c.votes));
                    return (
                      <div
                        key={p.position.id}
                        style={{
                          background: "white", border: "1px solid var(--line)",
                          borderRadius: "var(--radius)", padding: 24, marginBottom: 20,
                        }}
                      >
                        <h3 style={{
                          font: "600 18px Georgia, serif",
                          color: "var(--deep-navy)",
                          margin: "0 0 16px",
                          paddingBottom: 10,
                          borderBottom: "1px solid var(--line)",
                        }}>
                          {p.position.name}
                        </h3>
                        {p.candidates.length === 0 ? (
                          <p style={{ color: "var(--muted)", fontSize: 13 }}>
                            No candidates for this position.
                          </p>
                        ) : (
                          p.candidates.map((c) => (
                            <div className="result-bar-item" key={c.id} style={{ marginBottom: 14 }}>
                              <div className="result-bar-label">
                                <div className="result-bar-name">{c.name}</div>
                                <div className="result-bar-grade">{c.grade}</div>
                              </div>
                              <div className="result-bar-track">
                                <div
                                  className="result-bar-fill"
                                  style={{ width: `${(c.votes / maxVotes) * 100}%` }}
                                />
                              </div>
                              <div className="result-bar-votes">
                                {c.votes}
                                <small>votes</small>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div style={{ textAlign: "center", padding: 60 }}>
                  <p style={{ color: "var(--muted)" }}>No statistics available yet.</p>
                </div>
              )}
            </>
          )}

          {/* Settings Tab */}
          {tab === "settings" && activeElection && (
            <>
              <div style={{
                background: "white", border: "1px solid var(--line)",
                borderRadius: "var(--radius)", padding: 28, marginBottom: 20,
              }}>
                <h3 style={{ font: "600 18px Georgia, serif", color: "var(--deep-navy)", margin: "0 0 20px" }}>
                  Election Settings
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "16px 0", borderBottom: "1px solid var(--line)",
                  }}>
                    <div>
                      <strong style={{ fontSize: 14, display: "block" }}>Election Status</strong>
                      <small style={{ color: "var(--muted)", fontSize: 12 }}>
                        Current state: <strong style={{ color: "var(--persian-blue)" }}>{activeElection.state.toUpperCase()}</strong>
                      </small>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {activeElection.state === "draft" && (
                        <button className="btn btn-primary btn-sm" onClick={() => toggleElectionState("open")}>
                          Open Election
                        </button>
                      )}
                      {activeElection.state === "open" && (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => toggleElectionState("closed")}>
                            Close
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => toggleElectionState("published")}>
                            Publish Results
                          </button>
                        </>
                      )}
                      {activeElection.state === "closed" && (
                        <button className="btn btn-primary btn-sm" onClick={() => toggleElectionState("published")}>
                          Publish Results
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "16px 0", borderBottom: "1px solid var(--line)",
                  }}>
                    <div>
                      <strong style={{ fontSize: 14, display: "block" }}>Live Results</strong>
                      <small style={{ color: "var(--muted)", fontSize: 12 }}>
                        {activeElection.showLiveResults
                          ? "Students can see live vote counts after voting"
                          : "Results are hidden until election closes"}
                      </small>
                    </div>
                    <button
                      className={`btn btn-sm ${activeElection.showLiveResults ? "btn-outline" : "btn-primary"}`}
                      onClick={() => toggleLiveResults(!activeElection.showLiveResults)}
                    >
                      {activeElection.showLiveResults ? <><EyeOff /> Disable</> : <><Eye /> Enable</>}
                    </button>
                  </div>

                  <div style={{ padding: "16px 0" }}>
                    <strong style={{ fontSize: 14, display: "block", marginBottom: 8 }}>Election Details</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        <small style={{ color: "var(--muted)", fontSize: 10, letterSpacing: 0.5 }}>TITLE</small>
                        <div style={{ fontSize: 14, marginTop: 4 }}>{activeElection.title}</div>
                      </div>
                      <div>
                        <small style={{ color: "var(--muted)", fontSize: 10, letterSpacing: 0.5 }}>SCHOOL YEAR</small>
                        <div style={{ fontSize: 14, marginTop: 4 }}>{activeElection.schoolYear}</div>
                      </div>
                      <div>
                        <small style={{ color: "var(--muted)", fontSize: 10, letterSpacing: 0.5 }}>STARTS</small>
                        <div style={{ fontSize: 14, marginTop: 4 }}>
                          {new Date(activeElection.startsAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <small style={{ color: "var(--muted)", fontSize: 10, letterSpacing: 0.5 }}>ENDS</small>
                        <div style={{ fontSize: 14, marginTop: 4 }}>
                          {new Date(activeElection.endsAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Privacy Notice */}
              <div style={{
                background: "rgba(27, 44, 193, 0.04)", border: "1px solid var(--icy-blue)",
                borderRadius: "var(--radius)", padding: 22, display: "flex", gap: 14,
              }}>
                <ShieldCheck style={{ width: 28, height: 28, color: "var(--persian-blue)", flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: 13, color: "var(--deep-navy)", display: "block" }}>
                    Vote Privacy Guarantee
                  </strong>
                  <p style={{ fontSize: 12, color: "var(--dusk-blue)", margin: "4px 0 0", lineHeight: 1.5 }}>
                    The ballot table deliberately has no voter ID column. Administrators can see
                    how many students voted, but cannot determine which candidate any specific
                    student voted for. This separation is enforced at the database level.
                  </p>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Add Candidate Modal */}
      {showAddCandidate && (
        <div className="modal-scrim" onClick={() => setShowAddCandidate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Candidate</h2>

            <div className="auth-form">
              <div className="form-group">
                <label>Candidate Name</label>
                <input
                  type="text"
                  placeholder="e.g. Jordan Smith"
                  value={newCandidate.name}
                  onChange={(e) =>
                    setNewCandidate({ ...newCandidate, name: e.target.value })
                  }
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Grade / Year</label>
                  <input
                    type="text"
                    placeholder="e.g. Grade 11"
                    value={newCandidate.grade}
                    onChange={(e) =>
                      setNewCandidate({ ...newCandidate, grade: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Position</label>
                  <select
                    value={newCandidate.positionId}
                    onChange={(e) =>
                      setNewCandidate({ ...newCandidate, positionId: e.target.value })
                    }
                    style={{
                      height: 44, border: "1.5px solid var(--line)", borderRadius: "var(--radius-sm)",
                      padding: "0 14px", fontSize: 14, background: "#fafbfe",
                    }}
                  >
                    <option value="">Select position...</option>
                    {availablePositions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Introduction</label>
                <input
                  type="text"
                  placeholder="Brief introduction (e.g. Debate captain)"
                  value={newCandidate.introduction}
                  onChange={(e) =>
                    setNewCandidate({ ...newCandidate, introduction: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Platform / Description</label>
                <textarea
                  placeholder="What is their platform? What will they do for students?"
                  value={newCandidate.platform}
                  onChange={(e) =>
                    setNewCandidate({ ...newCandidate, platform: e.target.value })
                  }
                  rows={3}
                  style={{
                    border: "1.5px solid var(--line)", borderRadius: "var(--radius-sm)",
                    padding: "10px 14px", fontSize: 14, resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddCandidate(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={addCandidate}
                disabled={!newCandidate.name || !newCandidate.positionId}
              >
                <Plus /> Add Candidate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Election Modal */}
      {showCreateElection && (
        <div className="modal-scrim" onClick={() => setShowCreateElection(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create Election</h2>

            <div className="auth-form">
              <div className="form-group">
                <label htmlFor="election-title">Title</label>
                <input
                  id="election-title"
                  type="text"
                  placeholder="e.g. Student Council Election 2026-2027"
                  value={newElection.title}
                  onChange={(e) => setNewElection({ ...newElection, title: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="election-year">School Year</label>
                  <input
                    id="election-year"
                    type="text"
                    placeholder="e.g. 2026-2027"
                    value={newElection.schoolYear}
                    onChange={(e) =>
                      setNewElection({ ...newElection, schoolYear: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="election-start">Starts</label>
                  <input
                    id="election-start"
                    type="datetime-local"
                    value={newElection.startsAt}
                    onChange={(e) =>
                      setNewElection({ ...newElection, startsAt: e.target.value })
                    }
                    style={{
                      height: 44, border: "1.5px solid var(--line)",
                      borderRadius: "var(--radius-sm)", padding: "0 14px", fontSize: 14,
                    }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="election-end">Ends</label>
                  <input
                    id="election-end"
                    type="datetime-local"
                    value={newElection.endsAt}
                    onChange={(e) => setNewElection({ ...newElection, endsAt: e.target.value })}
                    style={{
                      height: 44, border: "1.5px solid var(--line)",
                      borderRadius: "var(--radius-sm)", padding: "0 14px", fontSize: 14,
                    }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="election-desc">Description (optional)</label>
                <textarea
                  id="election-desc"
                  rows={2}
                  placeholder="What is this election for?"
                  value={newElection.description}
                  onChange={(e) =>
                    setNewElection({ ...newElection, description: e.target.value })
                  }
                  style={{
                    border: "1.5px solid var(--line)", borderRadius: "var(--radius-sm)",
                    padding: "10px 14px", fontSize: 14, fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreateElection(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={createElection}
                disabled={
                  !newElection.title ||
                  !newElection.schoolYear ||
                  !newElection.startsAt ||
                  !newElection.endsAt
                }
              >
                <Calendar size={16} /> Create Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
