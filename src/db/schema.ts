import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────
export const userRole = pgEnum("user_role", ["student", "admin"]);
export const electionState = pgEnum("election_state", [
  "draft",
  "scheduled",
  "open",
  "closed",
  "published",
]);
export const auditAction = pgEnum("audit_action", [
  "create",
  "update",
  "open",
  "close",
  "publish",
  "vote_submitted",
  "login",
]);

// ── Profiles ───────────────────────────────────────────
// Represents both students and admins. Students are identified by school_id.
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: varchar("school_id", { length: 40 }).notNull().unique(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 80 }).notNull(),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    grade: varchar("grade", { length: 30 }),
    role: userRole("role").notNull().default("student"),
    avatarUrl: text("avatar_url"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("profiles_email_idx").on(t.email),
    index("profiles_school_id_idx").on(t.schoolId),
  ],
);

// ── Sessions ───────────────────────────────────────────
// Server-side session management. Replaces client-only localStorage auth.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: varchar("token", { length: 128 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: userRole("role").notNull(),
    ipHash: varchar("ip_hash", { length: 128 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_token_idx").on(t.token),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

// ── Device Tokens ──────────────────────────────────────
// Helps prevent multiple accounts on the same device.
// Not the sole identifier — school_id is primary.
export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fingerprint: varchar("fingerprint", { length: 128 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("device_fp_idx").on(t.fingerprint)],
);

// ── Elections ──────────────────────────────────────────
export const elections = pgTable(
  "elections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    schoolYear: varchar("school_year", { length: 20 }).notNull(),
    description: text("description"),
    state: electionState("state").notNull().default("draft"),
    showLiveResults: boolean("show_live_results").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    resultsPublishedAt: timestamp("results_published_at", {
      withTimezone: true,
    }),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("elections_state_idx").on(t.state)],
);

// ── Election Positions ─────────────────────────────────
export const electionPositions = pgTable(
  "election_positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    maxSelections: integer("max_selections").notNull().default(1),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("position_election_name_idx").on(t.electionId, t.name),
  ],
);

// ── Candidates ─────────────────────────────────────────
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => electionPositions.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id").references(
      () => profiles.id,
    ),
    name: varchar("name", { length: 160 }).notNull(),
    grade: varchar("grade", { length: 30 }),
    introduction: text("introduction").notNull(),
    platform: text("platform").notNull(),
    imageUrl: text("image_url").notNull().default("/candidates/placeholder.svg"),
    approved: boolean("approved").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [index("candidates_position_idx").on(t.positionId)],
);

// ── Election Voters ────────────────────────────────────
// Tracks eligibility and voting status. No link to ballot choices.
export const electionVoters = pgTable(
  "election_voters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    voterId: uuid("voter_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    eligible: boolean("eligible").notNull().default(true),
    votedAt: timestamp("voted_at", { withTimezone: true }),
    receiptHash: varchar("receipt_hash", { length: 128 }),
  },
  (t) => [
    uniqueIndex("one_voter_per_election_idx").on(t.electionId, t.voterId),
    index("turnout_idx").on(t.electionId, t.votedAt),
  ],
);

// ── Ballots (ANONYMOUS) ────────────────────────────────
// Deliberately contains NO voter/profile foreign key.
// Ballots are anonymous — this is the core privacy guarantee.
export const ballots = pgTable(
  "ballots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "restrict" }),
    receiptCode: varchar("receipt_code", { length: 32 }).notNull().unique(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ballots_election_idx").on(t.electionId)],
);

// ── Ballot Selections (ANONYMOUS) ──────────────────────
export const ballotSelections = pgTable(
  "ballot_selections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ballotId: uuid("ballot_id")
      .notNull()
      .references(() => ballots.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => electionPositions.id, { onDelete: "restrict" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("ballot_candidate_once_idx").on(t.ballotId, t.candidateId),
    index("anonymous_tally_idx").on(t.positionId, t.candidateId),
  ],
);

// ── Election Results (Denormalized tallies) ────────────
export const electionResults = pgTable(
  "election_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => electionPositions.id),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id),
    voteCount: integer("vote_count").notNull(),
    isWinner: boolean("is_winner").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("published_result_idx").on(t.electionId, t.candidateId)],
);

// ── Audit Logs ─────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .references(() => elections.id, { onDelete: "set null" }),
    actorId: uuid("actor_id")
      .references(() => profiles.id, { onDelete: "set null" }),
    action: auditAction("action").notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    ipHash: varchar("ip_hash", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_election_idx").on(t.electionId)],
);
