# AI Agent Lab — Watch AI at Work

Give AI a mission. Watch the agents come alive!

A local educational application with **Live AI** and **Simulation** execution.
In Live AI, an OpenAI-backed commander reads the actual mission, chooses **1–8
workers**, explains why, and assigns task-specific roles, tools, acceptance criteria
and dependencies. Each worker runs **observe → plan → act → test**, using feedback
to repeat within a cycle limit. Workers submit drafts to the commander for acceptance or revision. The commander improves the combined answer and records explicit final approval only after whole-mission checks pass.

## Run locally (Python 3.12+, Node 20.19+)

From `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m alembic upgrade head
python run_local.py
```

From `frontend`, in another terminal:

```powershell
npm ci
npm run dev
```

Open the URL printed by Vite (normally http://127.0.0.1:5173; the current preview
uses port 5174). `/api` is proxied to the loopback backend on port 8000.

## Configure the saved project key

Copy `backend/.env.example` to `backend/.env` if needed and fill in
`OPENAI_API_KEY=` locally. Never paste it into chat, frontend code or Git.
`python run_local.py` gives this project file precedence **inside that process**,
preventing an unrelated inherited key from overriding the saved project key. It
never changes system environment settings. Normal production ASGI startup still
prefers deployment environment variables. The settings endpoint returns only key
presence, model, limits and whether a real call has succeeded; never credentials.

Default live model: `gpt-5.4-mini`. Default accounting rates are $0.75 input and
$4.50 output per million tokens, checked against the official model documentation
on 27 October 2026. Custom models require explicit server-side rates. See
[LIVE_ORCHESTRATION.md](LIVE_ORCHESTRATION.md) for limitations and sources.

## Try it

1. Open **Live board**, enter a mission and choose **Live AI**.
2. Set a maximum team size, cycle limit and estimated spending guard.
3. Click **Ask commander for a plan**. This authorizes the paid planning request
   within your selected allowance. The commander proposes the smallest useful
   team within your maximum; the count is not fixed at three.
4. Review the single report: mission interpretation, agents and assignments,
   dependencies, acceptance criteria, estimated total API cost, suggested total
   cap and estimated execution time. Workers have not been created yet.
5. Set the total allowance and choose **Approve this plan and start workers**, or
   decline to revise your mission. Approval uses the saved plan without another
   paid planning call. Estimates are heuristic, with visible assumptions and
   timeout risks; they are not guaranteed costs or completion times.
6. In each worker's **Observe → Plan → Act → Test** board, select a stage or cycle.
   Observe shows exactly the scoped mission/task/dependency data and prior feedback.
   Plan shows the model's brief public action plan. Act shows executed tool inputs
   and outputs. Test shows criterion checks and revision feedback.
7. Read the Master Agent's corresponding board and its team-size explanation.
8. Use **Animated world** for packet movement or **Complete activity ledger** for
   every recorded event. Replay uses stored events and makes no new model calls.

Example missions: a short DNS explanation; compare DNS and HTTP and create a quiz;
analyze explicitly supplied scores; draft a student campaign plan. The allowed tools
are `write_text`, bounded arithmetic `calculate`, `inspect_context`, and source-backed
`web_research` through the Responses API. **No arbitrary shell, file access or code execution is
available.** Missing capabilities must be stated, not pretended.

Simulation retains the four classroom scenarios and costs no model tokens. Its
teams are predefined. Live AI is a separate, clearly labeled mode.

## Limits and scope

- Loopback-only single-user demo; no authentication or per-student isolation yet.
- One active live mission, 1–8 workers, default 3 cycles per worker (initial setup maximum 5; admin can approve more), 24 model calls,
  120,000 reported-token guard, 240-second mission timeout and 45-second requests.
- Mission allowance defaults to $0.10; admin-approved increases stay below the configured ceiling (default $5.00). Request
  reservations are conservative; this is not a provider-side billing guarantee.
- No automatic paid retry after provider/network errors. Failed acceptance checks
  can lead to another explicitly recorded worker cycle.
- Pause takes effect at checkpoints; in-flight model calls may finish first.
  Cancellation closes the client request, but a provider may still bill work.
- Public observations/plans/actions/test summaries are inspectable. Private model
  reasoning items are not requested for display or persisted.
- Rubric review is model-assisted acceptance checking, **not external fact checking**.
- Ready tasks currently run sequentially. Additional provider adapters, additional external
  tools, parallel scheduling, full Arabic lessons, authentication and production
  deployment remain future work. Do not expose this local demo publicly.

## Verify

```powershell
# backend: mocked providers only; no paid requests
python -m pytest -q
# frontend
npm test
npm run build
```

