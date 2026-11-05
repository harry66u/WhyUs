CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"school_id" text NOT NULL,
	"unit_id" text,
	"prompt_id" text,
	"prompt_text" text NOT NULL,
	"word_limit" integer,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"term" text NOT NULL,
	"unit_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"name_on_page" text NOT NULL,
	"summary" text NOT NULL,
	"hook" text NOT NULL,
	"quote" text NOT NULL,
	"source_url" text NOT NULL,
	"source_title" text NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commonness" text NOT NULL,
	"commonness_reason" text,
	"people" jsonb,
	"verified_at" text,
	"verification" jsonb,
	"built_by" text DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossiers" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"student_id" text NOT NULL,
	"school_id" text NOT NULL,
	"uniqueness_score" integer NOT NULL,
	"lead_angle_key" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"url" text PRIMARY KEY NOT NULL,
	"final_url" text NOT NULL,
	"host" text NOT NULL,
	"status" integer NOT NULL,
	"ok" boolean NOT NULL,
	"title" text,
	"text" text,
	"content_hash" text,
	"blocked_reason" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"student_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_session_id" text,
	"status" text DEFAULT 'paid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "research_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"event" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"engine" text DEFAULT 'deterministic' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"graduation_year" integer NOT NULL,
	"high_school" text,
	"location" text,
	"intended_majors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activities_source" text,
	"is_self" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_events" ADD CONSTRAINT "research_events_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_student_idx" ON "applications" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_student_school_unit_idx" ON "applications" USING btree ("student_id","school_id","unit_id");--> statement-breakpoint
CREATE INDEX "corpus_facts_school_term_idx" ON "corpus_facts" USING btree ("school_id","term");--> statement-breakpoint
CREATE INDEX "dossiers_application_idx" ON "dossiers" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "dossiers_student_idx" ON "dossiers" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "pages_host_idx" ON "pages" USING btree ("host");--> statement-breakpoint
CREATE INDEX "purchases_user_idx" ON "purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "research_events_run_idx" ON "research_events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "research_runs_application_idx" ON "research_runs" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_links_dossier_idx" ON "share_links" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "students_owner_idx" ON "students" USING btree ("owner_user_id");