import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

/**
 * Minimal .env loader so drizzle-kit (a CLI that does NOT load Next.js
 * env files) resolves the SAME DATABASE_URL the application uses.
 * Precedence: real environment variables win over .env file values.
 */
function loadEnvFile(): void {
  const envPath = new URL("./.env", import.meta.url).pathname;
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. drizzle-kit refuses to guess a database.\n" +
      "Set it in your environment or .env file before running migrations.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
