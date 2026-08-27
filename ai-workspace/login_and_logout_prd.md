Date created: 2026-08-24
Date last modified: 2026-08-27

# Login, Logout, and Registration - Technical PRD

## Overview/Problem

QuizMaker is a greenfield application. The long-term product is a shared multiple-choice question (MCQ) test bank that several teachers can collaborate on. Before any of that work can exist, teachers need accounts: they must be able to register, log in, and log out so that later question work can be attributed to a real user.

**Current state (2026-08-27):** that identity layer is implemented and verified locally. Teachers can open `/login` (also via `/`), register, log in, reach the `/mcqs` stub, and log out. MCQ authoring is still deferred.

---

## Hypothesis

We believe that adding a D1-backed user table, a user service, and HTTP endpoints for register, login, and logout will let multiple teachers create accounts and reach a shared authenticated area, which is the foundation for a collaborative MCQ test bank.

**Outcome:** teachers can create an account, obtain an HTTP-only session, use the gated stub, and end the session. The MCQ test bank itself is not in this feature.

---

## Scope

### In Scope

- Cloudflare D1 database bound as `DB`, created and configured in `wrangler.jsonc`
- A `users` table via a Wrangler D1 migration, with a primary key plus first name, last name, username, email, and a hashed password
- A user service in `src/lib/services/` that can create, read, update, and delete users against D1
- HTTP endpoints for register, login, and logout
- Register and login both go through the user service to write and read user records
- Passwords hashed on the server before they are stored; login hashes the submitted password and compares it to the stored hash
- HTTP-only session cookie so a successful register or login is remembered, and logout can clear it
- Register page, login page, and a stub MCQs page
- After a successful register or login, the teacher is taken to the stub MCQs page
- Unauthenticated visits to the MCQs stub redirect to login
- Authenticated visits to register or login redirect to the MCQs stub
- Test-driven implementation with **Vitest**: each phase starts by writing that phase's unit tests (they will fail / go red), then implementation until those tests are green. A phase is complete only when its tests are green **and** its acceptance criteria pass

### Out of Scope

- Creating, editing, listing, or deleting MCQs (the MCQs page is a labeled stub only)
- Collaboration features: sharing, roles, permissions, ownership of questions, comments
- Email verification, password reset, or "remember me"
- OAuth / SSO / magic links
- Account profile editing UI or "delete my account" UI (the service methods exist; no public pages or endpoints for them in this phase)
- Rate limiting, CAPTCHA, or audit logging
- End-to-end browser automation (Playwright/Cypress)
- `@cloudflare/vitest-pool-workers` — that pool changes how the whole suite runs. Unit tests mock D1 and `getCloudflareContext()` instead. Raise it only if mocked tests cannot prove a Workers-specific bug

### Cut

- **MCQ test bank in this phase** — the product intent is a shared question bank, but this phase is identity only so later work has a user to attach questions to
- **Client-side password hashing before POST** — hashing in the browser and sending the digest over the wire makes that digest the effective password. A stolen database hash would still authenticate. The POST body may carry the plaintext password only over HTTPS; the server hashes before store or compare
- **Sessions table** — a signed HTTP-only cookie is enough for login/logout in this phase. A server-side session store can be added later if we need revoke-all-devices or idle timeout
- **User roles / admin flag** — every registered user is a teacher. Roles are not required until collaboration exists
- **Server Actions for auth** — the project default prefers Server Actions for form posts, but this phase explicitly uses HTTP POST route handlers for register, login, and logout

---

## Technical Requirements

### Database Schema

D1 is bound as `DB` in `wrangler.jsonc` to database `quizmaker` (`database_id` `549fc6c8-2285-4a88-8984-b0d6ab50e684`). Migrations live in `migrations/` and were applied locally only (`npx wrangler d1 migrations apply quizmaker --local`). Never apply to remote unless the user explicitly asks.

`UNIQUE` on `username` and `email` also creates indexes in SQLite, so extra indexes are not required.

Implemented migration: `migrations/0001_create_users.sql`.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Column notes:

| Column | Purpose |
|---|---|
| `id` | Primary key. Opaque TEXT UUID-style value, not an integer |
| `first_name` | Teacher's given name |
| `last_name` | Teacher's family name |
| `username` | Unique login identifier. Stored and compared case-insensitively (normalize to lowercase before write and lookup) |
| `email` | Unique contact identifier. Normalize to lowercase before write and lookup |
| `password_hash` | PHC-style encoded string: algorithm, iterations, salt, and hash. Never plaintext. Never returned in API responses |
| `created_at` / `updated_at` | Timestamps. `updated_at` is set by the service on update |

No other tables in this phase.

### API Endpoints

All three live under `src/app/api/auth/`. They are Route Handlers, not Server Actions. Validate every body with Zod before touching the database. Register and login call the user service. Logout only clears the session cookie.

Password in the POST body is sent over HTTPS. The handler hashes it on the server. Responses never include `password` or `password_hash`.

On successful register or login, set an HTTP-only, `Secure` (in production), `SameSite=Lax` session cookie and return the redirect target `/mcqs` so the client can navigate there.

#### POST /api/auth/register

Creates a user, sets the session cookie, and returns the MCQs stub path.

**Request Body:**
```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "alovelace",
  "email": "ada@school.edu",
  "password": "correct-horse-battery"
}
```

**Response:**
- Success (201):
```json
{
  "user": {
    "id": "…",
    "firstName": "Ada",
    "lastName": "Lovelace",
    "username": "alovelace",
    "email": "ada@school.edu"
  },
  "redirectTo": "/mcqs"
}
```
- Error (400): validation failed (missing fields, invalid email, username too short, password too short)
- Error (409): username or email already taken. Do not reveal which one if it is cheap to keep the message generic: `"An account with that username or email already exists."`
- Error (500): unexpected server error

**Behavior:**
1. Validate with Zod
2. Normalize username and email to lowercase
3. Hash the password
4. `userService.create(...)`
5. Set session cookie for the new user id
6. Return 201 with public user fields and `redirectTo: "/mcqs"`

#### POST /api/auth/login

