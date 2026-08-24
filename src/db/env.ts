import { existsSync, readFileSync } from "node:fs";

/**
 * Minimal .env loader for CLI scripts (seed, admin:create).
 *
 * Scripts are executed outside Next.js, which normally loads .env files.
 * Precedence: real environment variables win over .env file values.
 *
 * NODE_ENV is intentionally NEVER loaded from .env: the production guard
 * in the seed script must depend on the actual runtime environment only,
 * exactly like Next.js, which ignores NODE_ENV inside .env files.
 */
export function loadEnvFile(): void {
  const envPath = new URL("../../.env", import.meta.url).pathname;
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key === "NODE_ENV") continue;
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** Exit with a clear error if DATABASE_URL is not configured. */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "ERROR: DATABASE_URL is not set.\n" +
        "Set it in your environment or .env file before running this command.",
    );
    process.exit(1);
  }
  return url;
}
