import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  AccountRole,
  Activity,
  ApplicationStatus,
  Commonness,
  Dossier,
  FactKind,
  PurchaseKind,
  ResearchEvent,
  VerificationResult,
} from "@/lib/types";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").$type<AccountRole>(), // null until the account type is chosen
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Sessions are looked up by the SHA-256 hash of the cookie token. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time sign-in links. Only the SHA-256 hash of the token is stored. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("login_tokens_email_idx").on(t.email)],
);

/* ------------------------------------------------------------------ */
/* Students and applications                                           */
/* ------------------------------------------------------------------ */

/**
 * A student profile. A student account owns exactly one (its own); parent and
 * counselor accounts own one per student they manage.
 */
export const students = pgTable(
  "students",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    graduationYear: integer("graduation_year").notNull(),
    highSchool: text("high_school"),
    location: text("location"),
    intendedMajors: jsonb("intended_majors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    interests: jsonb("interests").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    activities: jsonb("activities").$type<Activity[]>().notNull().default(sql`'[]'::jsonb`),
    /** The raw text the student pasted or extracted from an uploaded PDF (kept so they can re-parse). */
    activitiesSource: text("activities_source"),
    isSelf: boolean("is_self").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("students_owner_idx").on(t.ownerUserId)],
);

export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schoolId: text("school_id").notNull(),
    unitId: text("unit_id"),
    promptId: text("prompt_id"),
    promptText: text("prompt_text").notNull(),
    wordLimit: integer("word_limit"),
    status: text("status").$type<ApplicationStatus>().notNull().default("queued"),
    progress: integer("progress").notNull().default(0), // 0-100
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("applications_student_idx").on(t.studentId),
    uniqueIndex("applications_student_school_unit_idx").on(t.studentId, t.schoolId, t.unitId),
  ],
);

/* ------------------------------------------------------------------ */
/* Research runs and live events                                       */
/* ------------------------------------------------------------------ */

export const researchRuns = pgTable(
  "research_runs",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    status: text("status").$type<"running" | "done" | "failed">().notNull().default("running"),
    engine: text("engine").$type<"llm" | "deterministic">().notNull().default("deterministic"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [index("research_runs_application_idx").on(t.applicationId)],
);

export const researchEvents = pgTable(
  "research_events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => researchRuns.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    event: jsonb("event").$type<ResearchEvent>().notNull(),
  },
  (t) => [index("research_events_run_idx").on(t.runId, t.seq)],
);

/* ------------------------------------------------------------------ */
/* Shared school research (reusable across students)                   */
/* ------------------------------------------------------------------ */

/** Verified facts about schools. Not student data: shared by every student. */
export const corpusFacts = pgTable(
  "corpus_facts",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id").notNull(),
    term: text("term").notNull(),
    unitIds: jsonb("unit_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    kind: text("kind").$type<FactKind>().notNull(),
    title: text("title").notNull(),
    nameOnPage: text("name_on_page").notNull(),
    summary: text("summary").notNull(),
    hook: text("hook").notNull(),
    quote: text("quote").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title").notNull(),
    themes: jsonb("themes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    commonness: text("commonness").$type<Commonness>().notNull(),
    commonnessReason: text("commonness_reason"),
    people: jsonb("people").$type<string[]>(),
    verifiedAt: text("verified_at"), // YYYY-MM-DD
    verification: jsonb("verification").$type<VerificationResult>(),
    builtBy: text("built_by").notNull().default("seed"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("corpus_facts_school_term_idx").on(t.schoolId, t.term)],
);

/** Fetched official pages (normalized text), reused for verification and draft checks. */
export const pages = pgTable(
  "pages",
  {
    url: text("url").primaryKey(),
    finalUrl: text("final_url").notNull(),
    host: text("host").notNull(),
    status: integer("status").notNull(),
    ok: boolean("ok").notNull(),
    title: text("title"),
    text: text("text"),
    contentHash: text("content_hash"),
    blockedReason: text("blocked_reason"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pages_host_idx").on(t.host)],
);

/* ------------------------------------------------------------------ */
/* Dossiers and sharing                                                */
/* ------------------------------------------------------------------ */

export const dossiers = pgTable(
  "dossiers",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schoolId: text("school_id").notNull(),
    uniquenessScore: integer("uniqueness_score").notNull(),
    leadAngleKey: text("lead_angle_key"),
    payload: jsonb("payload").$type<Dossier>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("dossiers_application_idx").on(t.applicationId), index("dossiers_student_idx").on(t.studentId)],
);

export const shareLinks = pgTable(
  "share_links",
  {
    token: text("token").primaryKey(), // 128-bit random, base64url
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("share_links_dossier_idx").on(t.dossierId)],
);

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

export const purchases = pgTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<PurchaseKind>().notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** For "unlimited": the student the unlimited plan applies to. */
    studentId: text("student_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stripeSessionId: text("stripe_session_id").unique(),
    status: text("status").$type<"paid" | "refunded" | "simulated">().notNull().default("paid"),
    createdAt: createdAt(),
  },
  (t) => [index("purchases_user_idx").on(t.userId)],
);
