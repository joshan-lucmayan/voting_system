CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'open', 'close', 'publish', 'vote_submitted', 'login');--> statement-breakpoint
CREATE TYPE "public"."election_state" AS ENUM('draft', 'scheduled', 'open', 'closed', 'published');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid,
	"actor_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballot_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ballot_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"receipt_code" varchar(32) NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ballots_receipt_code_unique" UNIQUE("receipt_code")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"student_profile_id" uuid,
	"name" varchar(160) NOT NULL,
	"grade" varchar(30),
	"introduction" text NOT NULL,
	"platform" text NOT NULL,
	"image_url" text DEFAULT '/candidates/placeholder.svg' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" varchar(128) NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "election_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"vote_count" integer NOT NULL,
	"is_winner" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_voters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"eligible" boolean DEFAULT true NOT NULL,
	"voted_at" timestamp with time zone,
	"receipt_hash" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"school_year" varchar(20) NOT NULL,
	"description" text,
	"state" "election_state" DEFAULT 'draft' NOT NULL,
	"show_live_results" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"results_published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" varchar(40) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"grade" varchar(30),
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"avatar_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_school_id_unique" UNIQUE("school_id"),
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(128) NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"ip_hash" varchar(128),
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_selections" ADD CONSTRAINT "ballot_selections_ballot_id_ballots_id_fk" FOREIGN KEY ("ballot_id") REFERENCES "public"."ballots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_selections" ADD CONSTRAINT "ballot_selections_position_id_election_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."election_positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_selections" ADD CONSTRAINT "ballot_selections_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_position_id_election_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."election_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_student_profile_id_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_positions" ADD CONSTRAINT "election_positions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_position_id_election_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."election_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_voters" ADD CONSTRAINT "election_voters_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_voters" ADD CONSTRAINT "election_voters_voter_id_profiles_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_election_idx" ON "audit_logs" USING btree ("election_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ballot_candidate_once_idx" ON "ballot_selections" USING btree ("ballot_id","candidate_id");--> statement-breakpoint
CREATE INDEX "anonymous_tally_idx" ON "ballot_selections" USING btree ("position_id","candidate_id");--> statement-breakpoint
CREATE INDEX "ballots_election_idx" ON "ballots" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "candidates_position_idx" ON "candidates" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "device_fp_idx" ON "device_tokens" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "position_election_name_idx" ON "election_positions" USING btree ("election_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "published_result_idx" ON "election_results" USING btree ("election_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_voter_per_election_idx" ON "election_voters" USING btree ("election_id","voter_id");--> statement-breakpoint
CREATE INDEX "turnout_idx" ON "election_voters" USING btree ("election_id","voted_at");--> statement-breakpoint
CREATE INDEX "elections_state_idx" ON "elections" USING btree ("state");--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "profiles_school_id_idx" ON "profiles" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");