/**
 * Acceptance check for the client's "done when" criteria:
 *
 *   Using a sample student profile, the app produces dossiers for Dartmouth,
 *   Penn, Cornell, Tufts, and Michigan where every link works, every fact is on
 *   a current official page, and no two dossiers lead with the same angle.
 *
 *   npx tsx scripts/done-check.ts [--schools dartmouth,penn,...] [--out reports]
 *
 * Runs the real research pipeline for the sample student (fresh in-memory
 * database, cold page cache), then independently re-checks every dossier with
 * a separate page loader: every link must resolve on an official domain, every
 * fact's quote and name must be on the live page today, and lead angles must
 * be pairwise distinct (key, primary activity, primary theme). Writes a JSON and
 * Markdown report. Exit code 0 only if everything passes.
 */
process.env.WHYUS_DB = process.env.WHYUS_DB || "memory";

import fs from "node:fs";
import path from "node:path";
import sample from "../data/sample-student.json";
import { closeDb, getDb } from "../src/lib/db/client";
import { students, users } from "../src/lib/db/schema";
import { createApplication } from "../src/lib/data/applications";
import { getDossierForApplication } from "../src/lib/data/dossiers";
import { fetchPage } from "../src/lib/research/fetcher";
import { getFactsByIds } from "../src/lib/research/corpus-store";
import { MemoryPageSource } from "../src/lib/research/page-source";
import { isoDate } from "../src/lib/research/term";
import { findQuote, nameAppears } from "../src/lib/research/verify";
import { getLatestRun, getRunEvents, startResearch } from "../src/lib/research/runner";
import { getSchool, isOfficialUrl, promptsFor } from "../src/lib/schools/registry";
import type { Dossier, School, StudentProfile } from "../src/lib/types";

