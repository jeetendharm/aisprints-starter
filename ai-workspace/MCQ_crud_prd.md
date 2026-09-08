Date created: 2026-09-02
Date last modified: 2026-09-08

# MCQ Create, Update, Delete, and Attempts - Technical PRD

## Overview/Problem

QuizMaker’s identity layer is done. Teachers can register, log in, reach `/mcqs`, and log out. That page is still a labeled stub: there is no way to author a multiple-choice question, list the shared bank, or record that someone tried a question.

Without this feature, the product cannot become the collaborative MCQ test bank described in `ai-workspace/login_and_logout_prd.md`. Teachers have accounts but nothing to attach those accounts to.

---

## Hypothesis

We believe that replacing the `/mcqs` stub with a shadcn table of questions, a shared create/edit page, row actions (edit, preview, delete), and D1-backed MCQ, choice, and attempt records will let signed-in teachers build and try questions in a shared bank.

**Outcome:** a teacher can create, edit, delete, preview, and attempt multiple-choice questions. Collaboration features (ownership rules, sharing, roles) are not in this feature.

---

## Scope

### In Scope

- Three D1 tables via a new local Wrangler migration: `mcqs`, `mcq_choices`, `mcq_attempts`
- `mcqs` stores `id`, `name` (short title), `question` (the prompt), `created_by` (the signed-in teacher’s user id), `created_at`, `updated_at`
- `mcq_choices` stores the answer options for one MCQ (foreign key to `mcqs`), including which option is correct
- A question is shown with **2 choices by default** and may have **2–6 choices**
- Exactly **one** choice per question is marked correct
- `mcq_attempts` stores one row per try: which user, which question, which choice they picked, and whether that pick was correct at submit time
- An `mcqService` in `src/lib/services/` that is the only module that reads or writes `mcqs` and `mcq_choices`
- An `attemptService` in `src/lib/services/` that is the only module that reads or writes `mcq_attempts`
- HTTP route handlers for listing, creating, reading, updating, and deleting MCQs, and for recording / listing attempts
- All MCQ and attempt routes require a valid session; unauthenticated calls return 401
- Expand `/mcqs` from a stub into a question-bank table (shadcn `table` + `button`)
- A **Create question** button that navigates to a create/edit page with **Save** and **Cancel**
- Each table row shows the name, the question, and an actions column
- Actions are a **three-vertical-ellipsis** button; the menu contains **Edit**, **Preview**, and **Delete**
- Delete asks for confirmation in the existing shadcn `dialog` before calling the API
- Preview shows the question as a student would see it and can submit an attempt
- Continue the existing HTTP route-handler + `fetch` pattern (not Server Actions)
- Test-driven implementation with **Vitest**: each phase starts by writing that phase's unit tests (they will fail / go red), then implementation until those tests are green. A phase is complete only when its tests are green **and** its acceptance criteria pass
- Existing auth tests stay green (51 tests as of 2026-08-27, plus any still-valid additions)

### Out of Scope

- Roles, permissions, or “only the author can edit”
- Sharing links, folders, tags, TEKS / standards alignment, or question search / filter / pagination
- Timed quizzes, multi-question quizzes, scoring dashboards, or class rosters
- Images, rich text, LaTeX, or file attachments on questions or choices
- Multiple correct answers, weighted scoring, or partial credit
- Email / notification when someone attempts a question
- Soft delete or question versioning
- Email verification, password reset, or any change to register / login / logout
- End-to-end browser automation (Playwright/Cypress)
- `@cloudflare/vitest-pool-workers`
- Deploying or applying this migration with `--remote`

### Cut

- **Ownership-only edits** — the product is a shared bank. Any signed-in teacher can edit or delete any question. Roles come later
- **Server Actions for MCQ forms** — auth already uses Route Handlers + JSON `fetch`. This feature stays on that path so tests can call `POST` / `PUT` / `DELETE` with a `Request`
- **Client-side D1 or service imports** — pages and forms never import `src/lib/db.ts` or the services. Server Components and route handlers call the services
- **Replacing choices by delete-all + insert-all** — attempts reference `choice_id`. Updates must keep existing choice ids when the choice is still present
- **Revealing the correct answer before an attempt on Preview** — Preview behaves like a student view until the teacher submits
- **react-hook-form** — same as auth: controlled fields + Zod on the server
- **A fourth “quiz” table** — one question at a time. Multi-question quizzes are a later feature
- **`description` on `mcqs`** — the prompt is `question`, not an optional description. `name` is the short title only

---

## Technical Requirements

### Database Schema

D1 remains bound as `DB` in `wrangler.jsonc` to database `quizmaker` (`database_id` `549fc6c8-2285-4a88-8984-b0d6ab50e684`). Do not change that binding.

Create the new tables with Wrangler:

```bash
npx wrangler d1 migrations create quizmaker create_mcq_tables
```

Expected file: `migrations/0002_create_mcq_tables.sql` (or the Wrangler-generated equivalent). Apply **locally only**:

```bash
npx wrangler d1 migrations apply quizmaker --local
```

Never apply to remote unless the user explicitly asks.

SQLite stores booleans as `INTEGER` `0` / `1`. Ids stay opaque `TEXT` values, same as `users.id`.

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  body TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  CHECK (is_correct IN (0, 1))
);

CREATE UNIQUE INDEX mcq_choices_one_correct
  ON mcq_choices (mcq_id)
  WHERE is_correct = 1;

