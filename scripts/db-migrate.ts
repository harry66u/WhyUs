/**
 * Apply database migrations (Postgres via DATABASE_URL, or the local PGlite database).
 *
 *   npx tsx scripts/db-migrate.ts
 */
import { closeDb, dbKind, getDb } from "../src/lib/db/client";

async function main() {
  await getDb();
  console.log(`Migrations applied (${dbKind()}).`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