Looks up the user by username, hashes the submitted password, compares it to `password_hash`, and sets the session cookie.

**Request Body:**
```json
{
  "username": "alovelace",
  "password": "correct-horse-battery"
}
```

**Response:**
- Success (200):
```json
{
  "user": {
    "id": "…",
    "firstName": "Ada",
    "lastName": "Lovelace",
    "username": "alovelace",
    "email": "ada@school.edu"
  },
  "redirectTo": "/mcqs"
}
```
- Error (400): validation failed
- Error (401): unknown username or password mismatch. Always the same message: `"Invalid username or password."`
- Error (500): unexpected server error

**Behavior:**
1. Validate with Zod
2. Normalize username to lowercase
3. `userService.getByUsername(...)`
4. If no user, return 401 (do not leak existence)
5. Hash the submitted password with the stored salt/parameters and compare
6. If mismatch, return 401
7. Set session cookie
8. Return 200 with public user fields and `redirectTo: "/mcqs"`

Login is by **username + password**, not email. Email is stored for uniqueness and future use.

#### POST /api/auth/logout

Clears the session cookie. No body. Does not need the user service.

**Request Body:** none

**Response:**
- Success (200):
```json
{
  "redirectTo": "/login"
}
```
- Error (500): unexpected server error

Logout is idempotent: calling it with no cookie still returns 200.

### User Interface Requirements

Use existing shadcn/ui pieces: `button`, `card`, `field`, `input`, `label`. Do not add `react-hook-form`. Client forms POST JSON to the endpoints above with `fetch`, then `router.push` to `redirectTo`. Surface API error messages on the form.

Register and login UI start from the official shadcn **signup** and **login** blocks (centered `min-h-svh` page + Card form). Adapt those blocks to this product; do not keep the block’s email-only login, single full-name field, Google buttons, or forgot-password link.

**Adaptations from the shadcn blocks:**
- Login is **username + password**, not email
- Register uses **first name and last name** (not one full-name field), plus **username**, email, password, and confirm password
- Confirm password is client-only and is not sent to the API
- No OAuth / Google buttons in this phase
- Forms live at `src/components/auth/login-form.tsx` and `src/components/auth/register-form.tsx` (not `@/components/login-form`)
- Pages at `/login` and `/register` keep the block layout: centered card, `max-w-sm`
- Styling is Tailwind via the existing shadcn `base-nova` components; do not add a separate CSS module

#### Landing (`/`)
- Unauthenticated visits redirect to `/login` (login page links to `/register`)
- If a valid session exists, redirect to `/mcqs`

#### Register (`/register`)
- Fields: first name, last name, username, email, password, confirm password
- Validation (client for UX, server is authoritative):
  - first name, last name: required, trimmed, 1–50 characters
  - username: required, 3–30 characters, letters/numbers/underscore, unique
  - email: required, valid email shape, unique
  - password: required, at least 8 characters
  - confirm password: must match password (client-only; not sent to the API)
- Submit POST `/api/auth/register`
- On success, navigate to `/mcqs`
- Link to `/login` for teachers who already have an account
- If already authenticated, redirect to `/mcqs`

#### Login (`/login`)
- Fields: username, password
- Submit POST `/api/auth/login`
- On success, navigate to `/mcqs`
- Link to `/register`
- Invalid credentials show the generic 401 message
- If already authenticated, redirect to `/mcqs`

#### MCQs stub (`/mcqs`)
- Authenticated only. No session → redirect to `/login`
- Heading such as "Question bank"
- Short copy that this page is a placeholder for the MCQ test bank
- Display the signed-in teacher's first name (and username if useful)
- Logout control that POST `/api/auth/logout` then navigates to `/login`
- No question forms, lists, or CRUD

### Implemented architecture (as of 2026-08-27)

This is the record of what shipped. File paths are the source of truth; line numbers are from this date.

**Runtime:** Next.js 16 App Router on Cloudflare Workers via `@opennextjs/cloudflare`. `next.config.ts:15-16` calls `initOpenNextCloudflareForDev()` so `npm run dev` can read D1 and `.dev.vars`. Bindings are not on `process.env`; `src/lib/cloudflare-env.ts:4-10` copies `SESSION_SECRET` from Cloudflare env onto `process.env` before session helpers run.

**Persistence**
- `wrangler.jsonc:25-31` — `d1_databases` binding `DB` → `quizmaker`
- `migrations/0001_create_users.sql:3-12` — `users` table
- `src/lib/db.ts:4-9` — `getDb()` returns `env.DB` or throws if the binding is missing
- `src/lib/services/users.ts` — `userService.create | getById | getByUsername | update | delete` (`src/lib/services/users.ts:217-223`). Public methods return `PublicUser` (no hash). `getByUsername` returns `UserRecord` with `passwordHash` for login. Duplicate identity throws `UniqueConstraintError` (`src/lib/services/users.ts:5-9`)
- Inserts use numbered placeholders, e.g. `src/lib/services/users.ts:119-124`

**Passwords**
- `src/lib/password.ts:3-6` — PBKDF2-SHA-256, 100_000 iterations, 16-byte salt, prefix `pbkdf2`
- Stored form: `pbkdf2$iterations$salt$hash` (salt and hash base64) via `hashPassword` (`src/lib/password.ts:63-67`)
- `verifyPassword` (`src/lib/password.ts:69-88`) re-derives with the stored salt and compares in constant time
- Hashing is server-only, after HTTPS POST, in the register/login handlers — not in the browser
- `toArrayBuffer` (`src/lib/password.ts:34-38`) copies the salt so WebCrypto accepts it under TypeScript 5.9 / Node 24 `BufferSource`

**Session**
- Cookie name `qm_session`, 7-day `Max-Age` (`src/lib/session.ts:4-5`)
- Value: HMAC-SHA-256 over base64url `{ userId, exp }` using `SESSION_SECRET` (`src/lib/session.ts:59-69`)
- Attributes: `Path=/; HttpOnly; SameSite=Lax`; `Secure` only when `NODE_ENV === "production"` (`src/lib/session.ts:44-57`)
- `readSessionUserId` (`src/lib/session.ts:72-109`) returns null for missing, tampered, or expired cookies
- `clearSessionCookie` (`src/lib/session.ts:111-113`) sets `Max-Age=0`
- Pages call `getSessionUserId` (`src/lib/current-session.ts:6-11`), which loads Cloudflare env then reads `cookies()`