const UNITS: Record<string, string> = {
  dartmouth: "college",
  penn: "college",
  cornell: "engineering",
  tufts: "engineering",
  umich: "taubman",
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

interface LinkCheck {
  url: string;
  ok: boolean;
  status: number;
  official: boolean;
  problem?: string;
}

interface DetailCheck {
  rank: number;
  title: string;
  url: string;
  verifiedAt: string;
  official: boolean;
  pageOk: boolean;
  quoteFound: boolean;
  nameFound: boolean;
  problem?: string;
}

interface SchoolReport {
  schoolId: string;
  schoolName: string;
  unit: string | null;
  prompt: string;
  promptSource: string | null;
  status: string;
  error?: string;
  durationMs: number;
  dossierId?: string;
  uniquenessScore?: number;
  details: DetailCheck[];
  links: LinkCheck[];
  lead?: { key: string; line: string; activityIds: string[]; themes: string[] };
  counts?: { details: number; angles: number; questions: number };
  pass: boolean;
  failures: string[];
}

async function main() {
  const schoolIds = (arg("--schools") ?? "dartmouth,penn,cornell,tufts,umich").split(",").map((s) => s.trim());
  const outDir = path.resolve(arg("--out") ?? "reports");
  const today = isoDate();
  const db = await getDb();

  // Sample account and student.
  const userId = "done-check-user";
  await db.insert(users).values({ id: userId, email: "done-check@example.com", role: "student", name: sample.name });
  const profile = sample as StudentProfile;
  await db.insert(students).values({
    id: profile.id,
    ownerUserId: userId,
    name: profile.name,
    graduationYear: profile.graduationYear,
    highSchool: profile.highSchool ?? null,
    location: profile.location ?? null,
    intendedMajors: profile.intendedMajors,
    interests: profile.interests,
    activities: profile.activities,
    isSelf: true,
  });

  // One application per school, using the 2026-27 "why" prompt for the sample student's unit.
  const apps: { app: Awaited<ReturnType<typeof createApplication>>; school: School; promptSource: string | null }[] = [];
  for (const id of schoolIds) {
    const school = getSchool(id);
    if (!school) throw new Error(`Unknown school ${id}`);
    const unitId = UNITS[id] ?? null;
    const prompts = promptsFor(school, unitId);
    const prompt = prompts.find((p) => p.kind === "why_school") ?? prompts[0];
    const app = await createApplication({
      studentId: profile.id,
      schoolId: id,
      unitId,
      promptId: prompt?.id ?? null,
      promptText: prompt?.text ?? `Why ${school.shortName}?`,
      wordLimit: prompt?.wordLimit?.max ?? null,
    });
    apps.push({ app, school, promptSource: prompt?.sourceUrl ?? null });
  }

  // Start all five at once, like a student adding their list.
  const started = Date.now();
  console.log(`Starting research for ${apps.length} schools at ${new Date().toISOString()}`);
  await Promise.all(apps.map(({ app }) => startResearch(app.id)));

  const timings = new Map<string, number>();
  const deadline = Date.now() + 10 * 60 * 1000;
  for (;;) {
    let running = 0;
    for (const { app, school } of apps) {
      const run = await getLatestRun(app.id);
      if (!run || run.status === "running") running++;
      else if (!timings.has(app.id)) {
        const ms = (run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.startedAt);
        timings.set(app.id, ms);
        console.log(`  ${school.shortName}: ${run.status} in ${(ms / 1000).toFixed(1)}s${run.error ? ` (${run.error})` : ""}`);
      }
    }
    if (running === 0 || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`All runs finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // Independent re-check with a fresh page loader (no shared cache with the app).
  const checker = new MemoryPageSource();
  const reports: SchoolReport[] = [];
  const dossiers: Dossier[] = [];
  for (const { app, school, promptSource } of apps) {
    const run = await getLatestRun(app.id);
    const report: SchoolReport = {
      schoolId: school.id,
      schoolName: school.name,
      unit: app.unitId,
      prompt: app.promptText,
      promptSource,
      status: run?.status ?? "missing",
      error: run?.error ?? undefined,
      durationMs: timings.get(app.id) ?? -1,
      details: [],
      links: [],
      pass: false,
      failures: [],
    };
    const dossier = await getDossierForApplication(userId, app.id);
    if (!dossier) {
      report.failures.push(`No dossier (${run?.error ?? "run did not produce one"})`);
      const events = run ? await getRunEvents(run.id) : [];
      const errors = events.filter((e) => e.event.type === "error").map((e) => (e.event as { message: string }).message);
      if (errors.length) report.failures.push(...errors);
      reports.push(report);
      continue;
    }
    dossiers.push(dossier);
    report.dossierId = dossier.id;
    report.uniquenessScore = dossier.uniquenessScore;
    report.counts = { details: dossier.details.length, angles: dossier.angles.length, questions: dossier.questions.length };
    if (dossier.details.length < 6 || dossier.details.length > 8) report.failures.push(`Expected 6-8 details, got ${dossier.details.length}`);
    if (dossier.angles.length < 2 || dossier.angles.length > 3) report.failures.push(`Expected 2-3 angles, got ${dossier.angles.length}`);
    if (dossier.questions.length !== 3) report.failures.push(`Expected 3 questions, got ${dossier.questions.length}`);
    if (report.durationMs > 150_000) report.failures.push(`Research took ${(report.durationMs / 1000).toFixed(0)}s (target about 120s)`);

    const factsById = new Map((await getFactsByIds(dossier.details.map((d) => d.factId))).map((f) => [f.id, f]));
    for (const d of dossier.details) {
      const official = isOfficialUrl(d.sourceUrl, school);
      const page = await checker.load(d.sourceUrl, { isAllowedUrl: (u) => isOfficialUrl(u, school), maxAgeMs: 0 });
      const check: DetailCheck = {
        rank: d.rank,
        title: d.title,
        url: d.sourceUrl,
        verifiedAt: d.verifiedAt,
        official,
        pageOk: page.ok,
        quoteFound: page.ok && findQuote(page.text, d.quote).found,
        nameFound: false,
      };
      const fact = factsById.get(d.factId);
      check.nameFound = page.ok && Boolean(fact) && nameAppears(page.text, fact!.nameOnPage);
      if (!fact) check.problem = "detail does not correspond to a fact in the research base";
      else if (!official) check.problem = "not an official domain";
      else if (!page.ok) check.problem = page.problem ?? `HTTP ${page.status}`;
      else if (!check.quoteFound) check.problem = "quote not found on the current page";
      else if (!check.nameFound) check.problem = `name "${fact.nameOnPage}" not found on the current page`;
      else if (d.verifiedAt !== today) check.problem = `verification date ${d.verifiedAt} is not today (${today})`;
      if (check.problem) report.failures.push(`Detail ${d.rank} "${d.title}": ${check.problem}`);
      report.details.push(check);
    }

    // Every link in the dossier must work: sources and swap-test equivalents.
    const urls = new Set<string>(dossier.details.map((d) => d.sourceUrl));
    for (const d of dossier.details) for (const s of d.swap) if (s.equivalentUrl) urls.add(s.equivalentUrl);
    for (const url of urls) {
      const owner = [school, ...apps.map((a) => a.school)].find((s) => isOfficialUrl(url, s));
      const res = await fetchPage(url, { isAllowedUrl: owner ? (u) => isOfficialUrl(u, owner) : undefined, timeoutMs: 20_000 });
      const link: LinkCheck = { url, ok: res.ok && res.status >= 200 && res.status < 300, status: res.status, official: Boolean(owner) };
      if (!link.official) link.problem = "not an official school domain";
      else if (!link.ok) link.problem = res.blockedReason ?? res.error ?? `HTTP ${res.status}`;
      if (link.problem) report.failures.push(`Link ${url}: ${link.problem}`);
      report.links.push(link);
    }

    const lead = dossier.angles.find((a) => a.isLead);
    if (!lead) report.failures.push("No lead angle");
    else report.lead = { key: lead.key, line: lead.line, activityIds: lead.activityIds, themes: lead.themes };
    reports.push(report);
  }

  // No two dossiers lead with the same angle.
  const crossFailures: string[] = [];
  const leads = reports.filter((r) => r.lead).map((r) => ({ school: r.schoolName, ...r.lead! }));
  for (let i = 0; i < leads.length; i++) {
    for (let j = i + 1; j < leads.length; j++) {
      const a = leads[i];
      const b = leads[j];
      if (a.key === b.key) crossFailures.push(`${a.school} and ${b.school} lead with the same angle (${a.key})`);
      if (a.activityIds[0] && a.activityIds[0] === b.activityIds[0]) {
        crossFailures.push(`${a.school} and ${b.school} lead angles build on the same activity (${a.activityIds[0]})`);
      }
      if (a.themes[0] && a.themes[0] === b.themes[0]) crossFailures.push(`${a.school} and ${b.school} lead angles share the primary theme ${a.themes[0]}`);
    }
  }
  for (const r of reports) r.pass = r.failures.length === 0;
  const pass = reports.every((r) => r.pass) && crossFailures.length === 0 && reports.length === schoolIds.length;

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `done-check-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ pass, today, reports, crossFailures, dossiers }, null, 2));

  const md: string[] = [];
  md.push(`# WhyUs done check (${today})`, "");
  md.push(`Result: **${pass ? "PASS" : "FAIL"}**`, "");
  md.push(`Sample student: ${profile.name} (${profile.activities.length} activities). Fresh database, cold page cache.`, "");
  md.push("| School | Unit | Status | Time | Details | Links OK | Facts on live page | Uniqueness | Lead angle |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of reports) {
    const linksOk = r.links.filter((l) => !l.problem).length;
    const factsOk = r.details.filter((d) => !d.problem).length;
    md.push(
      `| ${r.schoolName} | ${r.unit ?? ""} | ${r.status} | ${r.durationMs >= 0 ? `${(r.durationMs / 1000).toFixed(0)}s` : "n/a"} | ${r.counts?.details ?? 0} | ${linksOk}/${r.links.length} | ${factsOk}/${r.details.length} | ${r.uniquenessScore ?? ""} | ${r.lead?.line.replace(/\|/g, "/") ?? ""} |`,
    );
  }
  md.push("");
  if (crossFailures.length) md.push("## Angle conflicts", "", ...crossFailures.map((f) => `- ${f}`), "");
  for (const r of reports) {
    md.push(`## ${r.schoolName}`, "", `Prompt: ${r.prompt}`, "");
    if (r.failures.length) md.push("Failures:", "", ...r.failures.map((f) => `- ${f}`), "");
    for (const d of r.details) md.push(`${d.rank}. ${d.title}: ${d.url} (verified ${d.verifiedAt})${d.problem ? ` **${d.problem}**` : ""}`);
    md.push("");
  }
  const mdPath = path.join(outDir, `done-check-${stamp}.md`);
  fs.writeFileSync(mdPath, md.join("\n"));
  console.log(md.slice(0, 12 + reports.length).join("\n"));
  console.log(`\nReport: ${mdPath}\nData:   ${jsonPath}`);
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
