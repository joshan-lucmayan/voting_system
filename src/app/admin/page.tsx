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

type AdminTab = "dashboard" | "candidates" | "stats" | "settings";

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [elections, setElections] = useState<Election[]>([]);
  const [candidates, setCandidates] = useState<CandidateData[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const activeElection = elections[0]; // Use the first election

  const fetchAdminData = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();

      if (!meData.user || meData.user.role !== "admin") {
        router.push("/login");
        return;
      }
      setUser(meData.user);

      const [elecRes, candRes] = await Promise.all([
        fetch("/api/admin/elections"),
        activeElection
          ? fetch(`/api/admin/candidates?electionId=${activeElection.id}`)
          : Promise.resolve({ json: () => ({ candidates: [] }) }),
      ]);

      const elecData = await elecRes.json();
      setElections(elecData.elections || []);

      const candData = await candRes.json();
      setCandidates(candData.candidates || []);

      if (activeElection) {
        const statsRes = await fetch(
          `/api/admin/stats/${activeElection.id}`,
        );
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      }
    } catch {
      // handle silently
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

  const toggleLiveResults = async (showLive: boolean) => {
    if (!activeElection) return;
    try {
      await fetch("/api/admin/elections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          electionId: activeElection.id,
          showLiveResults: showLive,
        }),
      });
      fetchAdminData();
    } catch {
      // handle silently
    }
  };

  const toggleElectionState = async (newState: string) => {
    if (!activeElection) return;
    try {
      await fetch("/api/admin/elections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          electionId: activeElection.id,
          state: newState,
        }),
      });
      fetchAdminData();
    } catch {
      // handle silently
    }
  };

  const addCandidate = async () => {
    if (!newCandidate.name || !newCandidate.positionId) return;
    try {
      await fetch("/api/admin/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCandidate),
      });
      setShowAddCandidate(false);
      setNewCandidate({
        name: "",
        grade: "",
        introduction: "",
        platform: "",
        positionId: "",
      });
      fetchAdminData();
    } catch {
      // handle silently
    }
  };

  const deleteCandidate = async (id: string) => {
    if (!confirm("Are you sure you want to remove this candidate?")) return;
    try {
      await fetch(`/api/admin/candidates/${id}`, { method: "DELETE" });
      fetchAdminData();
    } catch {
      // handle silently
    }
  };

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="loading-page">
        <p style={{ color: "var(--muted)" }}>Redirecting...</p>
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
              {tab === "settings" && "Election Settings"}
            </h2>
          </div>
          <div className="admin-topbar-actions">
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              <LogOut size={16} /> Log out
            </button>
          </div>
        </header>

        <main className="admin-main">
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
                      onClick={() => setShowAddCandidate(true)}
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
                <button className="btn btn-primary" onClick={() => setShowAddCandidate(true)}>
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
                  <button className="btn btn-primary" onClick={() => setShowAddCandidate(true)}>
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
                    {candidates.length > 0 &&
                      [...new Set(candidates.map((c) => c.positionId))].map(
                        (pid) => (
                          <option key={pid} value={pid}>
                            {candidates.find((c) => c.positionId === pid)?.positionName}
                          </option>
                        ),
                      )}
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
    </div>
  );
}