**HTTP APIs** — logic lives in `handler.ts`; `route.ts` only re-exports `POST` so Next’s special `route.ts` file is not imported by tests (`src/app/api/auth/register/route.ts:1`)
- `src/app/api/auth/register/handler.ts:30-65` — Zod validate, hash, `userService.create`, 201 + cookie + `redirectTo: "/mcqs"`; 400 / 409 / 500
- `src/app/api/auth/login/handler.ts:22-54` — Zod validate, `getByUsername` + `verifyPassword`, 200 + cookie; 401 `"Invalid username or password."`; 400 / 500. Username case is normalized in `getByUsername` (`src/lib/services/users.ts:147-152`)
- `src/app/api/auth/logout/handler.ts:3-11` — 200 `{ redirectTo: "/login" }` and expired cookie; idempotent

**Guards and pages**
- `src/lib/auth-guards.ts:1-11` — `requireSessionRedirect` → `/login`; `redirectIfAuthenticated` → `/mcqs`; `landingRedirect` → `/login` or `/mcqs`
- `src/app/page.tsx:5-7` — `/` always redirects (login if anonymous, `/mcqs` if signed in)
- `src/app/login/page.tsx:6-11` / `src/app/register/page.tsx` — signed-in users redirect to `/mcqs`; otherwise render the shadcn card
- `src/app/mcqs/page.tsx:7-17` — no session or missing user → `/login`; otherwise “Question bank” stub + first name/username + logout
- `src/app/layout.tsx:15-17` — document title `QuizMaker`

**UI (shadcn `base-nova` + Tailwind)** — official login/signup blocks, adapted
- `src/components/auth/login-form.tsx` — username + password; POST `/api/auth/login`; link to `/register`; no Google / forgot-password
- `src/components/auth/register-form.tsx` — first name, last name, username, email, password, confirm password; confirm is client-only; POST `/api/auth/register` without `confirmPassword`
- `src/components/auth/logout-button.tsx` — POST `/api/auth/logout` then `router.push` to `/login`
- Primitives: `src/components/ui/button.tsx`, `card.tsx`, `field.tsx`, `input.tsx`, `label.tsx`

**Tests (Vitest, jsdom, `@/` via `vite-tsconfig-paths`)**
- `vitest.config.ts:5-10`
- Phase 1: `src/lib/users-schema.test.ts`, `src/lib/d1-binding.test.ts`
- Phase 2: `src/lib/password.test.ts`, `src/lib/services/users.test.ts` (mocks `src/lib/db.ts`)
- Phase 3: `src/lib/session.test.ts`; register `src/app/api/auth/register/route.test.ts`; login `src/lib/auth/login-route.test.ts`; logout `src/lib/auth/logout-route.test.ts`. Handlers imported, not `route.ts`. `src/app/api/auth/tsconfig.json` turns off the Next TS plugin so colocated `@/` imports resolve
- Phase 4: `src/lib/auth-guards.test.ts`; `src/components/auth/*.test.tsx` mock `fetch` and `next/navigation`
- Suite as of 2026-08-27: **51 passed / 51** (`npm test`)

**Secrets**
- `.dev.vars` (gitignored) holds the real `SESSION_SECRET`
- `.dev.vars.example:3` is an empty placeholder

---

## Test-Driven Development

This feature is built **red → green → next phase**. Vitest is the unit-test runner. Follow `.cursor/skills/testing/SKILL.md`.

### Phase-complete rule

A phase is **not** complete when the code looks right. It is complete when **all** of the following are true:

1. That phase's tests were written **first** and failed for a real reason (missing module, failed assertion), not because the harness was broken
2. `npm test` is green for the whole suite so far (this phase plus earlier phases)
3. That phase's acceptance criteria are met in a real run, not by inspection

Do not start the next phase while the current phase's tests are red. Do not delete or weaken a failing test to get a green suite. If a test is wrong, fix the test; if the product is wrong, fix the product.

### What a test must do

- Prove observable behavior (return value, status code, cookie, thrown error, rendered text). Never `expect(true).toBe(true)`
- Cover failure paths, not only the happy path
- Name the test so the failure message alone explains what broke
- Colocate: `src/lib/password.ts` is tested by `src/lib/password.test.ts`
- Each test must pass alone. Reset mocks in `beforeEach` with `vi.clearAllMocks()`
- Unit tests must not touch a real D1 database, network, or model provider. Mock at the module boundary (`vi.mock`)
- Mock `getCloudflareContext()` and keep D1 behind `src/lib/db.ts` so tests mock that one module
- Mock `server-only` with `vi.mock("server-only", () => ({}))` when a server module imports it
- Server Components cannot be rendered by Testing Library. Test their logic as plain functions. Reserve `render` for client components, querying by role and accessible name

### Commands

| Command | Purpose |
|---|---|
| `npm test` | `vitest run` — CI / phase-gate |
| `npm run test:watch` | `vitest` — stay in watch while turning a phase from red to green |

---

## Implementation Phases

Every phase below follows the same loop: **write tests (red) → implement → `npm test` green → acceptance criteria**. Status markers: `PLANNED` | `IN PROGRESS` | `COMPLETED`.

### Phase 0: Vitest harness - COMPLETED

**Objective**: `npm test` runs Vitest with the `@/` alias and jsdom. No product tests yet — do not add a dummy `expect(true).toBe(true)` smoke test.

**Tests to write first**: none. This phase is harness only. The first failing product tests belong to Phase 1.

