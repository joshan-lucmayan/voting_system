import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __dbPool?: Pool;
  __db?: ReturnType<typeof drizzle>;
};

function getDb() {
  if (!globalForDb.__db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is required. Set it in your environment variables.",
      );
    }
    if (!globalForDb.__dbPool) {
      globalForDb.__dbPool = new Pool({ connectionString: databaseUrl });
    }
    globalForDb.__db = drizzle(globalForDb.__dbPool);
  }
  return globalForDb.__db;
}

// Export a lazy proxy so `import { db } from "@/db"` works
// but the Pool is only created when db is actually used at runtime.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
