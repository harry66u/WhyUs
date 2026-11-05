/**
 * Load the bundled research bases into the database, and optionally create a
 * local demo account that owns the sample student.
 *
 *   npx tsx scripts/db-seed.ts                         # research bases only
 *   npx tsx scripts/db-seed.ts --demo you@example.com  # plus a demo account (development only)
 */
import { eq } from "drizzle-orm";
import sample from "../data/sample-student.json";
import { closeDb, getDb } from "../src/lib/db/client";
import { students, users } from "../src/lib/db/schema";
import { newId } from "../src/lib/ids";
import { countFacts, ensureCorpusSeeded } from "../src/lib/research/corpus-store";
import { listSchools } from "../src/lib/schools/registry";

async function main() {
  await ensureCorpusSeeded();
  for (const s of listSchools()) console.log(`${s.shortName}: ${await countFacts(s.id)} facts`);

  const i = process.argv.indexOf("--demo");
  if (i !== -1) {
    if (process.env.NODE_ENV === "production") throw new Error("--demo is for development only");
    const email = (process.argv[i + 1] ?? "").trim().toLowerCase();
    if (!email.includes("@")) throw new Error("usage: --demo you@example.com");
    const db = await getDb();
    let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) [user] = await db.insert(users).values({ id: newId(), email, role: "student", name: sample.name }).returning();
    const existing = await db.select().from(students).where(eq(students.ownerUserId, user.id)).limit(1);
    if (!existing[0]) {
      await db.insert(students).values({
        id: newId(),
        ownerUserId: user.id,
        name: sample.name,
        graduationYear: sample.graduationYear,
        highSchool: sample.highSchool,
        location: sample.location,
        intendedMajors: sample.intendedMajors,
        interests: sample.interests,
        activities: sample.activities,
        isSelf: true,
      });
    }
    console.log(`Demo account ready: ${email}. Sign in with that address at /login.`);
  }
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