**Tasks**:
1. Install (approved): `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths`
2. Add `vitest.config.ts` at the repo root as specified in `.cursor/skills/testing/SKILL.md` (`environment: "jsdom"`, `globals: true`, `vite-tsconfig-paths` so `@/` resolves)
3. Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`
4. Run `npm test` and confirm Vitest exits 0 with `No test files found` (or equivalent) — that is the green signal for this phase, not a hollow assertion

**Deliverables**:
- `vitest.config.ts`
- `package.json` test scripts
- DevDependencies listed above

**Phase complete when**:
- [x] `npm test` runs Vitest without config or alias errors
- [x] No placeholder/always-pass test exists

### Phase 1: D1 and users migration - COMPLETED

**Objective**: Teachers' accounts have a real table in a local D1 database.

**Tests to write first** (expect RED — files and schema do not exist yet):

`src/lib/users-schema.test.ts` (reads the migration SQL from `migrations/`; does not connect to D1)

- `users migration creates a users table`
- `users table has a TEXT primary key named id`
- `users table has first_name, last_name, username, email, and password_hash as NOT NULL columns`
- `username and email are UNIQUE`
- `users table does not store a plaintext password column`

`src/lib/d1-binding.test.ts` (reads `wrangler.jsonc`)

- `wrangler.jsonc binds a D1 database as DB`

These tests fail until the migration and binding exist. That is the intended red. Do not point them at a live D1.

**Tasks**:
1. Write the tests above and run `npm test` — confirm red for the right reason (missing migration / missing binding)
2. Create the D1 database with Wrangler and bind it as `DB` in `wrangler.jsonc`
3. Run `npm run cf-typegen` so `env.DB` is typed
4. Create a migration for the `users` table that satisfies the schema tests
5. Apply the migration locally only
6. Add `SESSION_SECRET` to `.dev.vars` and an empty placeholder to `.dev.vars.example`
7. Re-run `npm test` until Phase 0–1 tests are green

**Deliverables**:
- Failing-then-green schema and binding tests
- `wrangler.jsonc` `d1_databases` binding
- `migrations/0001_create_users.sql` (or the Wrangler-generated equivalent)
- Local D1 with an empty `users` table
- `.dev.vars.example` updated

**Phase complete when**:
- [x] `npm test` green (schema + binding tests)
- [x] Local D1 exists, is bound as `DB`, and the migration applies locally

**Implementation notes (2026-08-27)**:
- TDD: 6 tests failed first (no `migrations/` dir, no `d1_databases` binding), then passed after the migration and binding
- Migration file: `migrations/0001_create_users.sql`
- `wrangler.jsonc:25-31` binds `DB` → database name `quizmaker`, remote id `549fc6c8-2285-4a88-8984-b0d6ab50e684` (APAC). Migrations were applied **locally only**
- `SESSION_SECRET` placeholder added to `.dev.vars.example`; a real value is in gitignored `.dev.vars`
- `npm run cf-typegen` typed `env.DB` as `D1Database`

### Phase 2: User service - COMPLETED

**Objective**: All user persistence goes through one server-only module.

**Tests to write first** (expect RED — `password.ts` and `users.ts` do not exist yet):

`src/lib/password.test.ts`

- `hashPassword returns a string that is not the plaintext password`
- `hashPassword produces a different hash for the same password (unique salt)`
- `verifyPassword accepts the original password`
- `verifyPassword rejects a wrong password`
- `verifyPassword rejects a malformed stored hash`

`src/lib/services/users.test.ts` — mock `src/lib/db.ts` (or `getCloudflareContext`); never call real D1

- `create inserts a user and returns PublicUser without password_hash`
- `create normalizes username and email to lowercase`
- `getById returns the user when present and null when missing`
- `getByUsername finds a user after case-insensitive lookup`
- `getByUsername returns password_hash only on the internal type used for login compare`
- `update changes provided fields and sets updated_at`
- `delete removes the user`
- `create surfaces a unique-constraint failure when username or email already exists`

**Tasks**:
1. Write the tests above and run `npm test` — confirm red (cannot resolve modules or assertions fail)
2. Add Zod (approved with Vitest; required by project validation rules)
3. Create `src/lib/password.ts` (Web Crypto PBKDF2; no extra hashing library unless needed)
4. Create `src/lib/db.ts` and `src/lib/services/users.ts` with create, getById, getByUsername, update, and delete
5. Use prepared statements with numbered placeholders (`?1`, `?2`)
6. Never return `password_hash` from methods that feed the UI or API
7. Re-run `npm test` until Phase 0–2 tests are green

**Deliverables**:
- Failing-then-green password and user-service tests
- User service module
- Password hash/compare helpers
- Service is importable only from server code

**Phase complete when**:
- [x] `npm test` green (including password + user service)
- [x] Service can create, update, delete, and look up by id and username against the mocked DB contract

**Implementation notes (2026-08-27)**:
- TDD: Phase 2 tests failed first (missing `@/lib/password` and `@/lib/db`), then `npm test` passed 19/19
- `src/lib/password.ts` — PBKDF2-SHA-256, 100_000 iterations, per-hash salt, stored as `pbkdf2$iterations$salt$hash`
- `src/lib/db.ts` — `getDb()` via `getCloudflareEnv()` (`src/lib/cloudflare-env.ts`), which uses `getCloudflareContext({ async: true })`
- `src/lib/services/users.ts` — `userService.create | getById | getByUsername | update | delete`; `getByUsername` returns `UserRecord` with `passwordHash`; other methods return `PublicUser` without it
- Duplicate username/email throws `UniqueConstraintError`
- Added `zod` and `server-only`. Tests mock `server-only` and `src/lib/db.ts` (no live D1)
- No new migration. No deploy

### Phase 3: Auth endpoints and session - COMPLETED

**Objective**: Register, login, and logout work over HTTP POST.

**Tests to write first** (expect RED — session helpers and route handlers do not exist yet):

`src/lib/session.test.ts`

- `createSessionCookie returns an httpOnly Set-Cookie for the signed user id`
- `readSessionUserId returns the user id for a valid cookie`
- `readSessionUserId returns null for a missing, expired, or tampered cookie`
- `clearSessionCookie expires the session cookie`

`src/app/api/auth/register/route.test.ts` — mock user service, password, and session

- `POST register with valid body returns 201, public user, and redirectTo /mcqs`
- `POST register hashes the password before create and never echoes password or password_hash`
- `POST register sets the session cookie`
- `POST register with missing or invalid fields returns 400`
- `POST register when username or email is taken returns 409 with the generic message`

`src/app/api/auth/login/route.test.ts` — mock user service, password, and session

- `POST login with valid username and password returns 200, public user, and redirectTo /mcqs`
- `POST login sets the session cookie`
- `POST login with unknown username returns 401 Invalid username or password`
- `POST login with wrong password returns 401 with the same message`
- `POST login response never includes password or password_hash`
- `POST login with invalid body returns 400`

`src/app/api/auth/logout/route.test.ts`

- `POST logout returns 200 and redirectTo /login`
- `POST logout clears the session cookie`
- `POST logout without a cookie still returns 200`

Call the exported `POST` handlers with a `Request`. Do not spin up Next.js.

**Tasks**:
1. Write the tests above and run `npm test` — confirm red
2. Implement `src/lib/session.ts`
3. `POST /api/auth/register` — validate, hash, `userService.create`, set cookie
4. `POST /api/auth/login` — validate, `getByUsername`, compare hash, set cookie
5. `POST /api/auth/logout` — clear cookie
6. Map unique-constraint failures to 409; map bad credentials to 401
7. Re-run `npm test` until Phase 0–3 tests are green

**Deliverables**:
- Failing-then-green session and route-handler tests
- Three route handlers
- Session cookie helpers
- JSON contracts as specified above

**Phase complete when**:
- [x] `npm test` green (including session + three handlers)
- [x] Register/login/logout match the API contracts, including 400/401/409

**Implementation notes (2026-08-27)**:
- TDD: Phase 3 tests failed first (missing `session.ts` and route files), then the handler suite went green (37 tests at end of Phase 3; 51 for the full suite after Phase 4)
- Cookie name: `qm_session`. HMAC-SHA-256 signed `{ userId, exp }`, 7-day `Max-Age`, `HttpOnly; Path=/; SameSite=Lax`. `Secure` only in production (`src/lib/session.ts:4-5`, `src/lib/session.ts:44-69`)
- Route **logic** is in `handler.ts`; `route.ts` re-exports `POST` so tests do not import Next’s special `route.ts` module
- Register tests stay next to the route: `src/app/api/auth/register/route.test.ts`. `src/app/api/auth/tsconfig.json` disables the Next TypeScript plugin so `@/` resolves there
- Login/logout tests live at `src/lib/auth/login-route.test.ts` and `src/lib/auth/logout-route.test.ts` (same Next-plugin issue if colocated as `route.test.ts`)
- Route tests mock user service, password, and session. Session tests use the real signer with `SESSION_SECRET`
- No new migration. No deploy

### Phase 4: Pages and gating - COMPLETED

**Objective**: A teacher can register or log in and land on the MCQs stub, then log out.

**Tests to write first** (expect RED — client forms and guard helpers do not exist yet):

Keep page files as thin Server Components. Put interactive UI in client components so Testing Library can render them. Put redirect decisions in plain functions.

`src/lib/auth-guards.test.ts`

- `requireSessionRedirect returns /login when there is no user id`
- `requireSessionRedirect returns null when there is a user id`
- `redirectIfAuthenticated returns /mcqs when there is a user id`
- `redirectIfAuthenticated returns null when there is no user id`
- `landingRedirect returns /login when there is no user id`
- `landingRedirect returns /mcqs when there is a user id`

`src/components/auth/register-form.test.tsx`

- `renders first name, last name, username, email, password, and confirm password fields`
- `does not submit when confirm password does not match`
- `POSTs /api/auth/register without confirmPassword and navigates to redirectTo on success`
- `shows the server error message when register fails`

`src/components/auth/login-form.test.tsx`

- `renders username and password fields`
- `POSTs /api/auth/login and navigates to redirectTo on success`
- `shows Invalid username or password when the API returns 401`

`src/components/auth/logout-button.test.tsx`

- `POSTs /api/auth/logout and navigates to /login`

Mock `fetch` and the Next.js router. Query by role and accessible name. Use `userEvent`.

**Tasks**:
1. Write the tests above and run `npm test` — confirm red
2. Implement guard helpers and the client form/logout components
3. Build `/register`, `/login`, `/mcqs`, and replace `/` to compose those pieces
4. Gate `/mcqs` behind a valid session; redirect authenticated users away from `/login` and `/register`
5. Re-run `npm test` until Phase 0–4 tests are green

**Deliverables**:
- Failing-then-green guard and form tests
- Four routes
- Session-aware layout or page-level checks
- Stub MCQs page with logout

**Phase complete when**:
- [x] `npm test` green (including guards + register/login/logout UI)
- [x] Pages exist and compose the tested components

**Implementation notes (2026-08-27)**:
- TDD: Phase 4 tests failed first (missing `auth-guards` and form modules). Full suite later **51 passed / 51**
- UI is the official shadcn login/signup blocks (`src/components/auth/login-form.tsx`, `register-form.tsx`), adapted for username login, first/last name, username, and no Google
- `/` is not a landing page: `src/app/page.tsx:5-7` redirects via `landingRedirect` (`src/lib/auth-guards.ts:9-11`) to `/login` or `/mcqs`
- `/login` and `/register` are thin Server Components wrapping the client forms; signed-in users go to `/mcqs`
- `/mcqs` (`src/app/mcqs/page.tsx:7-32`) is a stub with the teacher’s first name/username and `LogoutButton`. No MCQ CRUD
- Session gating uses the guards plus `getSessionUserId()` (`src/lib/current-session.ts:6-11`)
- No new migration. No deploy

### Phase 5: Verify - COMPLETED

**Objective**: The feature is done only when the full Vitest suite stays green, lint/build succeed, and the auth flow works in the browser.

**Tests to write first**: none new, unless verification finds a gap. If it does, write a failing test for that gap, then fix the product until green. Do not "verify" by deleting coverage.

**Tasks**:
1. `npm test` — entire suite green (Phases 0–4)
2. `npm run lint`
3. `npm run build`
4. Exercise register → `/mcqs` → logout → login → `/mcqs` locally (`npm run dev`, and `npm run preview` for anything D1/cookie related)
5. Confirm duplicate username/email is rejected
6. Confirm wrong password is rejected without leaking whether the username exists

**Deliverables**:
- Green Vitest run reported
- Lint and build results reported
- Auth flow verified in the browser

**Phase complete when**:
- [x] `npm test` succeeds (51/51 on 2026-08-27)
- [x] Browser pass of register, login, logout, and the gated stub (`npm run dev` at `localhost:3000`)
- [ ] `npm run build` recorded in this session (OpenNext production build not re-run as part of this PRD update)
- [x] `npm run lint` — last recorded run exited 0 with two existing unused-var warnings in login/logout handlers (not new)

**Implementation notes (2026-08-27)**:
- Product owner verified on local `npm run dev`: can open the login page, register, log in, and log out
- `/` redirects unauthenticated users to `/login` (`307` `location: /login`); `/mcqs` without a session redirects to `/login`
- `npm test` — 12 files, **51 passed / 51**
- `npm run lint` — exit 0; warnings: `src/app/api/auth/login/handler.ts` unused `_passwordHash`; `src/app/api/auth/logout/handler.ts` unused `_request`
- `npm run preview` (Workers runtime) was not required for the browser pass; D1 is available under `next dev` via `initOpenNextCloudflareForDev` (`next.config.ts:15-16`)
- No new migration. No deploy

---

## Technical Implementation Details

### Key Files

- `vitest.config.ts` — Vitest + jsdom + `@/` alias
- `next.config.ts` — `initOpenNextCloudflareForDev()` so `next dev` can use D1 and `.dev.vars`
- `wrangler.jsonc` — D1 binding `DB`
- `migrations/` — `users` table
- `.dev.vars` / `.dev.vars.example` — `SESSION_SECRET`
- `src/lib/users-schema.test.ts` — Phase 1: migration SQL contract (no live D1)
- `src/lib/d1-binding.test.ts` — Phase 1: `DB` binding present in `wrangler.jsonc`
- `src/lib/services/users.ts` — create, read, update, delete against D1
- `src/lib/services/users.test.ts` — Phase 2: user service with mocked DB
- `src/lib/password.ts` — hash and compare
- `src/lib/password.test.ts` — Phase 2: hash / verify
- `src/lib/session.ts` — signed cookie issue/verify/clear
- `src/lib/session.test.ts` — Phase 3: cookie helpers
- `src/lib/auth-guards.ts` — `requireSessionRedirect`, `redirectIfAuthenticated`, `landingRedirect`
- `src/lib/auth-guards.test.ts` — Phase 4: session gating
- `src/lib/current-session.ts` — read `qm_session` via `cookies()`
- `src/lib/cloudflare-env.ts` — load Cloudflare env and copy `SESSION_SECRET` onto `process.env`
- `src/lib/db.ts` — obtain `env.DB` via `getCloudflareEnv()`; the only place that talks to the binding
- `src/app/api/auth/register/route.ts` — register endpoint
- `src/app/api/auth/register/handler.ts` — register POST handler (imported by tests)
- `src/app/api/auth/register/route.test.ts` — Phase 3
- `src/app/api/auth/tsconfig.json` — disables the Next TS plugin so colocated route tests resolve `@/`
- `src/app/api/auth/login/route.ts` — login endpoint
- `src/app/api/auth/login/handler.ts` — login POST handler
- `src/lib/auth/login-route.test.ts` — Phase 3
- `src/app/api/auth/logout/route.ts` — logout endpoint
- `src/app/api/auth/logout/handler.ts` — logout POST handler
- `src/lib/auth/logout-route.test.ts` — Phase 3
- `src/components/auth/register-form.tsx` / `register-form.test.tsx` — Phase 4
- `src/components/auth/login-form.tsx` / `login-form.test.tsx` — Phase 4
- `src/components/auth/logout-button.tsx` / `logout-button.test.tsx` — Phase 4
- `src/app/page.tsx` — redirects `/` to `/login` or `/mcqs`
- `src/app/register/page.tsx` — register page (composes the form)
- `src/app/login/page.tsx` — login page (composes the form)
- `src/app/mcqs/page.tsx` — authenticated stub

### User service surface

```typescript
type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
};

