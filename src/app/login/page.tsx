"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [schoolId, setSchoolId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: schoolId.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.");
        setLoading(false);
        return;
      }

      // Route based on role
      if (data.user.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/vote");
      }
    } catch {
      setError("A network error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="crest" style={{ width: 40, height: 46 }}>N</div>
          <div className="auth-logo-text">
            <strong>School Council Voting</strong>
            <span>Northfield Academy</span>
          </div>
        </div>

        <h1>Welcome Back</h1>
        <p className="subtitle">
          Sign in to participate in elections
        </p>

        {error && <div className="form-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="schoolId">School ID</label>
            <input
              id="schoolId"
              type="text"
              placeholder="e.g. STU-2026-1842"
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setError("");
              }}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                required
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  padding: 4,
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: "100%", marginTop: 4 }}
          >
            {loading ? "Signing in..." : "Sign In"}
            {!loading && <LogIn />}
          </button>
        </form>

        <div className="auth-footer">
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
        </div>

        <div
          style={{
            marginTop: 20,
            padding: "14px 16px",
            background: "var(--bg)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          <strong style={{ color: "var(--deep-navy)", display: "block", marginBottom: 4 }}>
            Demo Credentials
          </strong>
          Student: STU-2026-1842 / student123<br />
          Admin: ADM-001 / admin123
        </div>
      </div>
    </div>
  );
}
