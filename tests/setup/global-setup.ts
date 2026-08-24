/**
 * Integration-test global setup.
 *
 * - Creates a dedicated `voting_test` PostgreSQL database (no Docker).
 * - Applies all Drizzle migrations to it via drizzle-kit.
 * - Starts the PRODUCTION Next.js build (`next start`) against that
 *   database on a test port. Requires `npm run build` beforehand.
 *
 * The live/development database is never touched: DATABASE_URL is fully
 * overridden for both migrations and the server process.
 */
import { spawn, execSync } from "node:child_process";
import { Client } from "pg";
import type { GlobalSetupContext } from "vitest/node";
// Vitest does not load Next.js env files; reuse the app's own loader.
import { loadEnvFile } from "../../src/db/env";

loadEnvFile();

const TEST_DB = "voting_test";
const PORT = 3300;
export const BASE_URL = `http://localhost:${PORT}`;

function adminUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set to run integration tests.");
  return url.replace(/\/[^/?]*(\?.*)?$/, "/postgres");
}

function testDbUrl(): string {
  const url = process.env.DATABASE_URL!;
  return url.replace(/\/[^/?]*(\?.*)?$/, `/${TEST_DB}`);
}

async function recreateDatabase() {
  const client = new Client({ connectionString: adminUrl() });
  await client.connect();
  try {
    await client.query(
      `drop database if exists ${TEST_DB} with (force)`,
    );
    await client.query(`create database ${TEST_DB}`);
  } finally {
    await client.end();
  }
}

function runMigrations() {
  execSync("npx drizzle-kit migrate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDbUrl() },
    stdio: "inherit",
  });
}

export async function setup(ctx: GlobalSetupContext) {
  await recreateDatabase();
  runMigrations();

  const server = spawn(
    "./node_modules/.bin/next",
    ["start", "-p", String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: testDbUrl(),
        // Keep auth rate limiting from interfering across suite runs.
        SESSION_SECRET:
          process.env.SESSION_SECRET ?? "integration-test-secret-0123456789abcdef",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  (ctx as { provide?: (k: string, v: unknown) => void }).provide?.("nothing", true);
  (globalThis as Record<string, unknown>).__itServer = server;

  const output: string[] = [];
  server.stdout?.on("data", (d) => output.push(String(d)));
  server.stderr?.on("data", (d) => output.push(String(d)));

  // Wait for the health endpoint.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  (globalThis as Record<string, unknown>).__itServerOutput = () =>
    output.join("");
}

export async function teardown(_ctx: GlobalSetupContext) {
  const server = (globalThis as Record<string, unknown>).__itServer as
    | { kill: () => void }
    | undefined;
  server?.kill();
  try {
    const client = new Client({ connectionString: adminUrl() });
    await client.connect();
    await client.query(`drop database if exists ${TEST_DB} with (force)`);
    await client.end();
  } catch {
    /* best effort */
  }
}