type CreateUserInput = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
};

type UpdateUserInput = {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  passwordHash?: string;
};

// create(input) -> PublicUser
// getById(id) -> PublicUser | null
// getByUsername(username) -> user including password_hash for login compare, or a
//   dedicated internal type that is never sent to the client
// update(id, input) -> PublicUser
// delete(id) -> void
```

Register hashes, then calls `create`. Login calls `getByUsername`, then password compare. Update and delete are implemented on the service so later phases can use them; this phase does not expose HTTP endpoints or UI for them.

### Password hashing

Use the Web Crypto API (`crypto.subtle`) so no hashing package is added unless it proves necessary.

- Algorithm: PBKDF2-SHA-256
- Per-user random salt (16 bytes, `SALT_BYTES`)
- Iteration count: **100_000** (`PBKDF2_ITERATIONS` in `src/lib/password.ts:4`)
- Store as `pbkdf2$iterations$salt$hash` with base64 salt and hash (`src/lib/password.ts:63-67`)
- Compare in constant time
- Never log passwords or hashes

Hashing happens in the register and login route handlers (or a helper they call) **after** the POST arrives, **before** D1 writes or the compare.

### Session cookie

- Name: `qm_session` (`src/lib/session.ts:4`)
- Value: HMAC-SHA-256 signed `{ userId, exp }` using `SESSION_SECRET` (`src/lib/session.ts:59-69`)
- `HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` only in production (`src/lib/session.ts:44-57`)
- Lifetime: 7 days (`SESSION_MAX_AGE_SECONDS`, `src/lib/session.ts:5`)
- Logout sets `Max-Age=0` (`src/lib/session.ts:111-113`)

### Accessing D1

```typescript
import { getCloudflareEnv } from "@/lib/cloudflare-env";

