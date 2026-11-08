# API

Interactive OpenAPI: `/docs` (backend port 8000).

| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | Local simulation/live health |
| GET | /api/settings/provider | Key presence, live availability, model, limits and session connection status; never returns credentials |
| POST | /api/missions | Start a simulation or request a live planning report, HTTP 201 |
| POST | /api/missions/{id}/plan/approve | Approve the saved report and total budget; then create and run its workers |
| POST | /api/missions/{id}/plan/decline | Decline the saved report without starting workers |
| GET | /api/missions?trashed=false | Saved missions, newest first; use trashed=true for Trash |
| PATCH | /api/missions/{id} | Edit saved title (1–200 characters) and notes (up to 2000 characters) |
| DELETE | /api/missions/{id} | Move a stopped mission to recoverable Trash |
| POST | /api/missions/{id}/restore | Restore a mission from Trash |
| GET | /api/missions/{id} | Mission, agents, task graph, result |
| GET | /api/missions/{id}/events?after=0 | Durable historical events |
| GET | /api/missions/{id}/stream?after=0 | SSE catch-up and ongoing events |
| POST | /api/missions/{id}/pause | Pause at next checkpoint |
| POST | /api/missions/{id}/resume | Resume paused execution |
| POST | /api/missions/{id}/cancel | Request safe cancellation |

Create JSON: `{"prompt":"Explore synthetic weather", "scenario":"weather", "mode":"simulation"}`.
Scenarios: weather, data, concepts, failure. Prompt length 5–2000, nonblank.
Invalid inputs return 422, missing missions 404, invalid controls 409, active mission
cap 429. All endpoints are unauthenticated and intended for loopback development.

History mutations are loopback-only and require a completed, failed, or cancelled
mission with no remaining runner job. Active changes return 409. History entries
include `history: {title, notes, deleted}`. These changes append a
`mission.history_updated` event and preserve the original prompt, outputs, tasks,
agents, and earlier events; no database migration is required. Trashed missions
return 404 on execution/read endpoints until restored. Deletion never runs a
mission or resets its budget. The UI's **Edit & run again** opens the original
prompt in the composer; creating a new run requires pressing its launch button.

## Live mission request

Live missions first perform one paid commander planning request, then persist
`mission.plan_approval_requested` and enter `AWAITING_APPROVAL`. The event contains
the validated worker plan, proposed IDs, public report, assumptions and cost/time
estimates. No worker or task rows exist before approval. Human review time does
not consume an execution timeout or model calls. Pending reports survive restart.

Approval takes `{"plan_id":"event-id","total_budget_usd":0.30}`. The plan ID must
match the pending report; the explicit total must cover the planning allowance
and remain within the server ceiling. The server records `mission.plan_approved`
and reuses exactly the saved plan and IDs, preserving planning usage. Decline takes
`{"plan_id":"event-id"}` and records cancellation. Duplicate/stale decisions return
409. Both endpoints require loopback. Ordinary resume and budget approval do not
bypass this gate. Existing previously executed missions retain their retry flow.

```json
{"prompt":"Explain DNS for first-year students", "mode":"live", "max_workers":6, "max_iterations":3, "budget_usd":0.10}
```

The worker count is chosen by the commander from 1 through max_workers, not forced
to that maximum. Limits: workers 1–6, cycles 1–5, initial estimated allowance $0.01 up to the configured server ceiling (default $5.00).
One active live mission is allowed per process. Live creation requires a saved key
and a loopback client; external clients receive 403. Ready workers run sequentially
and receive only accepted dependency artifacts. Mission output includes usage,
limitations, worker count and acceptance records. See LIVE_ORCHESTRATION.md.

Live research adds `research.started` (public query) and `research.completed`
(cited sources, consulted sources, search actions and usage) events. Accepted
artifacts expose `sources` and `citations`; final mission output preserves source
links and `usage.web_search_calls`. Provider errors stop the mission without a
paid retry. Failed rubric checks may trigger another bounded worker cycle.

`POST /api/missions/{id}/retry` retries a failed live mission from accepted task
checkpoints. It requires loopback access, a configured key, available admission,
at least one accepted output and remaining cycles/usage. It retains the existing
plan, IDs, artifacts and cumulative budget; it cannot reset spending or cycle
guards. Rejected retries return 409. The client reconnects to SSE after its last
known sequence; prior failures remain visible in the historical ledger.

`retry?extend_cycles=true` explicitly grants two more worker cycles, up to the
server ceiling of five. The extension is recorded as `mission.limits_extended`;
prior usage and the original dollar guard are retained. Ordinary retry never
extends cycles. Text artifacts permit up to 20,000 characters; the final summary
has its own bounded output limit.

## Agent boards, guidance and stops

`POST /api/missions/{id}/agents/{agent_id}/guidance` takes
`{"instruction":"Include a concrete example and explain why it matters."}`.
It is loopback-only, live-only, and accepts instructions for waiting/active
workers in running/paused missions. It returns 201 with a pending guidance ID;
`agent.guidance_received` later identifies exactly which instructions were read.
Completed/stopped workers reject guidance with 409.

