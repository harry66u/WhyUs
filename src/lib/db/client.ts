import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

interface DbState {
  db: Db;
  ready: Promise<void>;
  close: () => Promise<void>;
  kind: "pglite" | "postgres";
}

const globalForDb = globalThis as unknown as { __whyusDb?: DbState };

function migrationsFolder(): string {
  return path.join(process.cwd(), "drizzle");
}

function createState(): DbState {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const client = postgres(url, { max: 10 });
    const db = drizzlePostgres(client, { schema }) as unknown as Db;
    const ready =
      process.env.WHYUS_AUTO_MIGRATE === "false"
        ? Promise.resolve()
        : migratePostgres(drizzlePostgres(client, { schema }), { migrationsFolder: migrationsFolder() });
    return { db, ready, close: () => client.end(), kind: "postgres" };
  }

  // Embedded Postgres (PGlite). In-memory for tests, on disk otherwise.
  const inMemory = process.env.WHYUS_DB === "memory";
  const dataDir = inMemory ? undefined : process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const pg = drizzlePglite(client, { schema });
  const ready = migratePglite(pg, { migrationsFolder: migrationsFolder() });
  return { db: pg as unknown as Db, ready, close: () => client.close(), kind: "pglite" };
}

/** Returns the process-wide database handle, applying migrations on first use. */
export async function getDb(): Promise<Db> {
  if (!globalForDb.__whyusDb) globalForDb.__whyusDb = createState();
  await globalForDb.__whyusDb.ready;
  return globalForDb.__whyusDb.db;
}

export function dbKind(): "pglite" | "postgres" {
  const url = process.env.DATABASE_URL;
  return url && /^postgres(ql)?:\/\//.test(url) ? "postgres" : "pglite";
}

/** Closes the database (scripts and tests). */
export async function closeDb(): Promise<void> {
  const state = globalForDb.__whyusDb;
  globalForDb.__whyusDb = undefined;
  if (state) await state.close();
}

export { schema };