Optional, explicitly paid local smoke test while the server runs:
`python scripts/live_smoke.py` (default estimated guard $0.05).

See TESTING.md for recorded results, ARCHITECTURE.md for the execution design,
SECURITY.md for boundaries and IMPLEMENTATION_PLAN.md for remaining milestones.

## Custom research missions

Enter any objective in **Your custom mission** and choose **Live AI**. The Dhofar
grazing research example is prefilled and can be restored with its example button.
For missions requesting similar studies, the commander can assign an upstream
researcher, deliver its cited brief to a design worker and combine their outputs.
The worker count still follows the mission and configured maximum.

Research uses the provider's public web search, at most two built-in tool calls per
research action. It records query/action metadata, public findings, inline citation
metadata and HTTP(S) source URLs. Links are visible in worker artifacts and final
output. Sources from accepted dependencies are preserved through handoffs.
This is a bounded initial review and proposed design, not an exhaustive systematic
review, field measurements or validation of a grazing intervention.

Search-call estimates add $0.01 per built-in web search call to model token costs.
Preflight reserves two calls and additional search context; provider usage can vary.
The spending guard is an estimate rather than a billing guarantee.

If a live mission stops after some tasks have been accepted, **Retry remaining
work** can resume the unfinished workers without repeating the completed research.
The original usage guard and cycle limits still apply. Exhausted resource allowances pause the mission for an explicit admin-approved increase. This is an explicit retry, not an automatic paid retry.

## Inspect every agent loop

See [AGENT_LOOPS.md](AGENT_LOOPS.md) for the shared visible loop, role-specific responsibilities, actual guidance/acknowledgment events, whole-mission verification and the three autonomous stop outcomes. All new simulation and live runs publish these boards.

## Fix a mission spending stop

Use the critical limit-approval panel on the paused mission. The commander recommends an increase for the reached allowance; only explicit admin approval grants it. Approval continues saved work with cumulative usage retained. The default spending ceiling is $5 and does not grant extra allowance automatically. See [BUDGET_APPROVALS.md](BUDGET_APPROVALS.md).

## Watch master review and approval

The Live board begins with the collaboration view: mission interpretation, the reason for the team size, assignments, worker submissions and the master’s feedback. Animated world shows draft packets returning to the master and approval or revision packets returning to each worker. Replay follows saved events, including these review exchanges.

Live workers cannot complete until the commander’s task review passes. The commander then improves the final answer against the original intention and reviews that improved draft. A failed final check can trigger one further improvement/review cycle within the configured cycle, call, time and spending limits. Only `master.final_approved` permits final delivery. This remains model-assisted review rather than independent fact checking.

The planning estimate includes the extra commander improvement call. Failed checks can add calls; existing spending approval and execution consent still apply. Simulation demonstrates worker consultation and final approval with scripted local checks; it performs no model review or rewrite. Older saved missions without approval events are not labeled as master-approved.

## Speak your mission in Arabic or English

Use **Record voice** below the mission field. Choose automatic Arabic + English detection or a specific spoken language, allow your browser microphone, speak, then choose **Stop & transcribe**. Recording ends automatically after two minutes. Review and edit the transcript, then choose **Add to mission**. It appends to the text currently in the mission field; it never starts a mission. If the combined text exceeds 2000 characters, shorten it before adding; nothing is silently truncated. You may continue typing during transcription.

Transcription uses the saved backend OpenAI key and the current `gpt-transcribe` file transcription API, preserving the spoken language. Transcription charges are separate from the mission spending guard; the interface discloses this before recording. There are no automatic paid retries. A failed request keeps the recording in the current page for an explicit retry. Cancelling an in-flight request may not prevent provider billing. Adding or discarding releases the browser audio. Recordings are processed in memory and are not written to the application database or disk.

Microphone permission is required. If an embedded browser blocks access, open the same local URL in Chrome or Edge. Arabic and English interface labels and automatic text direction are supported. The backend accepts one transcription at a time, validates WebM/MP4/WAV containers and limits uploads to 10 MB. No new dependency, credential entry, or database migration is needed.

API implementation reference: [OpenAI file transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text) and [transcriptions reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create), checked 28 October 2026. Unit tests mock the microphone and transcription provider; they do not record personal audio or make paid requests.

## Choose your workers’ names

Before approving a live team, the report asks **Do you approve these worker names?** Choose **Use the master's suggested names** or **Choose my own names**. Custom names can be Arabic or English, must be distinct, and use 1–60 visible characters. Your choices are saved with the execution approval and applied before workers are created. This changes neither the task graph nor the model plan, and makes no extra AI request.