`master.observe/plan/act/test/adjust/repeat` and the matching worker events drive
the six-stage boards. Reports, messages and interventions are persisted separately.
`master.stopped` / `agent.stopped` carry `outcome`: completed, help_needed or
limit_reached. Failed mission responses also expose `output.stop_reason`.
Whole-mission model review must pass before a live mission.completed event.

## Spending approvals

GET /api/missions/{id}/budget shows usage, current allowance, pending requests,
ceiling and known resume blockers. POST .../budget/request records a proposal
without model calls. POST .../budget/approve requires request_id, new_limit_usd
and resume (default false). POST .../budget/deny requires request_id.
Decisions are loopback-only, reject stale/duplicate requests, and preserve usage.
The new allowance must exceed the old one, cover the known next-request estimate
and remain within LAB_MAX_MISSION_BUDGET_USD (default 5.00).
Approval never changes separate cycle, call, token, time or permission limits.

## Master Agent discussion

Loopback-only `GET /api/missions/{id}/master/chat` returns saved `messages`,
separate chat `usage`, and current `mission_status`.

`POST /api/missions/{id}/master/chat` accepts `message` (1–3000 visible
characters), UUID `request_id`, `language` (`en` or `ar`), and optional
`event_sequence` pointing to a non-chat mission event. Responses contain the
updated discussion. A repeated successful request ID returns its saved answer
without another model call; concurrent questions for one mission return 409.

`master.chat.message` records user and assistant messages; `master.chat.failed`
records sanitized provider errors. Assistant/error records use `chat_usage`,
not mission execution `usage`. Evidence sequence references are validated against
the actual supplied context. Chat has no execution tools and never changes
mission status, plans, names, outputs or approval events. Provider errors do not
automatically retry chat requests.

## Final answer copy and document exports

Loopback-only GET `/api/missions/{id}/answer/package` returns the canonical saved
final answer, original goal, limitations, safe source URLs and approval status.
Live missions require a saved master.final_approved before mission.completed.
Unfinished and unapproved live answers return 409. No execution state changes.

POST `/api/missions/{id}/answer/export` accepts `format` (`pdf` or `docx`) and
`variant` (`answer` by default, or `prompt`). Prompt export also requires the
reviewed `prompt_text` (1–60000 characters). The response is an attachment with
a real PDF or DOCX MIME type and no-store caching. Prompt documents are labeled
as drafts; they do not inherit approval of the original answer. Export makes no
AI calls, loads no remote images or sources, and creates files in memory.

PDF export uses installed Arial on Windows or DejaVu Sans on Linux; the Docker
image installs DejaVu fonts. Word uses editable native paragraphs, heading
styles, lists, tables, hyperlinks and page numbering.

## Mission source attachments

Local-only POST `/api/attachments?filename=...` takes raw file bytes and the
`X-Attachment-Upload: mission-composer` header. It returns a persisted source ID,
extracted text, page/character counts, SHA-256 provenance, coverage notices and
ready/needs_reading status. Upload and local text extraction make no AI calls.

POST `/api/attachments/{id}/read` takes `comments` (5–2000 characters) and performs
one explicit paid structured visual-reading request. Every visual page label
must be accounted for before ready status is granted. Repeated successful reads
return the cached result. Failures preserve usage without starting execution.
GET `/{id}` inspects extraction, GET `/{id}/original` downloads original bytes,
GET `/{id}/thumbnail` previews an image, DELETE `/{id}` removes an unused upload.
Sources referenced by saved missions cannot be deleted through this endpoint.

Mission creation accepts up to five `attachment_ids` in Live AI mode. IDs must
resolve to ready records. They are recorded in mission.created and passed as
untrusted evidence, separate from the user's comments. Source evidence reaches
planning, workers, final improvement/review and Master discussion. The existing
plan approval remains mandatory. Migration 0003 adds the attachments table.


### Save an answer to a stopped worker question

`POST /api/missions/{mission_id}/questions/{question_event_id}/answer`

Body: `{"instruction":"The intended audience is first-year students."}`

Loopback only. Accepts 1–1500 nonblank characters for a worker `HELP_REQUEST`
event in the same failed live mission. Completed worker tasks cannot be changed.
The route saves `commander.instruction` and `workspace.question_answered` together,
returns the answer event (201), and makes no provider call. Repeating the same
question ID returns the original saved answer. Continuation remains a separate,
explicit action through the existing recovery controls.


### Answer a pre-delegation master clarification

`POST /api/missions/{mission_id}/clarifications/{question_event_id}/answer`

Body: `{"answer":"The report is for first-year students and should fit one page."}`

Loopback only. Accepts 1–4000 nonblank characters. Requires the latest pending
`mission.clarification_requested` event and status `AWAITING_CLARIFICATION`, with
no created workers/tasks. Persists `mission.clarification_answered`, retains prior
usage and resource policy, and starts another planning request. A duplicate question
ID returns the current mission with `already_answered: true` without another call.
Returns `{mission, resumed}`. Plan approval remains a separate operation.