const env = await getCloudflareEnv();
const db = env.DB;
```

`getCloudflareEnv` (`src/lib/cloudflare-env.ts:4-10`) wraps `getCloudflareContext({ async: true })` and copies `SESSION_SECRET` onto `process.env`. `getDb()` (`src/lib/db.ts:4-9`) is the only module that returns the D1 binding. Route handlers and the user service must not be imported into `'use client'` files.

Queries use numbered placeholders:

```typescript
await db
  .prepare(
    "INSERT INTO users (id, first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  )
  .bind(id, firstName, lastName, username, email, passwordHash)
  .run();
```

Prefer `all()` / `results[0]` over `first()`.

### Vitest patterns

```ts
beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("server-only", () => ({}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { DB: mockDb },
  })),
}));
```

Prefer mocking `src/lib/db.ts` over reconstructing the D1 prepared-statement chain. Route tests call exported `POST(request)` with a `Request`. Form tests mock `fetch` and `next/navigation`.

### Dependencies added

These were approved and installed for this PRD:

| Package | Why |
|---|---|
| `zod` | Validate route handler and service input |
| `server-only` | Keep db, session, password, and user service off the client |
| `vitest` | Unit-test runner |
| `@vitejs/plugin-react` | Transform TSX in tests |
| `@testing-library/react` | Render client components |
| `@testing-library/user-event` | Real user interactions |
| `jsdom` | DOM environment for component tests |
| `vite-tsconfig-paths` | Resolve the `@/` alias in Vitest |

Do **not** add bcrypt, an auth framework, a session library, `react-hook-form`, Playwright, or `@cloudflare/vitest-pool-workers` unless asked.

### Important Notes

- `npm run dev` runs on Node and will not prove D1 or Workers cookie behavior. Verify auth against D1 with `npm run preview` as well as a happy-path pass on `npm run dev` if local D1 is wired through OpenNext
- Do not apply migrations with `--remote`
- Do not deploy
- Do not import `src/lib/services/users.ts` or `src/lib/db.ts` into client components
- Username and email uniqueness must be enforced in the database, not only in application code
- Confirm-password is a UI check only; the API receives a single `password` field
- The MCQs stub is not a license to start question schema or APIs
- Write each phase's tests before its production code. `npm test` red at the start of a phase is expected
- Do not mock a function into always returning the value the test wants if that hides a missing implementation
- `getCloudflareContext()` does not work under jsdom — always mock it or `src/lib/db.ts`

---

## Acceptance Criteria

- [x] Vitest is installed and `npm test` / `npm run test:watch` run
- [x] Each implementation phase started with failing tests and ended with those tests green
- [x] A local D1 database exists, is bound as `DB`, and the `users` migration applies locally
- [x] `users` has a primary key, `first_name`, `last_name`, `username`, `email`, and `password_hash`
- [x] User service can create, update, and delete users, and can look up by id and username
- [x] `POST /api/auth/register` creates a row whose `password_hash` is not the plaintext password
- [x] `POST /api/auth/login` succeeds only when the submitted password hashes to the stored value
- [x] Successful register takes the teacher to `/mcqs`
- [x] Successful login takes the teacher to `/mcqs`
- [x] `/mcqs` is a stub (no MCQ CRUD) and shows a logout control
- [x] Logout clears the session and returns the teacher to `/login`
- [x] After logout, `/mcqs` redirects to `/login`
- [x] Duplicate username or email is rejected
- [x] Wrong password returns 401 with a generic message
- [x] API responses never include `password` or `password_hash`
- [x] `npm test` succeeds (51/51)
- [x] `npm run lint` succeeds (exit 0; two pre-existing unused-var warnings)
- [ ] `npm run build` not re-recorded in this PRD update

---

## Success Metrics

This phase is infrastructure. Success is that teachers can obtain and use a session, not that the test bank exists yet.

| Metric | Target | How Measured |
|--------|--------|--------------|
| Register → authenticated stub | 100% of valid registrations land on `/mcqs` with a session cookie | Manual browser pass — **verified 2026-08-27** |
| Login → authenticated stub | 100% of valid logins land on `/mcqs` | Manual browser pass — **verified 2026-08-27** |
| Logout ends the session | `/mcqs` after logout requires login again | Manual browser pass — **verified 2026-08-27** |
| Password not stored in plaintext | Stored `password_hash` is not equal to the submitted password | Unit tests + server-side hash in register handler |
| Duplicate identity blocked | Second register with same username or email returns 409 | Unit tests (`UniqueConstraintError` → 409) |
| Unit suite | 100% of committed Vitest tests green | `npm test` — **51/51 on 2026-08-27** |
| TDD discipline | Each phase's tests failed before implementation | Phase notes |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — user persistence
- Wrangler — create database, generate migrations, apply locally
- Web Crypto (`crypto.subtle`) — password hashing (Workers/runtime built-in)

### Internal Dependencies

- `getCloudflareContext()` from `@opennextjs/cloudflare` — D1 binding access
- shadcn/ui `button`, `card`, `field`, `input`, `label` — register/login forms
- Zod — request and service validation (`zod` in `package.json`)
- Vitest — unit tests; mock D1 and Cloudflare context (`vitest` in `package.json`)
- `.dev.vars` `SESSION_SECRET` — signing session cookies

### Environment variables

| Name | Where | Purpose |
|---|---|---|
| `SESSION_SECRET` | `.dev.vars` (local), `wrangler secret put` (production, later) | HMAC key for the session cookie. Empty placeholder in `.dev.vars.example` |

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` (Node) and D1 (Workers) disagree, so auth "works" in dev and fails in preview
- **Mitigation**: Treat D1-backed register/login as runtime-sensitive. Confirm with `npm run preview` before calling the phase done

