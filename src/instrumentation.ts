/**
 * Next.js instrumentation hook — runs once when the Node.js server starts.
 * Compatible with the approved v1 deployment target (single persistent
 * Node process). Not invoked during `next build`.
 *
 * Deliberately self-contained: it opens its own short-lived pg connections
 * via a runtime require so the bundler never pulls the database driver
 * into this file's bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("Instrumentation cleanup skipped: DATABASE_URL is not set.");
    return;
  }

  const sweep = async () => {
    let client: import("pg").Client | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runtime require hidden from the bundler
      const requireRuntime = eval("require") as (id: string) => unknown;
      const pg = requireRuntime("pg") as typeof import("pg");
      client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      await client.query("delete from sessions where expires_at <= now()");
    } catch (error) {
      console.error(
        "Scheduled cleanup failed:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      if (client) await client.end();
    }
  };

  await sweep();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const timer = setInterval(sweep, DAY_MS);

  // Do not hold the process open just for the timer.
  if (typeof timer.unref === "function") timer.unref();
}
