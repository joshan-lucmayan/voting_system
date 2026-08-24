"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Fingerprint,
  Lock,
  LogOut,
  ShieldCheck,
  Vote,
  X,
  AlertTriangle,
} from "lucide-react";

type Position = {
  id: string;
  name: string;
  description: string;
  displayOrder: number;
};

type Candidate = {
  id: string;
  name: string;
  grade: string;
  introduction: string;
  platform: string;
  imageUrl: string;
  positionId: string;
};

type Election = {
  id: string;
  title: string;
  description: string;
  schoolYear: string;
  state: string;
  showLiveResults: boolean;
  startsAt: string;
  endsAt: string;
};

type VoteStatus = {
  hasVoted: boolean;
  isEligible: boolean;
  isOpen: boolean;
  election: Election;
};

type ResultCandidate = {
  id: string;
  name: string;
  grade: string;
  imageUrl: string;
  votes: number;
};

type ResultPosition = {
  position: { id: string; name: string; description: string };
  candidates: ResultCandidate[];
};

type View = "ballot" | "review" | "confirmation" | "results";

type UserInfo = {
  id: string;
  firstName: string;
  lastName: string;
  schoolId: string;
  email: string;
  grade: string;
  role: string;
};

export default function VoteArea({
  user,
  status,
  positions,
  candidates,
}: {
  user: UserInfo;
  status: VoteStatus;
  positions: Position[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>("ballot");
  const [receipt, setReceipt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Results state
  const [results, setResults] = useState<ResultPosition[]>([]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const toggleSelection = (positionId: string, candidateId: string) => {
    setSelections((prev) => ({
      ...prev,
      [positionId]: prev[positionId] === candidateId ? "" : candidateId,
    }));
  };

  const completedCount = Object.values(selections).filter(Boolean).length;

  const reviewData = useMemo(() => {
    return positions.map((p) => {
      const cid = selections[p.id];
      const candidate = cid ? candidates.find((c) => c.id === cid) : null;
      return { position: p, candidate };
    });
  }, [positions, candidates, selections]);

  const submitVote = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: Object.fromEntries(
            Object.entries(selections)
              .filter(([, v]) => v)
              .map(([k, v]) => [k, [v]]),
          ),
          electionId: status?.election.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to submit ballot.");
        setSubmitting(false);
        return;
      }

      setReceipt(data.receiptCode);
      setView("confirmation");
    } catch {
      setError("A network error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  const fetchResults = async () => {
    try {
      const res = await fetch(`/api/results/${status.election.id}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setView("results");
      }
    } catch {
      setError("Could not load results. Please try again.");
    }
  };

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`
    : "";

  // Election not open yet (scheduled)
  if (status.election.state === "scheduled" && !status.isOpen) {
    return (
      <div className="app-shell">
        <TopBar user={user} initials={initials} onLogout={handleLogout} />
        <div className="app-body">
          <div className="status-banner closed">
            <Clock />
            <span>
              This election has not started yet. Voting opens on{" "}
              {new Date(status.election.startsAt).toLocaleString()}.
            </span>
          </div>

          <div className="election-info">
            <h2>{status.election.title}</h2>
            <p>{status.election.description}</p>
            <div className="election-meta">
              <div className="election-meta-item">
                <span>
                  <small>SCHOOL YEAR</small>
                  <strong>{status.election.schoolYear}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Published results available to everyone
  if (
    status.election.state === "published" &&
    view !== "results" &&
    !status.hasVoted
  ) {
    return (
      <div className="app-shell">
        <TopBar user={user} initials={initials} onLogout={handleLogout} />
        <div className="app-body">
          <div className="election-info">
            <h2>{status.election.title}</h2>
            <p>{status.election.description}</p>
          </div>

          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              background: "white",
              borderRadius: "var(--radius)",
              border: "1px solid var(--line)",
            }}
          >
            <CheckCircle
              style={{
                width: 48,
                height: 48,
                color: "var(--success)",
                marginBottom: 16,
              }}
            />
            <h2
              style={{
                font: "600 22px Georgia, serif",
                color: "var(--deep-navy)",
                margin: "0 0 8px",
              }}
            >
              Results have been published
            </h2>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 24px" }}>
              The results of this election are now official.
            </p>
            <button className="btn btn-primary" onClick={fetchResults}>
              <Eye /> View Published Results
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Already voted
  if (status.hasVoted && view !== "confirmation" && view !== "results") {
    return (
      <div className="app-shell">
        <TopBar
          user={user}
          initials={initials}
          onLogout={handleLogout}
        />
        <div className="app-body">
          <div className="status-banner voted">
            <CheckCircle />
            <span>You have already voted in this election.</span>
          </div>

          <div className="election-info">
            <h2>{status.election.title}</h2>
            <p>{status.election.description}</p>
            <div className="election-meta">
              <div className="election-meta-item">
                <span>
                  <small>SCHOOL YEAR</small>
                  <strong>{status.election.schoolYear}</strong>
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              background: "white",
              borderRadius: "var(--radius)",
              border: "1px solid var(--line)",
            }}
          >
            <Fingerprint
              style={{
                width: 48,
                height: 48,
                color: "var(--dusk-blue)",
                marginBottom: 16,
              }}
            />
            <h2
              style={{
                font: "600 22px Georgia, serif",
                color: "var(--deep-navy)",
                margin: "0 0 8px",
              }}
            >
              Thank you for voting!
            </h2>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 24px" }}>
              Your ballot has been securely recorded. Your selections remain private and anonymous.
            </p>

            {status.election.showLiveResults ? (
              <button className="btn btn-primary" onClick={fetchResults}>
                <Eye /> View Live Results
              </button>
            ) : (
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                Results will be available once the election closes and the administrator publishes them.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Not eligible
  if (!status.isEligible) {
    return (
      <div className="app-shell">
        <TopBar
          user={user}
          initials={initials}
          onLogout={handleLogout}
        />
        <div className="app-body">
          <div className="status-banner error">
            <AlertTriangle />
            <span>You are not eligible to vote in this election.</span>
          </div>
        </div>
      </div>
    );
  }

  // Election not open
  if (!status.isOpen) {
    return (
      <div className="app-shell">
        <TopBar
          user={user}
          initials={initials}
          onLogout={handleLogout}
        />
        <div className="app-body">
          <div className="status-banner closed">
            <Clock />
            <span>Voting for this election has ended.</span>
          </div>

          <div className="election-info">
            <h2>{status.election.title}</h2>
            <p>{status.election.description}</p>
          </div>
        </div>
      </div>
    );
  }

  // Confirmation page
  if (view === "confirmation") {
    return (
      <div className="app-shell">
        <TopBar
          user={user}
          initials={initials}
          onLogout={handleLogout}
        />
        <div className="app-body">
          <div className="confirmation-page">
            <div className="success-icon">
              <Check />
            </div>
            <h1>Vote Submitted Successfully</h1>
            <p>Your ballot has been securely recorded.</p>

            <div className="receipt-box">
              <div className="receipt-label">CONFIRMATION CODE</div>
              <div className="receipt-code">{receipt}</div>
              <div className="receipt-note">
                Keep this code for your records. It confirms submission, not your
                selections.
              </div>
            </div>

            <div className="privacy-box">
              <Fingerprint />
              <div>
                <strong>Your vote remains private</strong>
                <p>
                  The school can confirm that you voted, but no one can see who
                  you voted for.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {status?.election.showLiveResults && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    fetchResults();
                  }}
                >
                  <Eye /> View Live Results
                </button>
              )}
              <button
                className="btn btn-outline"
                onClick={() => setView("ballot")}
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Results view
  if (view === "results") {
    const maxVotes = Math.max(
      1,
      ...results.flatMap((r) => r.candidates.map((c) => c.votes)),
    );

    return (
      <div className="app-shell">
        <TopBar
          user={user}
          initials={initials}
          onLogout={handleLogout}
        />
        <div className="app-body">
          <button
            className="btn btn-ghost"
            onClick={() => setView("ballot")}
            style={{ marginBottom: 20 }}
          >
            <ChevronLeft /> Back
          </button>

          <div className="results-page">
            <h1>Live Election Results</h1>

            {results.length === 0 ? (
              <div className="locked-results">
                <Lock />
                <h2>No votes recorded yet</h2>
                <p>Results will appear here once votes have been cast.</p>
              </div>
            ) : (
              results.map((r) => (
                <div className="result-position" key={r.position.id}>
                  <h3>{r.position.name}</h3>
                  {r.candidates.map((c) => (
                    <div className="result-bar-item" key={c.id}>
                      <div className="result-bar-label">
                        <div className="result-bar-name">{c.name}</div>
                        <div className="result-bar-grade">{c.grade}</div>
                      </div>
                      <div className="result-bar-track">
                        <div
                          className="result-bar-fill"
                          style={{
                            width: `${maxVotes > 0 ? (c.votes / maxVotes) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="result-bar-votes">
                        {c.votes}
                        <small>votes</small>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Review page
  if (view === "review") {
    return (
      <div className="app-shell">
        <TopBar
          user={user}
          initials={initials}
          onLogout={handleLogout}
        />
        <div className="app-body">
          <div className="review-page">
            <button
              className="btn btn-ghost"
              onClick={() => setView("ballot")}
              style={{ marginBottom: 20 }}
            >
              <ChevronLeft /> Back to ballot
            </button>

            <div className="review-header">
              <span
                className="section-eyebrow"
                style={{ color: "var(--persian-blue)" }}
              >
                REVIEW YOUR BALLOT
              </span>
              <h1>Review your selections</h1>
              <p>
                Take a moment to make sure every selection is correct.
              </p>
            </div>

            <div className="warning-box">
              <AlertTriangle />
              <div>
                <strong>
                  Your vote cannot be changed after submission.
                </strong>
                <p>
                  Once submitted, your ballot is final and securely recorded.
                </p>
              </div>
            </div>

            <div className="review-list">
              {reviewData.map(({ position, candidate }) => (
                <div className="review-item" key={position.id}>
                  <div>
                    <div className="review-position-label">POSITION</div>
                    <div className="review-position-name">
                      {position.name}
                    </div>
                  </div>
                  <div className="review-choice">
                    <div className="review-choice-img">
                      {candidate?.imageUrl && (
                        <img
                          src={candidate.imageUrl}
                          alt=""
                          width={44}
                          height={44}
                        />
                      )}
                    </div>
                    <div>
                      <div className="review-choice-name">
                        {candidate?.name ?? "—"}
                      </div>
                      <div className="review-choice-grade">
                        {candidate?.grade}
                      </div>
                    </div>
                  </div>
                  <button
                    className="review-change-btn"
                    onClick={() => setView("ballot")}
                  >
                    Change
                  </button>
                </div>
              ))}
            </div>

            <label className="confirm-box">
              <input
                type="checkbox"
                onChange={(e) => {
                  if (e.target.checked) {
                    // Enable submit
                  }
                }}
                id="confirm-check"
              />
              <span className="confirm-check">
                <Check size={14} id="confirm-icon" />
              </span>
              <div>
                <strong>
                  I confirm these are my final selections.
                </strong>
                <small>
                  I understand that my vote cannot be changed after submission.
                </small>
              </div>
            </label>

            {error && <div className="form-error" style={{ marginTop: 14 }}>{error}</div>}

            <div className="submit-row">
              <div className="ballot-footer-info">
                <Lock />
                <div>
                  <strong>Secure &amp; anonymous</strong>
                  <small>
                    Your identity is separated from your ballot.
                  </small>
                </div>
              </div>
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => {
                  const checkbox = document.getElementById(
                    "confirm-check",
                  ) as HTMLInputElement;
                  if (checkbox?.checked) {
                    submitVote();
                  }
                }}
              >
                {submitting
                  ? "Submitting securely..."
                  : "Submit my vote"}
                {!submitting && <Lock />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ballot view (default)
  return (
    <div className="app-shell">
      <TopBar user={user} initials={initials} onLogout={handleLogout} />
      <div className="app-body">
        <div className="status-banner open">
          <Vote />
          <span>Voting is Open — Select your candidate</span>
        </div>

        <div className="election-info">
          <h2>{status.election.title}</h2>
          <p>{status.election.description}</p>
          <div className="election-meta">
            <div className="election-meta-item">
              <Clock />
              <span>
                <small>SCHOOL YEAR</small>
                <strong>{status.election.schoolYear}</strong>
              </span>
            </div>
          </div>
        </div>

        {positions.map((position, index) => {
          const posCandidates = candidates.filter(
            (c) => c.positionId === position.id,
          );

          return (
            <div className="position-section" key={position.id}>
              <div className="position-heading">
                <div className="position-number">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <h3>{position.name}</h3>
                  <p>{position.description}</p>
                </div>
              </div>

              <div className="candidate-grid">
                {posCandidates.map((candidate) => {
                  const isSelected =
                    selections[position.id] === candidate.id;
                  return (
                    <div
                      className={`candidate-card ${isSelected ? "selected" : ""}`}
                      key={candidate.id}
                      onClick={() =>
                        toggleSelection(position.id, candidate.id)
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleSelection(position.id, candidate.id);
                        }
                      }}
                    >
                      <div className="candidate-photo">
                        <Image
                          src={candidate.imageUrl}
                          alt={`${candidate.name}, candidate for ${position.name}`}
                          fill
                          sizes="(max-width: 700px) 100vw, 320px"
                          style={{ objectFit: "cover" }}
                        />
                        <span className="position-tag">
                          {position.name}
                        </span>
                        <span className="select-indicator">
                          {isSelected && <Check size={16} />}
                        </span>
                      </div>
                      <div className="candidate-body">
                        <h3 className="candidate-name">
                          {candidate.name}
                        </h3>
                        <div className="candidate-grade">
                          {candidate.grade}
                        </div>
                        <div className="candidate-intro">
                          {candidate.introduction}
                        </div>
                        <div className="candidate-platform">
                          <div className="candidate-platform-label">
                            PLATFORM
                          </div>
                          <p className="candidate-platform-text">
                            {candidate.platform}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="candidate-selected-badge">
                            <Check /> Selected
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="ballot-footer">
          <div className="ballot-footer-info">
            <ShieldCheck />
            <div>
              <strong>Your ballot is private</strong>
              <small>
                Your selections are not connected to your identity.
              </small>
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={completedCount !== positions.length}
            onClick={() => setView("review")}
          >
            Review ballot <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}

function TopBar({
  user,
  initials,
  onLogout,
}: {
  user: UserInfo;
  initials: string;
  onLogout: () => void;
}) {
  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <div className="mini-crest">N</div>
          <strong>Northfield Academy</strong>
        </div>
      </div>
      <div className="topbar-right">
        <div className="topbar-user">
          <div className="topbar-avatar">{initials}</div>
          <div className="topbar-user-info">
            <strong>
              {user.firstName} {user.lastName}
            </strong>
            <span>{user.schoolId}</span>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onLogout}
          title="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