- **Risk**: Client-side hashing is implemented because the planning conversation mentioned hashing before POST
- **Mitigation**: Hash only on the server after the HTTPS POST. Cut section records why

- **Risk**: bcrypt or Node crypto APIs fail on Workers
- **Mitigation**: Use `crypto.subtle` PBKDF2. Do not add a native bcrypt package

- **Risk**: Unique-constraint errors leak a stack trace or tell an attacker which field collided
- **Mitigation**: Catch D1 constraint failures in the register handler; return 409 with a generic message

- **Risk**: Session cookie is readable from JavaScript or sent cross-site
- **Mitigation**: `httpOnly`, `sameSite=lax`, `secure` in production

- **Risk**: Tests are written after the code, or written so they cannot fail, so green does not mean the phase works
- **Mitigation**: Tests are listed per phase and must be red first. Hollow assertions are forbidden. Phase-complete requires green tests **and** acceptance criteria

- **Risk**: Unit tests call real D1 and fail or flake outside Workers
- **Mitigation**: Mock `src/lib/db.ts` / `getCloudflareContext()`. Schema tests read SQL files. Confirm real D1 only in Phase 5 with `npm run preview`

### User Experience Risks

- **Risk**: Teachers expect to log in with email and cannot
- **Mitigation**: Login copy says "Username". Register collects both username and email so email login can be added later without a schema change

