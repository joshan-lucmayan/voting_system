import Link from "next/link";
import {
  Check,
  CheckCircle,
  Clock,
  Eye,
  ShieldCheck,
  Vote,
  Lock,
  Users,
  ChevronRight,
  Shield,
  FileCheck,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="homepage">
      {/* Header */}
      <header className="home-header">
        <div className="home-brand">
          <div className="home-logo">N</div>
          <div className="home-brand-text">
            <strong>School Council Voting</strong>
            <span>Northfield Academy</span>
          </div>
        </div>
        <nav className="home-nav">
          <Link href="/login" className="btn btn-ghost">
            Log In
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm">
            Student Signup
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="pulse" />
            <span>SECURE ELECTION PLATFORM</span>
          </div>
          <h1 className="hero-title">
            Your vote shapes<br />
            our school&apos;s future
          </h1>
          <p className="hero-subtitle">
            A secure, anonymous, and transparent platform for student council
            elections. Every voice counts, every vote is protected.
          </p>
          <div className="hero-actions">
            <Link href="/signup" className="btn btn-primary">
              <Vote /> Create your account
            </Link>
            <Link href="/login" className="btn btn-white">
              <Lock /> I already have an account
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="info-section">
        <div className="section-header">
          <p className="section-eyebrow">Simple &amp; Secure</p>
          <h2 className="section-title">How voting works</h2>
          <p className="section-desc">
            Four steps to make your voice heard. The entire process takes less
            than 3 minutes.
          </p>
        </div>
        <div className="steps-list">
          <div className="step-item">
            <div className="step-number">1</div>
            <h4>Create Account</h4>
            <p>Sign up with your school ID and email</p>
          </div>
          <div className="step-item">
            <div className="step-number">2</div>
            <h4>Select Candidates</h4>
            <p>Choose your preferred candidate for each position</p>
          </div>
          <div className="step-item">
            <div className="step-number">3</div>
            <h4>Review &amp; Confirm</h4>
            <p>Double-check your selections before submitting</p>
          </div>
          <div className="step-item">
            <div className="step-number">4</div>
            <h4>Submit Securely</h4>
            <p>Your vote is encrypted and recorded anonymously</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="info-section" style={{ paddingTop: 0 }}>
        <div className="section-header">
          <p className="section-eyebrow">Why This Platform</p>
          <h2 className="section-title">Built for school elections</h2>
          <p className="section-desc">
            Designed with simplicity, security, and student privacy in mind.
          </p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon blue">
              <ShieldCheck />
            </div>
            <h3>Anonymous Ballots</h3>
            <p>
              Your identity is never connected to your vote. Administrators
              cannot see who you voted for.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon navy">
              <Lock />
            </div>
            <h3>Secure Authentication</h3>
            <p>
              Server-side session management with encrypted passwords. Your
              account is protected at every step.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon purple">
              <CheckCircle />
            </div>
            <h3>One Vote Per Student</h3>
            <p>
              Each student can only vote once per election. Duplicate votes are
              prevented at the database level.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon blue">
              <Eye />
            </div>
            <h3>Live Results</h3>
            <p>
              When enabled by administrators, see real-time vote counts after
              you&apos;ve cast your ballot.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon navy">
              <Users />
            </div>
            <h3>Student-First Design</h3>
            <p>
              No social features, no distractions. A focused platform built
              purely for elections.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon purple">
              <FileCheck />
            </div>
            <h3>Verifiable Receipt</h3>
            <p>
              Receive a confirmation code after voting that proves your ballot
              was recorded.
            </p>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="trust-section">
        <div className="section-header" style={{ color: "white" }}>
          <p className="section-eyebrow" style={{ color: "var(--icy-blue)" }}>
            Security &amp; Privacy
          </p>
          <h2 className="section-title" style={{ color: "white" }}>
            Your trust is our priority
          </h2>
        </div>
        <div className="trust-grid">
          <div className="trust-item">
            <Shield />
            <h4>Encrypted Data</h4>
            <p>Passwords are hashed with bcrypt. Sessions are secure and server-managed.</p>
          </div>
          <div className="trust-item">
            <Lock />
            <h4>Privacy by Design</h4>
            <p>Ballots have no voter ID. Individual votes cannot be traced back to students.</p>
          </div>
          <div className="trust-item">
            <Check />
            <h4>Server-Side Validation</h4>
            <p>All votes are validated on the server. Frontend manipulation is impossible.</p>
          </div>
          <div className="trust-item">
            <Eye />
            <h4>Audit Trail</h4>
            <p>Every election action is logged for accountability without exposing voter identity.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="info-section" style={{ textAlign: "center" }}>
        <h2 className="section-title">Ready to make your voice heard?</h2>
        <p className="section-desc" style={{ marginBottom: 30 }}>
          Create your account and participate in the current school election.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn btn-primary">
            <Vote /> Sign Up to Vote
          </Link>
          <Link href="/login" className="btn btn-outline">
            <Lock /> Log In
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <span>© 2026 Northfield Academy. School Council Voting System.</span>
        <div className="home-footer-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Election Rules</a>
          <a href="#">Accessibility</a>
        </div>
      </footer>
    </div>
  );
}
