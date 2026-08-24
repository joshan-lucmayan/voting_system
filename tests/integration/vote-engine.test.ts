/**
 * Voting-engine integration tests (Milestone 7).
 *
 * Runs against the real production build served by global-setup.ts,
 * backed by a dedicated `voting_test` database. Live data is untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// NOTE: deliberately NOT named BASE_URL — Vite reserves that variable.
const SERVER_URL = process.env.IT_SERVER_URL || "http://localhost:3300";
const LIVE_DATABASE_URL = process.env.DATABASE_URL!;
const TEST_DB_URL = LIVE_DATABASE_URL.replace(/\/[^/?]*(\?.*)?$/, "/voting_test");

// ── Fixed fixture IDs ────────────────────────────────────────
const S1 = "70000000-0000-4000-8000-000000000001"; // active student
const S2 = "70000000-0000-4000-8000-000000000002"; // active student (ineligible on E1)
const S3 = "70000000-0000-4000-8000-000000000003"; // active student (concurrency)
const ADM = "70000000-0000-4000-8000-000000000004";
const E1 = "71000000-0000-4000-8000-000000000001"; // open election
const P1 = "72000000-0000-4000-8000-000000000001";
const P2 = "72000000-0000-4000-8000-000000000002";
const C1A = "73000000-0000-4000-8000-000000000001";
const C1B = "73000000-0000-4000-8000-000000000002";
const C2A = "73000000-0000-4000-8000-000000000003";
const E2 = "71000000-0000-4000-8000-000000000002"; // closed election
const Q1 = "72000000-0000-4000-8000-000000000003";
const CX = "73000000-0000-4000-8000-000000000004"; // candidate on E2

let pg: Client;

async function db() {
  if (!pg) {
    pg = new Client({ connectionString: TEST_DB_URL });
    await pg.connect();
  }
  return pg;
}

async function login(
  schoolId: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.99.${schoolId.length}.${Math.floor(Math.random() * 250) + 1}`,
    },
    body: JSON.stringify({ schoolId, password }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
}

async function castVote(
  cookie: string,
  body: unknown,
  ip = "10.98.0.5",
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${SERVER_URL}/api/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, Cookie: cookie },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const j = await res.json();
  if (process.env.IT_DEBUG && res.status !== 200) console.log("VOTE_DEBUG", status2(), JSON.stringify(j));
  function status2() { return res.status; }
  return { status: res.status, json: j };
}

async function ballotCount(): Promise<number> {
  const client = await db();
  const r = await client.query("select count(*)::int as c from ballots");
  return r.rows[0].c;
}

beforeAll(async () => {
  const bcrypt = (await import("bcryptjs")).default;
  const hash = await bcrypt.hash("votepass1", 12);
  const client = await db();
  await client.query(
    `insert into profiles (id, school_id, email, password_hash, first_name, last_name, full_name, role)
     values ($1,'IT-S1','s1@test.edu',$4,'Voter','One','Voter One','student'),
            ($2,'IT-S2','s2@test.edu',$4,'Voter','Two','Voter Two','student'),
            ($3,'IT-S3','s3@test.edu',$4,'Voter','Three','Voter Three','student')`,
    [S1, S2, S3, hash],
  );
  await client.query(
    `insert into profiles (id, school_id, email, password_hash, first_name, last_name, full_name, role)
     values ($1,'IT-A','adm@test.edu',$2,'Adm','In','Adm In','admin')`,
    [ADM, hash],
  );

  await client.query(
    `insert into elections (id, title, school_year, state, starts_at, ends_at)
     values ($1,'IT Open','2026','open', now() - interval '1 day', now() + interval '1 day'),
            ($2,'IT Closed','2026','closed', now() - interval '2 day', now() - interval '1 day')`,
    [E1, E2],
  );
  await client.query(
    `insert into election_positions (id, election_id, name) values
       ($1,$3,'Position One'),($2,$3,'Position Two'),($4,$5,'Other Position')`,
    [P1, P2, E1, Q1, E2],
  );
  await client.query(
    `insert into candidates (id, position_id, name, introduction, platform, approved) values
       ($1,$4,'Cand One-A','i','p',true),($2,$4,'Cand One-B','i','p',true),
       ($3,$5,'Cand Two-A','i','p',true),($6,$7,'Cand Other-Election','i','p',true)`,
    [C1A, C1B, C2A, P1, P2, CX, Q1],
  );
  // Eligibility: S1+S3 eligible on E1, S2 ineligible on E1, S2 eligible on closed E2.
  await client.query(
    `insert into election_voters (election_id, voter_id, eligible) values
       ($1,$2,true),($1,$3,true),($1,$4,false),($5,$4,true)`,
    [E1, S1, S3, S2, E2],
  );

  if (process.env.IT_DEBUG) {
    const p = await client.query("select id, election_id from election_positions order by id");
    console.log("FIXTURE_POSITIONS", JSON.stringify(p.rows));
    const c = await client.query("select id, position_id, approved from candidates order by id");
    console.log("FIXTURE_CANDIDATES", JSON.stringify(c.rows));
  }
});

afterAll(async () => {
  if (pg) await pg.end();
});

describe("voting engine", () => {
  it("rejects unauthenticated submissions", async () => {
    const { status } = await castVote("", {
      electionId: E1,
      selections: { [P1]: [C1A], [P2]: [C2A] },
    }, "10.97.0.1");
    expect(status).toBe(401);
    expect(await ballotCount()).toBe(0);
  });

  it("rejects admin-role sessions", async () => {
    const cookie = await login("IT-A", "votepass1");
    const { status, json } = await castVote(cookie, {
      electionId: E1,
      selections: { [P1]: [C1A], [P2]: [C2A] },
    }, "10.97.0.2");
    expect(status).toBe(403);
    expect(json.error).toContain("permissions");
    expect(await ballotCount()).toBe(0);
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["non-object body", '"just a string"'],
    ["missing electionId", { selections: {} }],
    ["null selections", { electionId: E1, selections: null }],
    ["array selections", { electionId: E1, selections: [] }],
    ["string selections", { electionId: E1, selections: "x" }],
    ["empty selections", { electionId: E1, selections: {} }],
    ["choices not an array", { electionId: E1, selections: { [P1]: "C1A", [P2]: [C2A] } }],
    ["non-string candidate id", { electionId: E1, selections: { [P1]: [123], [P2]: [C2A] } }],
    ["empty choice array", { electionId: E1, selections: { [P1]: [], [P2]: [C2A] } }],
    ["duplicate candidate entries", { electionId: E1, selections: { [P1]: [C1A, C1A], [P2]: [C2A] } }],
    ["unknown position", { electionId: E1, selections: { [P1]: [C1A], [P2]: [C2A], ["72000000-0000-4000-8000-000000000099"]: [CX] } }],
  ])("rejects malformed payload: %s", async (_label, body) => {
    const cookie = await login("IT-S1", "votepass1");
    const { status } = await castVote(cookie, body, "10.97.1.1");
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect(await ballotCount()).toBe(0);
  });

  it("rejects partial ballots (missing required position)", async () => {
    const cookie = await login("IT-S1", "votepass1");
    const { status, json } = await castVote(cookie, {
      electionId: E1,
      selections: { [P1]: [C1A] },
    }, "10.97.1.2");
    expect(status).toBe(400);
    expect(json.error).toMatch(/every position/i);
    expect(await ballotCount()).toBe(0);
  });

  it("rejects candidates from another election", async () => {
    const cookie = await login("IT-S1", "votepass1");
    const { status, json } = await castVote(cookie, {
      electionId: E1,
      selections: { [P1]: [CX], [P2]: [C2A] },
    }, "10.97.1.3");
    expect(status).toBe(400);
    expect(json.error).toMatch(/does not belong/i);
    expect(await ballotCount()).toBe(0);
  });

  it("rejects ineligible voters", async () => {
    const cookie = await login("IT-S2", "votepass1");
    const { status, json } = await castVote(cookie, {
      electionId: E1,
      selections: { [P1]: [C1A], [P2]: [C2A] },
    }, "10.97.1.4");
    expect(status).toBe(409);
    expect(json.error).toMatch(/not eligible/i);
    expect(await ballotCount()).toBe(0);
  });

  it("rejects votes on a closed election", async () => {
    const cookie = await login("IT-S2", "votepass1");
    const { status, json } = await castVote(cookie, {
      electionId: E2,
      selections: { [Q1]: [CX] },
    }, "10.97.1.5");
    expect(status).toBe(409);
    expect(json.error).toMatch(/not currently open/i);
    expect(await ballotCount()).toBe(0);
  });

  it("accepts a complete valid ballot (extra fields ignored)", async () => {
    const before = await ballotCount();
    const cookie = await login("IT-S1", "votepass1");
    const { status, json } = await castVote(cookie, {
      electionId: E1,
      selections: { [P1]: [C1A], [P2]: [C2A] },
      rogueField: "ignored",
      studentProfileId: S1,
    }, "10.97.1.6");
    expect(status).toBe(200);
    expect(Object.keys(json)).toEqual(["receiptCode"]);
    expect(json.receiptCode).toMatch(/^NF-[0-9A-F]{12}$/);

    const client = await db();
    const ballotsRow = await client.query(
      "select count(*)::int as c from ballots where election_id=$1",
      [E1],
    );
    expect(ballotsRow.rows[0].c - before).toBe(1);
    // Exactly two selection rows, none referencing any voter identity column.
    const sel = await client.query(
      `select position_id, candidate_id from ballot_selections bs
       join ballots b on b.id = bs.ballot_id
       where b.election_id = $1`,
      [E1],
    );
    expect(sel.rowCount).toBe(2);
    // Voted status recorded without ballot linkage.
    const voter = await client.query(
      "select voted_at is not null as voted, receipt_hash is not null as has_receipt from election_voters where election_id=$1 and voter_id=$2",
      [E1, S1],
    );
    expect(voter.rows[0].voted).toBe(true);
    expect(voter.rows[0].has_receipt).toBe(true);
  });

  it("rejects duplicate votes (already voted)", async () => {
    const before = await ballotCount();
    const cookie = await login("IT-S1", "votepass1");
    const { status, json } = await castVote(cookie, {
      electionId: E1,
      selections: { [P1]: [C1B], [P2]: [C2A] },
    }, "10.97.1.7");
    expect(status).toBe(409);
    expect(json.error).toMatch(/already voted/i);
    expect(await ballotCount()).toBe(before);
  });

  it("keeps exactly one ballot under concurrent double-votes across 100 repetitions", async () => {
    const cookie = await login("IT-S3", "votepass1");
    const before = await ballotCount();
    let successes = 0;
    let conflicts = 0;
    const REPETITIONS = 100;

    for (let i = 0; i < REPETITIONS; i++) {
      const body = {
        electionId: E1,
        selections: { [P1]: i % 2 === 0 ? [C1A] : [C1B], [P2]: [C2A] },
      };
      const [a, b] = await Promise.all([
        castVote(cookie, body, "10.97.2.1"),
        castVote(cookie, body, "10.97.2.2"),
      ]);
      const statuses = [a.status, b.status].sort();
      if (statuses[0] === 200 && statuses[1] === 409) successes++;
      else conflicts++;
    }

    expect(conflicts).toBe(0);
    expect(successes).toBe(REPETITIONS);
    // Exactly one ballot per successful submission overall.
    expect((await ballotCount()) - before).toBe(REPETITIONS);
  });

  it("preserves ballot anonymity structurally and at the API boundary", async () => {
    const client = await db();
    // No FK from ballot tables toward profiles or election_voters.
    const fks = await client.query(
      `select conname from pg_constraint
       where contype='f'
         and confrelid::regclass::text in ('profiles','election_voters')
         and conrelid::regclass::text in ('ballots','ballot_selections')`,
    );
    expect(fks.rowCount).toBe(0);
    // election_voters tracks eligibility/turnout only.
    const cols = await client.query(
      "select column_name from information_schema.columns where table_name='election_voters'",
    );
    const names = cols.rows.map((r) => r.column_name as string);
    for (const forbidden of ["ballot_id", "selection_id", "candidate_id", "receipt_code"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});
