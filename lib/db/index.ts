import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "@/lib/db/schema";

const globalForDb = globalThis as unknown as {
  __gfmSql?: ReturnType<typeof postgres>;
  __gfmDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function createClient() {
  const url = getDatabaseUrl();
  return postgres(url, {
    max: 5,
    prepare: false,
  });
}

export function getDb() {
  if (!globalForDb.__gfmDb) {
    const sql = globalForDb.__gfmSql ?? createClient();
    globalForDb.__gfmSql = sql;
    globalForDb.__gfmDb = drizzle(sql, { schema });
  }
  return globalForDb.__gfmDb;
}

export type AppDb = ReturnType<typeof getDb>;
