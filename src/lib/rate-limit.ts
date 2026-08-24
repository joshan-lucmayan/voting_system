/**
 * In-memory sliding-window rate limiter.
 *
 * IMPORTANT: This limiter is intentionally single-process. It lives in the
 * memory of one Node.js server instance, resets when that instance restarts,
 * and is NOT shared across replicas. This matches the approved v1 deployment
 * target (one persistent Node server + PostgreSQL). Do not scale to multiple
 * instances without replacing this module.
 */

export interface RateLimitRule {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum attempts allowed within the window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts remaining in the current window (0 when denied). */
  remaining: number;
  /** Seconds until the oldest attempt exits the window (for Retry-After). */
  retryAfterSeconds: number;
}

const MAX_KEYS = 10_000;

export class SlidingWindowLimiter {
  /** key -> timestamps of attempts inside the window. */
  private buckets = new Map<string, number[]>();
  private lastSweep = Date.now();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Record an attempt for `key` and report whether it is allowed.
   * Denied attempts are still recorded (they consume window capacity),
   * which prevents bypass-by-spam.
   */
  check(key: string): RateLimitResult {
    this.maybeSweep();

    const nowMs = this.now();
    const windowStart = nowMs - this.rule.windowMs;
    const timestamps = (this.buckets.get(key) ?? []).filter(
      (ts) => ts > windowStart,
    );

    if (timestamps.length >= this.rule.max) {
      this.buckets.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((timestamps[0] + this.rule.windowMs - nowMs) / 1000),
        ),
      };
    }

    timestamps.push(nowMs);
    this.buckets.set(key, timestamps);

    // Bound memory: if too many distinct keys exist, evict the
    // least-recently-inserted ones (Map preserves insertion order).
    if (this.buckets.size > MAX_KEYS) {
      let excess = this.buckets.size - MAX_KEYS;
      for (const k of this.buckets.keys()) {
        if (excess-- <= 0) break;
        this.buckets.delete(k);
      }
    }

    return {
      allowed: true,
      remaining: this.rule.max - timestamps.length,
      retryAfterSeconds: 0,
    };
  }

  /** Remove buckets whose windows have fully expired. */
  sweep(): void {
    const cutoff = this.now() - this.rule.windowMs;
    for (const [key, timestamps] of this.buckets) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
        this.buckets.delete(key);
      }
    }
    this.lastSweep = this.now();
  }

  private maybeSweep(): void {
    if (this.now() - this.lastSweep > 60_000) this.sweep();
  }
}

/** Tracks consecutive failures per key to apply progressive delays. */
export class FailureTracker {
  private counts = new Map<string, { count: number; updatedAt: number }>();

  constructor(
    private readonly forgetAfterMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  record(key: string): void {
    const entry = this.counts.get(key);
    this.counts.set(key, {
      count: entry ? entry.count + 1 : 1,
      updatedAt: this.now(),
    });
  }

  reset(key: string): void {
    this.counts.delete(key);
  }

  /**
   * Progressive delay after repeated failures:
   * 3rd failure → 1s, 4th → 2s, 5th → 3s… capped at 10s.
   */
  delayMs(key: string): number {
    const entry = this.counts.get(key);
    if (!entry) return 0;
    if (this.now() - entry.updatedAt > this.forgetAfterMs) {
      this.counts.delete(key);
      return 0;
    }
    if (entry.count < 3) return 0;
    return Math.min((entry.count - 2) * 1_000, 10_000);
  }

  sweep(): void {
    for (const [key, entry] of this.counts) {
      if (this.now() - entry.updatedAt > this.forgetAfterMs) {
        this.counts.delete(key);
      }
    }
  }
}

// ── Configured rules ────────────────────────────────────────

/** LOGIN: 5 attempts / 15 minutes per (IP, School ID). */
export const loginPerIdentifier = new SlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

/** LOGIN: 20 attempts / minute per IP. */
export const loginPerIp = new SlidingWindowLimiter({
  windowMs: 60 * 1000,
  max: 20,
});

/** Progressive failure delay tracker for login (15-minute memory). */
export const loginFailures = new FailureTracker(15 * 60 * 1000);

/** SIGNUP: 5 attempts / hour per IP. */
export const signupPerIp = new SlidingWindowLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
});

/** RECEIPT VERIFY: 10 attempts / minute per authenticated session. */
export const receiptVerifyPerSession = new SlidingWindowLimiter({
  windowMs: 60 * 1000,
  max: 10,
});

/** Best-effort client IP from proxy headers (never persisted or logged). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Periodically sweeps all limiters. Called from instrumentation. */
export function sweepRateLimiters(): void {
  loginPerIdentifier.sweep();
  loginPerIp.sweep();
  signupPerIp.sweep();
  receiptVerifyPerSession.sweep();
  loginFailures.sweep();
}