On an existing mission’s Live board, use **Change name** on a worker card and **Save name**. This also works for simulation workers. The new display name is saved to the worker configuration and recorded as `agent.renamed`. All boards reconstruct names from recorded events, so replay shows the name that applied at that point. Original messages and delivered artifacts remain historical records. Renaming never recreates a worker or repeats its work.

## Limits pause for approval instead of failing

A live mission that reaches its spending, worker-cycle, call, token, commander-step or execution-time allowance is held as **Awaiting limit approval**. A critical alert shows the master’s recommended increase. Choose **Approve increase and continue mission** to authorize that specific allowance, or **Keep mission paused** to decide later. The same workers, accepted outputs, saved drafts and cumulative usage are kept. Every subsequent limit produces another hold; no increase is automatic. Normal Resume cannot bypass approval. The recommendation itself uses saved resource data and makes no paid model call.

The saved hold survives restarts. Legacy missions stopped by a resource limit are converted to this approval flow at startup. See [BUDGET_APPROVALS.md](BUDGET_APPROVALS.md) for API details and configured ceilings. The no-cost browser fixture `backend/scripts/preview_limit_approval.py` uses only mocked provider responses and demonstrates repeated cycle approvals.

## Open-ended execution (current default)

Live execution now continues until the master approves the final answer, without app spending, total-time, cycle, call or token caps. Review the initial team/names and cost/time estimate once, then let the agents work. Estimates and accumulated API cost remain visible. You can pause or cancel at any time. Extra work can exceed estimates; no fixed final price is promised.

For a saved stopped mission, **Continue until finished** resumes the same task graph, worker identities, accepted work, drafts and usage in open-ended mode. A new continuation estimate is shown with the live cost counter. The older limit-approval sections describe the optional legacy bounded API policy (`open_ended: false`); they no longer describe the default app workflow. See [BUDGET_APPROVALS.md](BUDGET_APPROVALS.md).

Open-ended runs recover from temporary provider connection/server failures with recorded delayed retries; interrupted requests retain their conservative estimated usage. This differs from legacy bounded runs, which still require an explicit retry after provider failures.

Illustrated mission sources: DOCX files can contain up to 100 embedded images (within the 10 MB file / 50 MB expanded archive limits); PDFs remain limited to 50 pages. Visual content is read in batches of four, with per-image coverage, cumulative estimated cost, and saved batch results. Retrying after failure with unchanged comments reads only unfinished batches. Changing comments on an unfinished reading starts a fresh interpretation while retaining the prior usage ledger. A source becomes ready only after all images/pages pass coverage checks; the 120,000-character source and 180,000-character mission limits still apply.


## Team workspace

In **Team in action**, agent workbenches show each assignment, latest activity,
public approach, and saved draft. Open a desk to inspect **Context → Plan → Work →
Check**. These are public records, not private model reasoning. The shared result
board separates worker contributions, task acceptance, and recorded final approval.
Use **Questions & decisions** to filter actual questions, ideas, feedback, decisions,
and handoffs. Workers still execute sequentially; live workers now send their public
approach to the master, which receives it alongside the draft during review.

If a live worker stops to request essential input, answer it in **Needs your answer**.
Saving an answer records commander guidance and makes no model request. Then open
recovery controls and explicitly continue the saved mission to apply it. Stored replay
is read-only. **Replay key moments** steps through saved events with no new AI calls.
The original animated view remains available under **Mission map**.


Agent avatars use scalable, local SVG artwork. The master has a dedicated gold and
purple leader design; eight worker character styles follow the assigned role, with
stable ID-based fallback for unfamiliar roles. Character names and traits are visual
personality cues, available in English and Arabic. Active character motion follows
recorded working state and respects reduced-motion settings. No new model calls or
external avatar services are needed. To regenerate the artwork contact sheet, run
`node scripts/avatar-preview.mjs` from `frontend`.


## Clarification before delegation

In Live AI, the master first checks whether the mission's essential outcome, scope,
audience, deliverable, constraints and inputs are clear. Material ambiguity returns
**Awaiting your clarification**, with a direct question and the master's current
understanding. No worker tasks are proposed, created or assigned while waiting.
Clear missions proceed directly to a team proposal.

Answer in the clarification panel and choose **Send answer & continue planning**.
This authorizes another paid planning request within the mission's existing execution
policy. The master may ask a focused follow-up or publish a plan. Planning charges
accumulate across rounds; duplicate submissions do not trigger duplicate calls.
Workers still start only after approval of the team plan. Questions and answers
survive reload and restart, and feed the planner, workers and final review. The
original submitted mission remains unchanged in history. Cancel is available while
waiting, and partial recorded replay cannot submit an answer.
#   a g e n t l a b  
 