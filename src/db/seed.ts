/**
 * Development-only demo data seeder.
 *
 * Run explicitly with:  npm run db:seed
 *
 * - Idempotent: safe to run repeatedly (fixed UUIDs + ON CONFLICT DO NOTHING).
 * - Refuses to run when NODE_ENV=production. Demo seeding must be impossible
 *   in production; there is no override flag.
 */
import { pathToFileURL } from "node:url";
import { loadEnvFile, requireDatabaseUrl } from "@/db/env";

async function main() {
  loadEnvFile();

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data in production.");
    process.exit(1);
  }

  requireDatabaseUrl();

  const { seedDemoData } = await import("@/db/seed-data");
  await seedDemoData();
  console.log("Demo seed complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