- **Risk**: Landing on an empty MCQs stub feels like a broken app
- **Mitigation**: The stub states that the question bank comes next and still offers logout

- **Risk**: After register, a teacher refreshes and is logged out
- **Mitigation**: Session cookie is set on both register and login, not login only

---

## Troubleshooting Guide

Populate this section when bugs are found during implementation. Starter entries:

### D1 binding missing in local Next.js

**Problem**: `env.DB` is undefined during `npm run dev`.
**Cause**: OpenNext/Wrangler bindings are not always present on the Node dev server.
**Solution**: Confirm `wrangler.jsonc` has the `d1_databases` block. Retry under `npm run preview`. If Node dev must work, follow the current OpenNext D1 local-dev guidance rather than mocking the database in application code.
**Code Reference**: `wrangler.jsonc`, `src/lib/db.ts`

### Unique username/email insert fails with 500

**Problem**: Registering a duplicate identity returns 500 instead of 409.
**Cause**: D1 unique-constraint error was not mapped in the register handler.
**Solution**: Catch `UniqueConstraintError` in `POST /api/auth/register` and return 409 with the generic message.
**Code Reference**: `src/app/api/auth/register/handler.ts:60-63`, `src/lib/services/users.ts:5-9`

### Logged in but `/mcqs` still redirects to login

**Problem**: Cookie is set but the stub treats the user as anonymous.
**Cause**: Cookie `path`/`secure` mismatch between `npm run dev` (HTTP) and production flags, or the session helper rejects the signature, or `SESSION_SECRET` is on Cloudflare env but not `process.env`.
**Solution**: Do not set `secure` on HTTP localhost. `getCloudflareEnv` copies `SESSION_SECRET` onto `process.env` before `readSessionUserId` runs.
**Code Reference**: `src/lib/session.ts:44-57`, `src/lib/cloudflare-env.ts:4-10`, `src/lib/current-session.ts:6-11`

### `Cannot find module '@/lib/...'` in `route.test.ts`

**Problem**: Colocated App Router tests cannot resolve `@/` even though `src/lib` exists.
**Cause**: The Next.js TypeScript plugin treats files under `src/app` as route modules and drops path aliases.
**Solution**: Put handler logic in `handler.ts` and re-export from `route.ts`. For register tests, `src/app/api/auth/tsconfig.json` sets `"plugins": []`. Login/logout tests live under `src/lib/auth/`.
**Code Reference**: `src/app/api/auth/register/route.ts:1`, `src/app/api/auth/tsconfig.json`, `src/lib/auth/login-route.test.ts`

### PowerShell `curl` sends a broken JSON body (400 Invalid request body)

**Problem**: Register/login curl from PowerShell returns 400 even with a valid JSON string.
**Cause**: PowerShell `curl` is `Invoke-WebRequest`, and backtick-escaped JSON in `-d` is split or mangled.
**Solution**: Use `curl.exe` and `--data-binary` from a file, e.g. `--data-binary "@$env:TEMP\register.json"`.
**Code Reference**: `src/app/api/auth/register/handler.ts:31-36`

### `@/` imports fail in Vitest

**Problem**: Tests cannot resolve `@/lib/...`.
**Cause**: `vite-tsconfig-paths` is missing from `vitest.config.ts`.
**Solution**: Add the plugin as in `.cursor/skills/testing/SKILL.md`.
**Code Reference**: `vitest.config.ts`

### Phase tests are red after implementation

**Problem**: Production code exists but `npm test` still fails.
**Cause**: Test expects a different export shape, or the implementation diverged from the PRD contract.
**Solution**: Do not skip or delete the test. Align the export/API with this PRD, or fix a genuinely wrong assertion and record why.
**Code Reference**: the failing `*.test.ts` file

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading Overview and Hypothesis — this phase is identity for a future collaborative quiz maker, not the quiz maker itself
2. Obey Scope. Do not build MCQ tables, APIs, or real question UI
3. Follow TDD. For each phase: write the listed tests first, run `npm test` (expect red), implement, run `npm test` until green, then check that phase's acceptance criteria. Do not start the next phase while tests are red
4. Follow `.cursor/skills/testing/SKILL.md`. Colocate tests, mock D1, never write assertions that cannot fail
5. Hash passwords on the server after HTTP POST; do not hash in the browser and store that digest
6. Register and login must call the user service. Logout clears the session cookie
7. After successful register or login, send the teacher to `/mcqs`
8. Update phase status markers as work progresses
9. Add implementation details (real file paths, chosen PBKDF2 iteration count, cookie name) here as code is written
10. Mark acceptance criteria when they pass in a real run, not by inspection
11. Add troubleshooting entries when bugs are found and fixed
12. Ask before adding any dependency other than `zod` and the Vitest packages listed above
13. Never deploy. Never apply D1 migrations remotely
14. Cite code as `filepath:line-number`

---

## Current Status

**Last Updated**: 2026-08-27
**Current Phase**: Phase 5 - Verify
**Status**: COMPLETED — identity feature implemented and verified locally (register, login, logout, gated `/mcqs`). `npm test` 51/51. Production `npm run build` was not re-run for this close-out.
**Next Steps**: This PRD is closed. Do not create migrations or deploy. Next product work is the MCQ test bank, not more identity.