CREATE INDEX mcq_choices_mcq_id ON mcq_choices (mcq_id);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (choice_id) REFERENCES mcq_choices(id) ON DELETE CASCADE,
  CHECK (is_correct IN (0, 1))
);

CREATE INDEX mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX mcq_attempts_user_id ON mcq_attempts (user_id);
```

Column notes:

| Table | Column | Purpose |
|---|---|---|
| `mcqs` | `id` | Primary key. Opaque TEXT UUID-style value |
| `mcqs` | `name` | Short title for the list and actions menu. Not the prompt itself |
| `mcqs` | `question` | The prompt the teacher authors and the student answers. Required. There is no `description` column |
| `mcqs` | `created_by` | `users.id` of the teacher who created it. Attribution only — not an access-control flag |
| `mcqs` | `created_at` / `updated_at` | Timestamps. `updated_at` is set by the service on update |
| `mcq_choices` | `body` | The choice text the teacher sees and the student picks |
| `mcq_choices` | `is_correct` | `1` if this is the right answer, else `0`. At most one `1` per `mcq_id` (partial unique index) |
| `mcq_choices` | `position` | Display order, `0`–`5` |
| `mcq_attempts` | `choice_id` | The option the user selected |
| `mcq_attempts` | `is_correct` | Snapshot of whether that choice was correct **at submit time**. Later edits to the question do not rewrite history |

`created_by` is in this schema because the login phase existed so later question work can be attributed to a real user. It does not restrict who can edit.

### API Endpoints

All live under `src/app/api/mcqs/`. They are Route Handlers, not Server Actions. Validate every body with Zod before touching the database. Handlers call `mcqService` or `attemptService` — they do not run SQL.

Follow the auth pattern: logic in `handler.ts`, `route.ts` only re-exports the HTTP methods so tests do not import Next’s special `route.ts` file.

Every handler requires a session. Read the user id the same way auth pages do (`getSessionUserId` from `src/lib/current-session.ts`). No session → **401** `{ "error": "Authentication required." }`. Do not redirect from APIs.

JSON field names are camelCase. Database columns stay snake_case inside the services.

#### GET /api/mcqs

Lists every question in the shared bank, newest first. Choices are **not** included (the table only needs name and question).

**Request Body:** none

**Response:**
- Success (200):
```json
{
  "mcqs": [
    {
      "id": "…",
      "name": "Addition facts",
      "question": "What is 2 + 2?",
      "createdBy": "…",
      "createdAt": "2026-09-02T00:00:00.000Z",
      "updatedAt": "2026-09-02T00:00:00.000Z"
    }
  ]
}
```
- Error (401): not signed in
- Error (500): unexpected server error

#### POST /api/mcqs

Creates a question and its choices in one request. `created_by` is the session user, not a body field.

**Request Body:**
```json
{
  "name": "Addition facts",
  "question": "What is 2 + 2?",
  "choices": [
    { "body": "3", "isCorrect": false },
    { "body": "4", "isCorrect": true }
  ]
}
```

**Response:**
- Success (201): the created MCQ including `choices` (each choice has `id`, `body`, `isCorrect`, `position`)
- Error (400): validation failed — missing name, missing question, fewer than 2 / more than 6 choices, a blank choice body, zero or more than one `isCorrect: true`
- Error (401): not signed in
- Error (500): unexpected server error

**Behavior:**
1. Require session
2. Validate with Zod
3. Trim `name` and `question`
4. `mcqService.create({ ...parsed, createdBy: userId })`
5. Return 201 with the full MCQ + choices

#### GET /api/mcqs/[id]

Returns one question with its choices, ordered by `position`. Used by the edit page if the client refetches; the edit Server Component may also load via the service directly.

**Request Body:** none

**Response:**
- Success (200): `{ "mcq": { …fields, "choices": [ … ] } }`
- Error (401): not signed in
- Error (404): `{ "error": "Question not found." }`
- Error (500): unexpected server error

Preview **must not** use this payload to highlight the correct answer in the UI before submit. The API may still return `isCorrect` (teachers can open Edit). The Preview client ignores `isCorrect` until after an attempt.

#### PUT /api/mcqs/[id]

Updates name, question, and the choice set.

**Request Body:**
```json
{
  "name": "Addition facts",
  "question": "What is 2 + 2?",
  "choices": [
    { "id": "existing-choice-id", "body": "3", "isCorrect": false },
    { "id": "existing-choice-id-2", "body": "4", "isCorrect": true },
    { "body": "5", "isCorrect": false }
  ]
}
```

**Response:**
- Success (200): the updated MCQ including choices
- Error (400): same validation rules as create
- Error (401): not signed in
- Error (404): question not found
- Error (500): unexpected server error

**Choice sync rules (enforced in `mcqService.update`):**
- Choice with an `id` that belongs to this MCQ → update `body`, `is_correct`, `position`
- Choice without an `id` → insert
- Existing choices whose ids are **absent** from the payload → delete
- An `id` that does not belong to this MCQ → 400, do not silently attach it

#### DELETE /api/mcqs/[id]

Deletes the question. Choices and attempts cascade in the database.

**Request Body:** none

**Response:**
- Success (204): empty body
- Error (401): not signed in
- Error (404): question not found
- Error (500): unexpected server error

#### POST /api/mcqs/[id]/attempts

Records one attempt by the signed-in teacher.

**Request Body:**
```json
{
  "choiceId": "…"
}
```

**Response:**
- Success (201):
```json
{
  "attempt": {
    "id": "…",
    "mcqId": "…",
    "userId": "…",
    "choiceId": "…",
    "isCorrect": true,
    "createdAt": "2026-09-02T00:00:00.000Z"
  }
}
```
- Error (400): missing / unknown `choiceId`, or the choice is not on this question
- Error (401): not signed in
- Error (404): question not found
- Error (500): unexpected server error

**Behavior:**
1. Require session
2. Load the question and choices via `mcqService.getById`
3. Confirm `choiceId` belongs to this MCQ
4. Set `is_correct` from that choice’s **current** `is_correct` value
5. `attemptService.create(...)`
6. Multiple attempts on the same question are allowed; each is a new row

#### GET /api/mcqs/[id]/attempts

Lists the **current user’s** attempts on this question, newest first. Other teachers’ attempts are not returned (no class analytics in this phase).

**Request Body:** none

**Response:**
- Success (200): `{ "attempts": [ … ] }`
- Error (401): not signed in
- Error (404): question not found
- Error (500): unexpected server error

### User Interface Requirements

Use shadcn/ui `base-nova` pieces. Already installed: `button`, `card`, `dialog`, `field`, `input`, `label`, `separator`, `table`, `badge`.

Add only these components, via the project’s required namespace (see `.cursor/rules/shadcn.mdc`):

```bash
npx shadcn@latest add @shadcn/dropdown-menu
npx shadcn@latest add @shadcn/textarea
npx shadcn@latest add @shadcn/radio-group
```

If `dropdown-menu` produces no files for Base UI, use the documented equivalent (likely `@shadcn/menu`) and record the real file path in this PRD. Do not add `react-hook-form`. Do not hand-edit files under `src/components/ui/` except through the shadcn CLI.

Client forms POST/PUT/DELETE JSON with `fetch`, then `router.push` or `router.refresh`. Surface API `error` strings on the form. Query by role and accessible name in tests.

Pages stay thin Server Components. Interactive UI lives in `src/components/mcqs/`. All listed pages are authenticated: no session → redirect to `/login` via `requireSessionRedirect` (same as today’s stub).

#### Question bank (`/mcqs`)

Replaces the stub. Keep logout and the signed-in name.

- Heading: **Question bank**
- Short supporting copy that this is the shared MCQ list (remove the “placeholder” sentence)
- **Create question** button (shadcn `Button`) → `/mcqs/new`
- shadcn `Table` with columns: **Name**, **Question**, **Actions**
- Rows from `mcqService.list()` (Server Component loads, passes data into a client table). Newest first
- Both name and question are required, so every row has both values
- Empty state: table (or a clear empty panel) plus copy such as “No questions yet.” The create button remains available
- Actions column: icon button with `aria-label` `Actions for {name}`, icon is Lucide `EllipsisVertical` (three vertical dots)
- Dropdown items, in this order:
  1. **Edit** → `/mcqs/[id]/edit`
  2. **Preview** → `/mcqs/[id]/preview`
  3. **Delete** → opens confirm dialog (do not navigate)
- Delete dialog: title “Delete question?”, body that this cannot be undone, **Cancel** and **Delete** buttons. Confirm calls `DELETE /api/mcqs/[id]`, then removes the row / refreshes the list. Failure shows the server error
- Widen the layout beyond the stub’s `max-w-lg` (use something like `max-w-5xl`) so the table is readable

#### Create / edit (`/mcqs/new` and `/mcqs/[id]/edit`)

One client form component, two routes.

- `/mcqs/new` — empty form
- `/mcqs/[id]/edit` — Server Component loads `mcqService.getById`; 404 / redirect back to `/mcqs` if missing; pass the MCQ into the same form
- Fields (shadcn `Field` + `Input` / `Textarea`):
  - **Name** (`name`) — required, trimmed, 1–200 characters. Short title. `Input`
  - **Question** (`question`) — required, trimmed, 1–2000 characters. The prompt. `Textarea`
  - **Choices** — 2–6 rows. Each row: choice body (required, 1–500), and a radio in a group that marks **the** correct answer
- Default on create: **two** empty choice rows, neither selected until the teacher picks one
- **Add choice** — disabled at 6
- **Remove** on a choice row — disabled when only 2 remain
- **Save** — create: `POST /api/mcqs`; edit: `PUT /api/mcqs/[id]` with existing choice `id`s preserved. On success, navigate to `/mcqs`
- **Cancel** — navigate to `/mcqs` without saving
- Client-side UX checks (blank name, blank question, fewer than 2 filled choices, no correct choice marked) may disable Save or show `FieldError`; the API remains authoritative
- Do not send `createdBy` from the client

#### Preview (`/mcqs/[id]/preview`)

- Server Component loads the MCQ; missing id → `/mcqs`
- Shows name (heading) and question (the prompt)
- Choices as a radio group. Do **not** mark or style the correct choice before submit
- **Submit answer** → `POST /api/mcqs/[id]/attempts` with `{ choiceId }`
- After success, show **Correct** or **Incorrect** (use `badge` if it helps) from `attempt.isCorrect`
- After success, the correct choice may be indicated
- **Back to question bank** (or Cancel-equivalent) → `/mcqs`
- Selecting a choice is required before submit
- Repeat attempts are allowed (new POST each time)

---

## Test-Driven Development

This feature is built **red → green → next phase**. Vitest is already installed. Follow `.cursor/skills/testing/SKILL.md`. Reuse the auth conventions: mock `server-only` and `src/lib/db.ts`; never touch live D1 in unit tests; do not import `route.ts` in tests.

### Phase-complete rule

A phase is **not** complete when the code looks right. It is complete when **all** of the following are true:

1. That phase's tests were written **first** and failed for a real reason (missing module, failed assertion), not because the harness was broken
2. `npm test` is green for the **whole** suite (this phase plus auth plus earlier MCQ phases)
3. That phase's acceptance criteria are met in a real run, not by inspection

Do not start the next phase while the current phase's tests are red. Do not delete or weaken a failing test to get a green suite. If a test is wrong, fix the test; if the product is wrong, fix the product.

### What a test must do

- Prove observable behavior (return value, status code, thrown error, rendered text). Never `expect(true).toBe(true)`
- Cover failure paths, not only the happy path
- Name the test so the failure message alone explains what broke
- Colocate: `src/lib/services/mcqs.ts` is tested by `src/lib/services/mcqs.test.ts`
- Route-handler tests live under `src/lib/mcqs/` (same Next-plugin issue as login/logout). Do not colocate `route.test.ts` under `src/app/api/mcqs/` unless a local `tsconfig.json` with `"plugins": []` is added
- Each test must pass alone. Reset mocks in `beforeEach` with `vi.clearAllMocks()`
- Unit tests must not touch a real D1 database, network, or model provider
- Server Components cannot be rendered by Testing Library. Test their logic as plain functions. Reserve `render` for client components, querying by role and accessible name

### Commands

| Command | Purpose |
|---|---|
| `npm test` | `vitest run` — CI / phase-gate |
| `npm run test:watch` | `vitest` — stay in watch while turning a phase from red to green |

---

## Implementation Phases

Every phase below follows the same loop: **write tests (red) → implement → `npm test` green → acceptance criteria**. Status markers: `PLANNED` | `IN PROGRESS` | `COMPLETED`.

### Phase 1: MCQ schema migration - COMPLETED

**Objective:** The three tables exist in local D1 and the migration SQL is locked by tests.

**Tests to write first** (expect RED — `0002` does not exist yet):

`src/lib/mcq-schema.test.ts` (reads SQL from `migrations/`; does not connect to D1)

- `mcqs migration creates an mcqs table`
- `mcqs table has a TEXT primary key named id`
- `mcqs table has name TEXT NOT NULL, question TEXT NOT NULL, created_by TEXT NOT NULL, created_at, and updated_at`
- `mcqs table does not have a description column`
- `mcq_choices table exists with mcq_id, body, is_correct, and position`
- `mcq_choices.is_correct is INTEGER with a 0/1 check`
- `mcq_choices has a unique index that allows only one correct choice per mcq_id`
- `mcq_attempts table exists with mcq_id, user_id, choice_id, and is_correct`
- `mcq_choices and mcq_attempts reference mcqs(id) with ON DELETE CASCADE`

These tests fail until the migration exists. That is the intended red. Do not point them at a live D1.

**Tasks:**
1. Write the tests above and run `npm test` — confirm red for the right reason (no `mcqs` table in migrations)
2. `npx wrangler d1 migrations create quizmaker create_mcq_tables`
3. Fill in the SQL from the schema section
4. Apply locally only
5. Re-run `npm test` until auth + Phase 1 tests are green

**Deliverables:**
- Failing-then-green schema tests
- `migrations/0002_create_mcq_tables.sql` (or Wrangler-generated name)
- Local D1 with empty `mcqs`, `mcq_choices`, `mcq_attempts`

**Phase complete when:**
- [x] `npm test` green (existing auth suite + schema tests)
- [x] Migration applies locally (`npx wrangler d1 migrations apply quizmaker --local`)

**Implementation notes (2026-09-08):**
- TDD: 9 schema tests failed first (migrations only had `CREATE TABLE users`), then passed after `0002`
- Migration file: `migrations/0002_create_mcq_tables.sql`
- Applied **locally only** — 8 commands executed; status ✅. Never applied `--remote`
- `npm test` — 13 files, **60 passed / 60** (51 auth + 9 schema)

### Phase 2: MCQ and attempt services - COMPLETED

**Objective:** All persistence for questions, choices, and attempts goes through server-only services.

**Tests to write first** (expect RED — service modules do not exist yet):

`src/lib/services/mcqs.test.ts` — mock `src/lib/db.ts`; never call real D1

- `create inserts an mcq and its choices and returns them without a D1 row shape`
- `create assigns position in array order and persists exactly one is_correct = 1`
- `create rejects fewer than 2 or more than 6 choices`
- `create rejects a payload with zero or multiple correct choices`
- `list returns mcqs newest first and does not include choices`
- `getById returns the mcq with choices ordered by position, or null when missing`
- `update changes name/question, updates existing choice ids, inserts new choices, and deletes omitted ones`
- `update rejects a choice id that does not belong to the mcq`
- `delete removes the mcq`
- `create and update trim name and question`
- `create rejects a missing or blank question`

`src/lib/services/attempts.test.ts` — mock `src/lib/db.ts`

- `create inserts an attempt with the given isCorrect snapshot`
- `listByMcqAndUser returns that user’s attempts newest first`
- `listByMcqAndUser does not return another user’s attempts`

**Tasks:**
1. Write the tests above and run `npm test` — confirm red
2. Create `src/lib/services/mcqs.ts` and `src/lib/services/attempts.ts` with `server-only`
3. Use prepared statements with numbered placeholders (`?1`, `?2`)
4. Use `db.batch(...)` so create (question + choices) is one atomic write
5. Generate ids with `crypto.randomUUID()`
6. Re-run `npm test` until auth + Phase 1–2 tests are green

**Deliverables:**
- Failing-then-green service tests
- `mcqService` and `attemptService`
- Services importable only from server code

**Phase complete when:**
- [x] `npm test` green
- [x] Services match the surfaces in Technical Implementation Details

**Implementation notes (2026-09-08):**
- TDD: service suites failed first (`Failed to resolve import "@/lib/services/mcqs"` and `attempts`), then `npm test` passed **75/75**
- `src/lib/services/mcqs.ts` — `mcqService.list | getById | create | update | delete`; Zod validates 2–6 choices and exactly one correct; `create` uses `db.batch`; `update` keeps existing choice ids, inserts new ones, deletes omitted ones
- `McqNotFoundError` and `InvalidMcqChoiceError` for missing questions and stolen choice ids
- `src/lib/services/attempts.ts` — `attemptService.create | listByMcqAndUser`; `is_correct` stored as `0`/`1`, returned as boolean
- Tests mock `src/lib/db.ts` (no live D1). No new migration. No deploy

### Phase 3: MCQ and attempt endpoints - PLANNED

**Objective:** Authenticated HTTP APIs for CRUD and attempts.

**Tests to write first** (expect RED — handlers do not exist yet):

Put tests at `src/lib/mcqs/` and import `handler.ts`, not `route.ts`. Mock services and `getSessionUserId`.

`src/lib/mcqs/list-route.test.ts`

- `GET /api/mcqs returns 200 and the service list when the session is valid`
- `GET /api/mcqs returns 401 when there is no session`

`src/lib/mcqs/create-route.test.ts`

- `POST /api/mcqs with a valid body returns 201 and uses the session user as createdBy`
- `POST /api/mcqs with a missing question returns 400`
- `POST /api/mcqs with 1 choice or two correct choices returns 400`
- `POST /api/mcqs returns 401 when there is no session`

`src/lib/mcqs/item-route.test.ts`

- `GET /api/mcqs/[id] returns 200 with choices when found`
- `GET /api/mcqs/[id] returns 404 when missing`
- `PUT /api/mcqs/[id] returns 200 on a valid update`
- `PUT /api/mcqs/[id] returns 404 when missing`
- `DELETE /api/mcqs/[id] returns 204 when the service deletes`
- `DELETE /api/mcqs/[id] returns 404 when missing`
- unauthenticated GET/PUT/DELETE return 401

`src/lib/mcqs/attempts-route.test.ts`

- `POST attempt with a valid choiceId returns 201 and isCorrect from the service`
- `POST attempt with a choice that is not on the question returns 400`
- `POST attempt returns 401 when there is no session`
- `GET attempts returns only the current user’s attempts`
- `GET attempts returns 401 when there is no session`

Call the exported handlers with a `Request`. Do not spin up Next.js.

**Tasks:**
1. Write the tests above and run `npm test` — confirm red
2. Implement handlers + thin `route.ts` re-exports
3. Zod-validate every body; map “not found” to 404
4. Re-run `npm test` until auth + Phase 1–3 tests are green

**Deliverables:**
- Failing-then-green route-handler tests
- Collection, item, and attempts route handlers
- JSON contracts as specified above

**Phase complete when:**
- [ ] `npm test` green
- [ ] Status codes 200 / 201 / 204 / 400 / 401 / 404 / 500 match the contracts

### Phase 4: Question bank UI - PLANNED

**Objective:** A teacher can list, create, edit, preview, attempt, and delete questions in the browser.

**Tests to write first** (expect RED — client components do not exist yet):

Keep pages as thin Server Components. Put interactive UI in client components.

`src/components/mcqs/mcq-table.test.tsx`

- `renders a row for each question name and question text`
- `actions menu contains Edit, Preview, and Delete`
- `Edit navigates to /mcqs/{id}/edit`
- `Preview navigates to /mcqs/{id}/preview`
- `Delete opens a confirm dialog and DELETEs /api/mcqs/{id} on confirm`

`src/components/mcqs/mcq-form.test.tsx`

- `renders name, question, two choice fields, Save, and Cancel on create`
- `Add choice adds a row and is disabled at 6 choices`
- `cannot remove below 2 choices`
- `Save on create POSTs /api/mcqs and navigates to /mcqs`
- `Save on edit PUTs /api/mcqs/{id} including existing choice ids`
- `Cancel navigates to /mcqs without fetching`
- `shows the server error message when save fails`

`src/components/mcqs/mcq-preview.test.tsx`

- `renders the question and choices without exposing which is correct`
- `Submit POSTs /api/mcqs/{id}/attempts with the selected choiceId`
- `shows Correct or Incorrect from the API response`
- `does not submit when no choice is selected`

Mock `fetch` and `next/navigation`. Use `userEvent`. Query by role and accessible name.

**Tasks:**
1. Write the tests above and run `npm test` — confirm red
2. Add the shadcn components listed in UI Requirements
3. Implement table, form, preview, and delete-confirm pieces
4. Replace the `/mcqs` stub; add `/mcqs/new`, `/mcqs/[id]/edit`, `/mcqs/[id]/preview`
5. Keep session gating and the logout control on the list page
6. Re-run `npm test` until the full suite is green

**Deliverables:**
- Failing-then-green component tests
- Four authenticated routes
- Stub copy removed from `/mcqs`

**Phase complete when:**
- [ ] `npm test` green (including table, form, preview)
- [ ] Pages compose the tested components

### Phase 5: Verify - PLANNED

**Objective:** The feature is done only when the full Vitest suite stays green, lint/build succeed, and the flow works in the browser.

**Tests to write first:** none new, unless verification finds a gap. If it does, write a failing test for that gap, then fix the product until green. Do not “verify” by deleting coverage.

**Tasks:**
1. `npm test` — entire suite green (auth + Phases 1–4)
2. `npm run lint`
3. `npm run build`
4. Exercise locally (`npm run dev`; use `npm run preview` if D1/cookie behavior is in doubt):
   - Sign in → `/mcqs` shows an empty or existing table (not the old stub copy)
   - Create a question with 2 choices → it appears in the table
   - Add choices up to 6 on create/edit; cannot add a 7th
   - Edit name, question, and a choice → table and edit form show the change
   - Preview → pick the wrong answer → Incorrect; pick the right answer → Correct
   - Actions menu: Edit, Preview, Delete
   - Delete confirm → row disappears
   - Cancel on the form returns to `/mcqs` without saving
   - Logged-out visit to `/mcqs`, `/mcqs/new`, `/mcqs/[id]/edit`, `/mcqs/[id]/preview` redirects to `/login`
5. Confirm existing register / login / logout still work

**Deliverables:**
- Green Vitest run reported
- Lint and build results reported
- Browser pass reported

**Phase complete when:**
- [ ] `npm test` succeeds
- [ ] Browser pass of create, edit, preview/attempt, delete, cancel, and auth gating
- [ ] `npm run lint` recorded
- [ ] `npm run build` recorded

---

## Technical Implementation Details

Fill in real paths and line numbers as code is written. Planned layout:

### Key Files (planned)

- `migrations/0002_create_mcq_tables.sql` — `mcqs`, `mcq_choices`, `mcq_attempts` (applied locally 2026-09-08)
- `src/lib/mcq-schema.test.ts` — Phase 1: migration SQL contract (9 tests)
- `src/lib/services/mcqs.ts` — list, getById, create, update, delete (`src/lib/services/mcqs.ts` exports `mcqService`, `McqNotFoundError`, `InvalidMcqChoiceError`)
- `src/lib/services/mcqs.test.ts` — Phase 2 (12 tests, mocked D1)
- `src/lib/services/attempts.ts` — create, listByMcqAndUser
- `src/lib/services/attempts.test.ts` — Phase 2 (3 tests, mocked D1)
- `src/app/api/mcqs/handler.ts` + `route.ts` — GET list, POST create
- `src/app/api/mcqs/[id]/handler.ts` + `route.ts` — GET, PUT, DELETE
- `src/app/api/mcqs/[id]/attempts/handler.ts` + `route.ts` — GET, POST
- `src/lib/mcqs/*.test.ts` — Phase 3 handler tests
- `src/components/mcqs/mcq-table.tsx` — list + actions menu + delete dialog
- `src/components/mcqs/mcq-form.tsx` — create/edit
- `src/components/mcqs/mcq-preview.tsx` — attempt UI
- `src/app/mcqs/page.tsx` — question bank (replaces stub)
- `src/app/mcqs/new/page.tsx` — create
- `src/app/mcqs/[id]/edit/page.tsx` — edit
- `src/app/mcqs/[id]/preview/page.tsx` — preview

### Service surfaces

```typescript
type McqChoice = {
  id: string;
  body: string;
  isCorrect: boolean;
  position: number;
};

type McqListItem = {
  id: string;
  name: string;
  question: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type Mcq = McqListItem & {
  choices: McqChoice[];
};

type CreateMcqInput = {
  name: string;
  question: string;
  createdBy: string;
  choices: { body: string; isCorrect: boolean }[];
};

type UpdateMcqInput = {
  name: string;
  question: string;
  choices: { id?: string; body: string; isCorrect: boolean }[];
};

type Attempt = {
  id: string;
  mcqId: string;
  userId: string;
  choiceId: string;
  isCorrect: boolean;
  createdAt: string;
};

// mcqService.list() -> McqListItem[]
// mcqService.getById(id) -> Mcq | null
// mcqService.create(input) -> Mcq
// mcqService.update(id, input) -> Mcq
// mcqService.delete(id) -> void  // throw a not-found error if no row
//
// attemptService.create({ mcqId, userId, choiceId, isCorrect }) -> Attempt
// attemptService.listByMcqAndUser(mcqId, userId) -> Attempt[]
```

Map D1 integer `is_correct` to boolean `isCorrect` at the service boundary. Route handlers and UI never see `0` / `1`.

Use a small typed error (e.g. `McqNotFoundError`) so handlers can return 404 without string-matching.

### Validation (Zod)

Shared rules, used by services and/or handlers:

- `name`: trimmed string, min 1, max 200
- `question`: trimmed string, min 1, max 2000
- `choices`: array min 2, max 6
- each `body`: trimmed string, min 1, max 500
- exactly one `isCorrect: true`
- attempt `choiceId`: non-empty string

### Accessing D1

Same as auth. `getDb()` in `src/lib/db.ts` is the only module that returns `env.DB`. Services use numbered placeholders. Prefer `all()` / `results[0]` over `first()`. Prefer `db.batch` for multi-statement writes.

```typescript
await db
  .prepare(
    "INSERT INTO mcqs (id, name, question, created_by) VALUES (?1, ?2, ?3, ?4)",
  )
  .bind(id, name, question, createdBy)
  .run();
```

### Vitest patterns

Same mocks as the login PRD:

```ts
beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));
```

Route tests mock `mcqService` / `attemptService` and `getSessionUserId`. Form tests mock `fetch` and `next/navigation`.

### Dependencies

No new npm packages are required. Ask before adding any.

shadcn source files to add (not npm packages): `dropdown-menu` (or Base UI `menu`), `textarea`, `radio-group`.

Do **not** add `react-hook-form`, Playwright, or `@cloudflare/vitest-pool-workers` unless asked.

### Important Notes

- Do not apply migrations with `--remote`
- Do not deploy
- Do not import services or `src/lib/db.ts` into `'use client'` files
- Do not weaken or skip the existing auth suite
- Write each phase's tests before its production code
- `getCloudflareContext()` does not work under jsdom — always mock `src/lib/db.ts`
- Deleting an MCQ deletes its choices and attempts (CASCADE). Mention this in the delete dialog copy
- `created_by` is attribution, not permission
- Preview may receive `isCorrect` from `getById`; the UI must not use it until after submit
- `npm run dev` runs on Node. Confirm D1-backed create/list with a real local migration apply, and use `npm run preview` if Workers-specific behavior is in doubt

---

## Acceptance Criteria

- [ ] Each implementation phase started with failing tests and ended with those tests green
- [x] Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` from a locally applied migration
- [x] `mcqs` has `id`, `name`, `question`, `created_by`, `created_at`, and `updated_at` — no `description` column
- [x] `mcqService` can create, list, get, update, and delete questions with 2–6 choices
- [x] A question cannot be saved with fewer than 2 choices, more than 6, or without exactly one correct choice
- [x] `attemptService` records `choiceId` and a snapshot `isCorrect`
- [ ] `GET/POST /api/mcqs` and `GET/PUT/DELETE /api/mcqs/[id]` require a session
- [ ] `POST /api/mcqs/[id]/attempts` requires a session and rejects a choice that is not on that question
- [ ] `/mcqs` shows a table of name + question, a Create question button, logout, and the signed-in teacher
- [ ] Create question opens `/mcqs/new` with Save and Cancel
- [ ] Save on create persists the question and returns the teacher to `/mcqs`
- [ ] Each row’s ellipsis menu has Edit, Preview, and Delete
- [ ] Edit opens `/mcqs/[id]/edit` with existing values; Save updates the same row
- [ ] Cancel on create/edit returns to `/mcqs` without writing
- [ ] Delete asks for confirmation, then removes the question
- [ ] Preview lets the teacher pick a choice and see Correct or Incorrect after submit
- [ ] Unauthenticated visits to `/mcqs`, `/mcqs/new`, `/mcqs/[id]/edit`, and `/mcqs/[id]/preview` redirect to `/login`
- [ ] Existing register, login, and logout still work
- [ ] `npm test` succeeds
- [ ] `npm run lint` succeeds
- [ ] `npm run build` recorded

---

## Success Metrics

This phase is the first real product surface after identity. Success is that a teacher can run the authoring loop without leaving the app.

| Metric | Target | How Measured |
|--------|--------|--------------|
| Create → list | 100% of valid creates appear on `/mcqs` | Manual browser pass + unit tests |
| Edit → list | Name/question change is visible after Save | Manual browser pass + unit tests |
| Delete | Confirmed delete removes the row | Manual browser pass + unit tests |
| Attempt snapshot | `is_correct` on the attempt matches the choice at submit time | Unit tests |
| Choice bounds | UI and API reject < 2 or > 6 choices | Unit tests + browser pass |
| Auth gating | Anonymous users never see the bank or APIs | Guard/API tests + browser pass |
| Unit suite | 100% of committed Vitest tests green | `npm test` |
| TDD discipline | Each phase’s tests failed before implementation | Phase notes |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — MCQ, choice, and attempt persistence
- Wrangler — generate and apply the local migration

### Internal Dependencies

- Existing session cookie (`qm_session`) and `getSessionUserId`
- `requireSessionRedirect` — page gating
- `userService.getById` — signed-in name on `/mcqs` (unchanged)
- `getDb()` / `src/lib/db.ts` — D1 access
- shadcn/ui `table`, `button`, `dialog`, `field`, `input`, `label`, plus newly added `dropdown-menu` (or `menu`), `textarea`, `radio-group`
- Zod — request and service validation
- Vitest — unit tests; mock D1

### Environment variables

None new. `SESSION_SECRET` remains the only secret, already documented in the login PRD.

---

## Risks and Mitigation

### Technical Risks

- **Risk:** Updating a question deletes and recreates choices, breaking `mcq_attempts.choice_id`
- **Mitigation:** Cut section forbids replace-all. `update` matches by choice id

- **Risk:** Preview UI reads `isCorrect` from `getById` and highlights the answer before submit
- **Mitigation:** Preview tests assert the correct choice is not exposed before submit

- **Risk:** Foreign keys are declared but D1 does not enforce them in every local path
- **Mitigation:** Services still validate that a choice belongs to the MCQ. Schema tests lock the SQL. CASCADE is the documented delete behavior

- **Risk:** Colocated `route.test.ts` under `src/app/api/mcqs` fails to resolve `@/`
- **Mitigation:** Handler tests live under `src/lib/mcqs/`, same as login/logout

- **Risk:** Tests are written after the code, or written so they cannot fail
- **Mitigation:** Tests are listed per phase and must be red first. Hollow assertions are forbidden

- **Risk:** Unit tests call real D1 and flake outside Workers
- **Mitigation:** Mock `src/lib/db.ts`. Schema tests read SQL files. Confirm real D1 only in Phase 5

- **Risk:** Auth suite is broken while adding MCQ files
- **Mitigation:** Phase-complete requires the **whole** `npm test` suite green

### User Experience Risks

- **Risk:** The stub’s `max-w-lg` layout makes the table unusable
- **Mitigation:** Widen `/mcqs` for tabular content

- **Risk:** Accidental delete of a shared question
- **Mitigation:** Confirm dialog; copy states it cannot be undone (choices and attempts go with it)

- **Risk:** Teachers expect to log an attempt from the table without opening Preview
- **Mitigation:** Attempt is only on Preview. The menu label is Preview, not “Take quiz”

- **Risk:** Two empty default choices confuse Save (nothing to submit)
- **Mitigation:** Client blocks Save until name, question, two bodies, and one correct radio are set; API still validates

---

## Troubleshooting Guide

Populate this section when bugs are found during implementation. Starter entries:

### D1 binding missing in local Next.js

**Problem:** `env.DB` is undefined during `npm run dev`.
**Cause:** OpenNext/Wrangler bindings are not always present on the Node dev server.
**Solution:** Confirm `wrangler.jsonc` has the `d1_databases` block. Confirm the new migration was applied with `--local`. Retry under `npm run preview` if needed.
**Code Reference:** `wrangler.jsonc`, `src/lib/db.ts`

### `Cannot find module '@/lib/...'` in a colocated route test

**Problem:** Tests under `src/app/api/mcqs` cannot resolve `@/`.
**Cause:** The Next.js TypeScript plugin treats files under `src/app` as route modules and drops path aliases.
**Solution:** Put handler logic in `handler.ts`. Put tests under `src/lib/mcqs/`.
**Code Reference:** `src/app/api/auth/register/route.ts` (existing pattern), `src/lib/auth/login-route.test.ts`

### Unique-index failure when marking a second choice correct

**Problem:** Update/create returns 500 mentioning `mcq_choices_one_correct`.
**Cause:** Two choices were written with `is_correct = 1`, or an update set a new correct choice before clearing the old one.
**Solution:** In `mcqService.update`, write choices so at most one `is_correct = 1` is true at commit (e.g. set all to 0, then set the winner, or batch in an order that never leaves two winners). Validate in Zod first so this is a bug, not a user path.
**Code Reference:** `src/lib/services/mcqs.ts` (when written)

### Preview shows the answer immediately

**Problem:** The correct radio is pre-selected or styled.
**Cause:** The preview component bound `isCorrect` from the loaded MCQ.
**Solution:** Ignore `isCorrect` on choices until an attempt response exists. Cover with `mcq-preview.test.tsx`.
**Code Reference:** `src/components/mcqs/mcq-preview.tsx` (when written)

### `@/` imports fail in Vitest

**Problem:** Tests cannot resolve `@/lib/...`.
**Cause:** `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution:** Do not change the harness unless it is actually broken; it already works for auth.
**Code Reference:** `vitest.config.ts`

### Phase tests are red after implementation

**Problem:** Production code exists but `npm test` still fails.
**Cause:** Test expects a different export shape, or the implementation diverged from this PRD.
**Solution:** Do not skip or delete the test. Align the export/API with this PRD, or fix a genuinely wrong assertion and record why.
**Code Reference:** the failing `*.test.ts` file

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading Overview and Hypothesis — this phase is the shared question bank, not identity and not a full quiz product
2. Obey Scope. Do not add roles, search, multi-question quizzes, or rich text. `mcqs` has `name` (title) and `question` (prompt) — do not add or restore a `description` column
3. Do not change register / login / logout behavior except to keep `/mcqs` gated
4. Follow TDD. For each phase: write the listed tests first, run `npm test` (expect red), implement, run `npm test` until green, then check that phase's acceptance criteria. Do not start the next phase while tests are red
5. Follow `.cursor/skills/testing/SKILL.md` and `.cursor/rules/d1.mdc`
6. Route handlers call `mcqService` / `attemptService`. Those services are the only SQL owners for these tables
7. Add shadcn components with `npx shadcn@latest add @shadcn/<name>` — the `@shadcn/` prefix is required
8. Update phase status markers as work progresses
9. Add implementation details (real file paths, migration filename) here as code is written
10. Mark acceptance criteria when they pass in a real run, not by inspection
11. Add troubleshooting entries when bugs are found and fixed
12. Ask before adding any npm dependency
13. Never deploy. Never apply D1 migrations remotely
14. Cite code as `filepath:line-number`
15. Keep `ai-workspace/login_and_logout_prd.md` as the record of auth; do not reopen it unless a bug in identity is found

---

## Current Status

**Last Updated:** 2026-09-08
**Current Phase:** Phase 3 - MCQ and attempt endpoints
**Status:** Phase 2 COMPLETED. Service tests went red (missing modules), then green after `mcqService` and `attemptService`. `npm test` 75/75. Phase 1 is on `origin/feature/mcq_crud_branch`. No remote migrate. No deploy.
**Next Steps:** Begin Phase 3 TDD: write handler tests under `src/lib/mcqs/`, confirm red, then implement the route handlers
