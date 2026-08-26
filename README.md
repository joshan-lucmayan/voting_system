# School Council Voting System

A secure, anonymous, and transparent web application for school student council elections. Built with Next.js 15 (App Router), Drizzle ORM, and PostgreSQL.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Student Workflow](#student-workflow)
- [Admin Workflow](#admin-workflow)
- [Voting Architecture & Privacy](#voting-architecture--privacy)
- [API Routes](#api-routes)
- [Responsive Design](#responsive-design)
- [Security Considerations](#security-considerations)
- [Deployment](#deployment)
- [Color Palette](#color-palette)

---

## Overview

The School Council Voting System provides a complete platform for running student elections. Students can sign up, view candidates, cast anonymous votes, and view live results. Administrators manage elections, candidates, positions, and view aggregate statistics — all without accessing individual vote choices.

### Design Philosophy

- **Privacy by design** — Ballots have no voter ID. Individual votes cannot be traced.
- **Simplicity** — Focused on elections. No social features, profiles, or distractions.
- **Security** — Server-side validation, encrypted sessions, bcrypt passwords.
- **Responsiveness** — Works on desktop, tablet, and mobile with optimized touch targets.

---

## Features

### Public
- Professional homepage with election information and trust section
- Student signup and login

### Student
- View active elections and candidates with photos and platforms
- Cast votes (one per election, one candidate per position)
- Review ballot before final submission
- View confirmation receipt with unique code
- View live results (when enabled by admin)

### Admin
- Create, open, close, and publish elections
- Add, edit, remove candidates with photos
- Configure election settings and live results toggle
- View voter turnout, votes per candidate, and aggregate statistics
- Full audit trail — no access to individual vote choices

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.8 |
| Database | PostgreSQL 14+ |
| ORM | Drizzle ORM 0.39 |
| Auth | Custom session-based (httpOnly secure cookies) |
| Password Hashing | bcryptjs (12 salt rounds) |
| Icons | Lucide React |
| Styling | Tailwind CSS v4 + Custom CSS (Icy Blue palette) |

---

## Project Structure

```
school-council-voting/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout (html, body, fonts)
│   │   ├── page.tsx                  # Public homepage
│   │   ├── globals.css               # Tailwind v4 import + comprehensive responsive styles
│   │   ├── login/page.tsx            # Student/admin login
│   │   ├── signup/page.tsx           # Student registration
│   │   ├── vote/page.tsx             # Student voting area (ballot → review → confirmation → results)
│   │   ├── admin/page.tsx            # Admin dashboard (tabbed: dashboard, candidates, stats, settings)
│   │   └── api/
│   │       ├── health/route.ts       # Health check endpoint
│   │       ├── auth/
│   │       │   ├── signup/route.ts   # POST: Register a new student
│   │       │   ├── login/route.ts    # POST: Authenticate (student or admin)
│   │       │   ├── logout/route.ts   # POST: Destroy session
│   │       │   └── me/route.ts       # GET: Current user info
│   │       ├── elections/route.ts    # GET: Active elections
│   │       ├── candidates/[electionId]/route.ts  # GET: Candidates for election
│   │       ├── vote/route.ts         # POST: Submit anonymous ballot
│   │       ├── vote/status/route.ts  # GET: Check vote status
│   │       ├── results/[electionId]/route.ts  # GET: Live results
│   │       └── admin/
│   │           ├── elections/route.ts        # GET/POST/PATCH: Election CRUD
│   │           ├── candidates/route.ts       # GET/POST: List and add candidates
│   │           ├── candidates/[id]/route.ts  # PATCH/DELETE: Update or remove candidate
│   │           ├── stats/[electionId]/route.ts  # GET: Vote statistics
│   │           ├── positions/route.ts        # GET/POST/DELETE: Position management
│   │           └── voters/route.ts           # GET/POST/DELETE: Voter eligibility management
│   ├── components/
│   │   ├── admin/AdminDashboard.tsx  # Admin dashboard with tabbed interface
│   │   └── vote/VoteArea.tsx         # Student voting interface (ballot, review, confirmation, results)
│   ├── db/
│   │   ├── schema.ts                 # Drizzle schema (11 tables)
│   │   ├── index.ts                  # Lazy database connection (proxy-based)
│   │   ├── env.ts                    # Environment variable loader for CLI scripts
│   │   ├── seed.ts                   # CLI seeder script
│   │   └── seed-data.ts             # Demo dataset for development
│   ├── lib/
│   │   ├── auth.ts                   # Session creation, validation, destruction
│   │   ├── elections.ts              # Election state machine, transition logic, resolution
│   │   ├── election-ids.ts           # Fixed UUIDs for demo data
│   │   ├── password.ts               # bcrypt hash and verify
│   │   ├── rate-limit.ts            # Sliding-window rate limiter and progressive failure delay
│   │   └── validators.ts             # Input validation helpers
│   ├── instrumentation.ts            # Session cleanup on server start
│   └── middleware.ts                  # Route protection (student/admin)
├── public/
│   └── candidates/                   # Candidate images (SVG placeholders)
├── tests/
│   ├── integration/                  # Integration tests (vitest)
│   └── setup/                        # Test setup (global database setup)
├── drizzle/                          # Drizzle Kit migration files and metadata
├── package.json
├── tsconfig.json
├── vitest.config.ts                  # Vitest configuration
└── README.md
```

---

## Quick Start

### Prerequisites

- **Node.js 18+** and npm
- **PostgreSQL 14+** running locally

### 1. Install dependencies

```bash
cd voting_system
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL credentials:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/voting_db
SESSION_SECRET=your-random-secret-at-least-32-chars-long
SESSION_MAX_AGE_HOURS=8
```

### 3. Create the database

```bash
createdb voting_db
```

Or if using the default `postgres` user:

```bash
psql -U postgres -c "CREATE DATABASE voting_db;"
```

### 4. Push the schema

```bash
npx drizzle-kit push
```

### 5. Seed demo data (optional)

```bash
npm run db:seed
```

### 6. Start the dev server

```bash
npm run dev
```

### 7. Open the app

- **Homepage**: http://localhost:3000
- **Student login**: School ID `STU-2026-1842`, Password `student123`
- **Admin login**: School ID `ADM-001`, Password `admin123`

> Demo data is seeded automatically via `db:seed`. The seeder is idempotent and safe to re-run.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | — | Secret for session token hashing (min 32 chars) |
| `SESSION_MAX_AGE_HOURS` | No | `8` | Session lifetime in hours |
| `NODE_ENV` | No | `development` | `development` or `production` |

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Student and admin accounts (identity) |
| `sessions` | Server-side session tokens |
| `device_tokens` | Device tracking (prevents multi-account abuse) |
| `elections` | Election definitions with state machine |
| `election_positions` | Positions (President, VP, Secretary, etc.) |
| `candidates` | Candidate profiles and platforms |
| `election_voters` | Eligibility and voting status per election |
| `ballots` | **Anonymous** ballot submissions |
| `ballot_selections` | **Anonymous** individual selections per ballot |
| `election_results` | Denormalized vote tallies (for published results) |
| `audit_logs` | Activity trail for accountability |

### Key Design Decisions

1. **`ballots` has NO voter foreign key** — This is the core privacy guarantee. Ballots are anonymous.
2. **`election_voters.votedAt`** tracks who has voted but contains no link to ballot contents.
3. **`ballot_selections`** only references ballot → candidate, never voter.
4. **`receipt_hash`** stores a one-way SHA-256 hash of the receipt code for verification.
5. **Lazy DB connection** — The database pool is created on first use via a Proxy, so the app builds without `DATABASE_URL` at build time.

### Election State Machine

```
draft → open → closed → published
```

- **draft**: Being set up by admin
- **open**: Accepting votes
- **closed**: Voting ended
- **published**: Results publicly visible

### Indexes

The schema includes targeted indexes for performance:
- `profiles`: indexed on `school_id` and `email`
- `sessions`: indexed on `token`, `user_id`, and `expires_at`
- `elections`: indexed on `state`
- `candidates`: indexed on `position_id`
- `ballots`: indexed on `election_id`
- `ballot_selections`: composite index on `(position_id, candidate_id)` for anonymous tallying
- `election_voters`: unique composite index on `(election_id, voter_id)`, index on `(election_id, voted_at)` for turnout queries

---

## Authentication

### How It Works

1. **Signup**: Student provides name, school ID, email, and password. Password is hashed with bcrypt (12 rounds). A session cookie is set on success.

2. **Login**: School ID + password are verified against the database. On success, a server-side session is created and an httpOnly cookie is set.

3. **Sessions**:
   - Stored in the `sessions` table (server-side)
   - Token is a random 48-byte hex string, hashed with SHA-256 before storage
   - Cookie name: `scv_session`
   - Cookie attributes: `httpOnly`, `secure` (in production), `sameSite: lax`
   - Default expiration: 8 hours
   - IP hash and user agent are logged for device tracking

4. **Route Protection**:
   - Next.js middleware (`src/middleware.ts`) checks for session cookie on protected routes
   - API routes call `requireAuth("student")` or `requireAuth("admin")` which validates the session server-side
   - Middleware redirects unauthenticated users to the appropriate login page

### Duplicate Prevention

- **School ID**: Unique constraint in database (primary student identifier)
- **Email**: Unique constraint in database
- **Device tokens**: Optional device fingerprinting stored in `device_tokens` table
- **One account per device**: Tracked via device fingerprints, but not the sole identifier — students may legitimately share devices

### Login Behavior

- The login page handles both student and admin accounts
- After login, students are redirected to `/vote`
- Admins are redirected to `/admin`
- Logged-in users are redirected away from `/login` and `/signup`

---

## Student Workflow

### 1. Sign Up
- Fill in first name, last name, school ID, school email, password
- System validates all fields (format, length, uniqueness)
- Account is created and student is logged in automatically

### 2. View Election
- See election title, description, status, and school year
- View all candidates grouped by position, with photos, introductions, and platforms

### 3. Cast Vote
- Select one candidate per position
- Sticky ballot footer shows privacy reminder and review button
- Review page shows all selections with a confirmation checkbox
- Warning: "Your vote cannot be changed after submission"
- Submit securely

### 4. Confirmation
- Unique receipt code displayed (format: `NF-XXXXXXXX`)
- Privacy notice: "Your vote remains private"
- Option to view live results (if enabled by admin)

### 5. Already Voted
- "You have already voted in this election" banner
- Thank you message with privacy assurance
- Live results button (if enabled)

### 6. Not Eligible / Election Closed
- Appropriate status messages for ineligible voters or closed elections

---

## Admin Workflow

### Dashboard Tab
- Election status banner with quick action buttons (Open/Close)
- Stat cards: eligible voters, votes cast, turnout %, status
- Candidate overview table with quick add
- Quick actions panel (links to other tabs)

### Candidates Tab
- Full candidate table with name, position, grade, approval status
- Add candidate modal (name, grade, position, introduction, platform)
- Delete candidates with confirmation
- Candidate approval status display

### Vote Statistics Tab
- Total eligible voters, total votes, turnout percentage, position count
- Per-position breakdown with horizontal bar charts
- Vote counts per candidate, sorted by votes descending

### Settings Tab
- Election status controls (Open / Close / Publish Results)
- Live results toggle (enable/disable)
- Election details (title, school year, start/end dates)
- Vote privacy guarantee notice

### Election Management API
- Create new elections (title, description, school year, dates)
- Update election state (draft → open → closed → published)
- Toggle live result visibility
- View election statistics with enriched counts

### Position Management API
- Create positions within an election
- List positions for an election
- Delete positions

---

## Voting Architecture & Privacy

### The Privacy Guarantee

The system is designed so that **no single table or query links a student to their ballot choices**.

```
Student → election_voters (votedAt=true)   ← No ballot link
Student → (cannot reach) ballots            ← No voter foreign key
ballots → ballot_selections → candidates    ← Anonymous chain
```

### How Voting Works (Server-Side)

1. Student's session is validated via `requireAuth("student")`
2. Election state is verified (must be `"open"` and within date range)
3. Voter eligibility is checked in `election_voters`
4. **Row-level lock** (`FOR UPDATE`) prevents concurrent submissions
5. All candidate selections are validated against position constraints
6. Anonymous ballot is created (no voter ID)
7. `election_voters.votedAt` is set with a receipt hash (marks as voted)
8. Audit log entry is created with `actorId: null` (no voter identity)
9. Receipt code is returned to the student

### What Admins Can See
- ✅ How many students voted
- ✅ Total votes per candidate
- ✅ Voter turnout percentage
- ✅ Votes broken down by position
- ❌ **Which student voted for which candidate**
- ❌ **Individual ballot contents**

### What Students Can See
- ✅ Their own confirmation code
- ✅ Whether they've voted
- ✅ Live results (if enabled by admin)
- ❌ Other students' votes

### Server-Side Ballot Validation

The vote submission endpoint (`POST /api/vote`) performs these checks inside a database transaction:

1. Voter is eligible for the election
2. Voter has not already voted
3. Election is in `open` state
4. Current time is within the voting window
5. All candidate IDs exist and belong to valid positions
6. Selection count per position is within `maxSelections`
7. All selected candidates are approved
8. Selections match position assignments

---

## API Routes

### Public (No Authentication)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/signup` | Register a new student |
| POST | `/api/auth/login` | Authenticate (student or admin) |

### Authenticated

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/logout` | Any | Destroy session |
| GET | `/api/auth/me` | Any | Get current user info |
| GET | `/api/elections` | Any | Get active elections |
| GET | `/api/candidates/:electionId` | Any | Get candidates for election |
| GET | `/api/vote/status` | Student | Check voting status (`?electionId=...`) |
| POST | `/api/vote` | Student | Submit a ballot |
| GET | `/api/results/:electionId` | Student | Get results (if `showLiveResults` enabled) |

### Admin Only

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/elections` | List elections with stats |
| POST | `/api/admin/elections` | Create a new election |
| PATCH | `/api/admin/elections` | Update election (state, settings) |
| GET | `/api/admin/candidates` | List candidates (`?electionId=...`) |
| POST | `/api/admin/candidates` | Add a candidate |
| PATCH | `/api/admin/candidates/:id` | Update a candidate |
| DELETE | `/api/admin/candidates/:id` | Remove a candidate |
| GET | `/api/admin/stats/:electionId` | Get vote statistics |
| GET | `/api/admin/positions` | List positions (`?electionId=...`) |
| POST | `/api/admin/positions` | Create a position |
| DELETE | `/api/admin/positions?id=...` | Delete a position |

---

## Responsive Design

The application is fully responsive across all screen sizes using CSS custom properties and media queries:

| Breakpoint | Layout Changes |
|-----------|---------------|
| > 1050px | Full desktop layout with sidebar (admin), multi-column grids |
| ≤ 1050px | 2-column grids collapse to single column |
| ≤ 768px | Mobile: sidebar becomes overlay, stacked layouts, full-width cards, hamburger menu |
| ≤ 480px | Small mobile: simplified navigation, single-column everything, compact padding |

Key responsive behaviors:
- **Admin sidebar** becomes a slide-out overlay on mobile with a hamburger menu button
- **Candidate cards** use `auto-fill` grid that naturally reflows from 3→2→1 columns
- **Review page** stacks position labels above choices on small screens
- **Stat grids** collapse from 4 columns to 2 on tablet, 1 on mobile
- **Hero section** uses `clamp()` for fluid typography
- **All buttons** have adequate touch targets for mobile/tablet
- **Ballot footer** becomes sticky at the bottom with a backdrop blur

---

## Security Considerations

### Implemented

1. **bcrypt password hashing** (12 salt rounds)
2. **httpOnly, secure, SameSite cookies** for session management
3. **Server-side session validation** (sessions stored in database, not just cookie presence)
4. **CSRF protection** via SameSite cookie policy
5. **Input validation** on all API endpoints (length limits, format checks, required fields)
6. **SQL injection prevention** via parameterized queries (Drizzle ORM)
7. **Row-level locking** (`FOR UPDATE`) to prevent race conditions on vote submission
8. **One vote per student per election** enforced at the database level (unique composite index)
9. **Role-based access control** for all protected routes (middleware + `requireAuth()`)
10. **Anonymous ballots** — no voter ID in ballot table, no foreign key link
11. **Audit logging** for accountability (vote submissions logged without voter identity)
12. **Transaction isolation** — vote submission runs entirely within a database transaction
13. **Lazy DB connection** — database pool only initializes at runtime, not during build

### Security Architecture

- **Authentication**: Cookie-based sessions with server-side storage in `sessions` table
- **Authorization**: Next.js middleware for page routes + `requireAuth()` for API routes
- **Data isolation**: `ballots` table deliberately has no foreign key to `profiles`
- **Race condition prevention**: Database-level `FOR UPDATE` locks during vote submission
- **Input sanitization**: All user inputs are trimmed and length-limited
- **Device tracking**: Device fingerprints stored in `device_tokens` (supplementary, not sole identifier)

### Important Notes

- **One Account Per Device**: Device fingerprints are tracked as a supplementary measure. The system does not depend solely on device fingerprinting because students may share devices. School ID remains the primary identity.
- **No Password Reset**: For a school system, password resets should be handled by school IT staff directly. This can be added as an admin function.
- **HTTPS Required**: In production, always use HTTPS. The `secure` flag on session cookies requires it.
- **Session Cleanup**: Expired sessions should be periodically cleaned up. The `sessions.expires_at` index supports efficient cleanup queries.

---

## Deployment

### Environment Setup

1. Set up a PostgreSQL database (e.g., on Supabase, AWS RDS, Railway, or Neon)
2. Set all required environment variables
3. Run the database migration:
   ```bash
   npx drizzle-kit push
   ```

### Build & Deploy

```bash
# Build for production
npm run build

# Start the production server
npm start

# Run integration tests (requires a running server)
npm run build && vitest run
```

### Recommended Platforms

- **Vercel**: Seamless Next.js deployment with automatic builds
- **Railway**: Easy PostgreSQL + Node.js hosting
- **Docker**: Containerized deployment for any infrastructure

### Docker Example

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

> **Note**: For standalone output, add `output: "standalone"` to `next.config.ts`.

### Testing

```bash
# Run integration tests (requires a running PostgreSQL and production build)
npm run build && vitest run
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use a strong `SESSION_SECRET` (32+ random characters)
- [ ] Enable HTTPS (required for secure cookies)
- [ ] Set appropriate `SESSION_MAX_AGE_HOURS`
- [ ] Configure PostgreSQL connection pooling (e.g., PgBouncer)
- [ ] Set up automated database backups
- [ ] Add rate limiting to authentication endpoints
- [ ] Review and restrict CORS settings if needed
- [ ] Set up monitoring and error tracking
- [ ] Configure periodic session cleanup for expired tokens

---

## Color Palette

| Color | Hex | CSS Variable | Usage |
|-------|-----|-------------|-------|
| Deep Navy | `#091540` | `--deep-navy` | Primary background, headers, sidebar, text |
| Persian Blue | `#1B2CC1` | `--persian-blue` | Primary actions, buttons, accents, links |
| Cornflower Blue | `#7692FF` | `--cornflower` | Secondary accents, highlights, result bars |
| Icy Blue | `#ABD2FA` | `--icy-blue` | Cards, borders, light backgrounds, badges |
| Dusk Blue | `#3D518C` | `--dusk-blue` | Secondary text, subtle elements, gradients |

Additional design tokens:
- `--bg: #f0f4fc` — Page background
- `--card: #ffffff` — Card backgrounds
- `--line: #d8e3f5` — Borders and dividers
- `--ink: #0c1a36` — Body text
- `--muted: #6b7a9a` — Secondary/muted text
- `--success: #1a9a68` — Success states
- `--error: #c22a2a` — Error states
- `--warning: #966c12` — Warning states

The overall design feels clean, academic, modern, trustworthy, minimal, professional, and slightly futuristic.

---

## Demo Data

The application automatically seeds demo data on the first API request (via `ensureDemoElection()`). This includes:

### Accounts
| Role | School ID | Password | Name |
|------|-----------|----------|------|
| Student | `STU-2026-1842` | `student123` | Alex Morgan |
| Admin | `ADM-001` | `admin123` | Dr. Evelyn Reed |

### Election
- **Title**: Student Council General Election
- **School Year**: 2025-2026
- **State**: Open
- **Description**: "Choose the student leaders who will represent Northfield Academy."

### Positions & Candidates

| Position | Candidates |
|----------|-----------|
| President | Maya Chen (Grade 11), Liam Okafor (Grade 12) |
| Vice President | Sofia Reyes (Grade 11) |
| Secretary | Ethan Nguyen (Grade 10) |

### Voter Eligibility
- The demo student (Alex Morgan) is pre-registered as eligible for the demo election.

---

## Database Management Commands

```bash
# Push schema changes to database (no migration files)
npx drizzle-kit push

# Generate migration files
npx drizzle-kit generate

# Run pending migrations
npx drizzle-kit migrate

# Open Drizzle Studio (visual database browser)
npx drizzle-kit studio

# Seed demo data (idempotent, dev only)
npm run db:seed
```

---

## License

Internal use for school council elections.
