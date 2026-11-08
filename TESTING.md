# Verification

Backend: `cd backend` then `python -m pytest -q`. The suite contains **65 tests**.
On Windows this environment needs local socket access for asyncio initialization;
the suite passes when run with that access. One existing Starlette/httpx
deprecation warning remains. Provider tests use dummy keys and mocked transport;
ordinary test runs do not make paid requests.

The backend checks simulation scenarios, data lineage, lifecycle, persisted SSE
and replay history, provider configuration and secret redaction. Live coverage
includes mission-based 1/2/4-worker plans, DAG validation, accepted handoffs,
failed-rubric revision, tool permissions, arithmetic limits, cancellation,
call/token/spending guards and source-backed research. Research checks cover
source sanitization, cited-source lineage, no-source rejection, search fees,
duplicate tool IDs and terminal provider errors without paid retry cycles.

Checkpoint retry preserves accepted artifacts, IDs, the original plan, usage and
cycle counts. Exhausted cycles reject ordinary retry; an explicit extension is
logged and retains previous spending. Review verdicts derive from individual
criterion checks and exact rubric coverage. Multiple assistant messages are
parsed as separate documents. Commander assembly preserves accepted text.

Frontend: `cd frontend`, `npm test`, `npm run build`. **21 tests pass**, covering
event ordering, replay prefixes, cycle separation, animation packets, activity
lineage and safe public citations. TypeScript/Vite production build passes.
These are reducer/helper tests; full component/browser automation is not claimed.

Browser checks use the real local app: custom mission entry, live launch,
mission-based team explanation, research source links, scoped handoff, worker
plan/action/test boards, failed-review feedback, explicit retry and recorded
cycle extension. A real research request returned study links from PubMed,
Springer and ScienceDirect. This demonstrates execution; it is not independent
scientific validation or an exhaustive literature review.

Historical real API smokes: a short DNS answer chose one worker; a classroom pack
chose two and passed an accepted-output handoff. Those recordings used the earlier
model-synthesis final step. Current commander assembly uses no paid rewrite.

The Dhofar mission obtained seven cited source links and produced a 15,525-character
planning draft. Its final review was blocked by the conservative context guard, so
the mission remains failed and the plan is explicitly marked draft. The app now
shows saved accepted work and unreviewed drafts together on stopped missions.
Exports: Dhofar-grazing-research.md and Dhofar-grazing-plan-draft.md. No claim of a
completed/accepted end-to-end Dhofar mission is made.

## Shared visible loop verification

57 backend tests pass. Added coverage includes commander and worker help requests,
worker/commander/time limits, whole-mission rejection after passing worker tasks,
actual final-result verification, recorded automatic interventions, admin guidance
receipt, and simulation recovery loops for every agent. 21 frontend tests pass,
including adjustment/repeat stages, actor-specific outcomes and replay isolation.
The production build passes.

Browser: the no-cost recovery simulation completed. The commander recorded four
cycles and whole-scenario verification; Cloudy failed its first check, received a
visible commander instruction, read it in cycle two, and completed. Every worker
board and the commander board showed a completed stop outcome. No paid model
requests were made for this change.

The additional in-flight-guidance regression passes: a clarification arriving during a check prevents acceptance until a new cycle reads it. The 57-test full suite and this additional regression passed; 21 frontend tests and the final production build passed.

## Spending approval checks

65 backend tests pass. Seven new cases cover waiting for permission before
planning, denial/approve-only without provider calls, resuming tool/review/master
check checkpoints, cumulative usage, duplicate decisions, server ceiling and
other guards. The 21 frontend tests and production build pass. All approval
execution tests use mocked transport; no real budget was approved or charged
during verification. The browser preview leaves a pending request for the admin.

## Arabic and English localization

68 backend tests and 25 frontend tests pass; the production build passes.
Localization checks cover the interface string inventory, dynamic messages,
accessible labels, workflow controls, preserving editable values and raw evidence,
and both selected languages reaching every mocked commander and worker request.
Unsupported language values are rejected. Tests make no paid provider calls.

Browser checks verified Arabic boards, saved simulation replay, learning material,
settings and mission history, and switching back to English. The language preference
persists across page reloads; Arabic sets RTL layout. New live missions request
public artifacts in the selected language. Original saved freeform artifacts,
custom mission text, source links and raw JSON retain their original content.
The local backend was restarted with no active missions to load these changes.
Preview: `arabic-interface-preview.png`.

## Mission History management

70 backend tests and 25 frontend tests pass; production build passes. History
tests verify saved titles and notes, input validation, active-mission protection,
Trash exclusion, blocked access while trashed, restoration, and unchanged original
prompts, task outputs, agents and event records. History operations make no model
calls. Browser verification used one no-cost simulation to edit details, move it
to Trash, restore it and prepare its original prompt for an edited new run without
launching another mission. New controls are localized in Arabic and English.

## Mission monitoring

28 frontend tests and the production build pass. The new progress selector tests
request matching, unique completed tasks, planned totals, replay isolation, and
whole-mission verification remaining separate from task completion. Failed-run
requests cannot appear as active requests after a retry. Browser checks used a
no-cost simulation: Start opened the connected monitor automatically, counts
advanced from 0/3 to 1/3 to completion, and loop boards followed their latest
recorded stage. The verification simulation was moved to recoverable Trash.
No live budget was approved and no paid mission was started for this change.
The user's stopped live mission was opened with its actual 1/2 task progress and
spending-limit message. Inputs and accepted/draft outputs remain preserved.

## Animated work effects

29 frontend tests and the production build pass. Work animation is gated by
actual mission and worker states, playback/pause controls, terminal events and
motion preferences. Live diagrams follow incoming events by default; manual
event playback remains available. Flowing dashed activity lines are distinct
from packets for recorded deliveries. Browser verification used a no-cost
simulation recording; computed styles confirmed an active worker's visible
`work-line-flow` animation was running. Reduced motion was enabled in the browser;
the explicit Motion on control successfully enabled the effects. No paid API
calls or budget changes were made. Preview: `animated-work-effects-preview.png`.

## Commander report approval gate

73 backend tests and 31 frontend tests pass; production build passes. The gate
publishes a persisted report and AWAITING_APPROVAL status before creating workers.
Tests cover zero worker rows or further provider calls while waiting, exact saved
plan execution after consent, duplicate/stale decisions, cap validation, decline,
planning usage preservation, budget consent not bypassing plan consent, and pending
reports surviving a backend restart. Browser testing used an isolated mocked
provider and test database on ports 8001/5175. Approval started exactly the saved
team; the report persisted through frontend reload and Arabic labels were checked.
Test servers and their browser tab were closed afterward. No real paid planning
request, execution or budget increase was made during these checks. The idle main
backend was restarted to activate the new routes. Preview uses mocked data:
`commander-approval-report-preview.png`.
