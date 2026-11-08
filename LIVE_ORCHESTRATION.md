# Live mission-based orchestration

The commander uses the actual user mission and a configured worker maximum to
produce a validated plan. `LiveMissionPlan` contains one to six task/worker specs,
why that count is useful, fewer/more tradeoffs, role instructions, allowed tools,
dependencies and acceptance criteria. The backend validates the DAG before creating
any workers. There is no fixed three-worker live template.

The validated proposal now stops at a persisted approval gate. The commander
publishes its analysis, team and task breakdown, input/output dependencies and
completion criteria alongside assumption-based cost and time ranges. The admin
authorizes the exact plan and a total dollar allowance, or declines it. Workers
are created only after approval. The planning call is paid and its usage remains
counted; waiting for permission makes no model calls. Execution uses the saved
plan, avoiding a second planning charge. Estimates use configured rates and
explicit token/search/latency assumptions, and disclose timeout/ceiling risks.

Every worker has a separate configuration, scoped context, task and event history.
It receives only its mission, role, task, explicit predecessor artifacts, allowed
tools, cycle limits and previous local feedback. The Observe event stores exactly
this world snapshot; no provider secrets or other missions are included.

For every bounded cycle:

1. Observe: publish the received world snapshot.
2. Plan: ask the configured model for a brief public action plan and one action.
3. Act: validate the action against the worker's permissions and execute the tool.
4. Test: validate the tool result and run a separate model rubric review covering
   every exact acceptance criterion. Publish checks and actionable feedback.
5. Repeat: when a test fails and cycles remain, the next world snapshot includes
   the draft, failed checks and feedback. Otherwise fail the task.

Only a passed artifact is stored as a completed task and delivered to dependents.
The commander assembles all accepted deliverables verbatim, retaining source links and caveats without another paid model rewrite.
The UI shows these public work products, not private internal reasoning.

The Responses API adapter consumes only assistant output_text messages and token
usage. It ignores reasoning items. `store:false` is used. HTTPX calls go only to the
fixed official Responses endpoint. No local browser, shell, or unrestricted external-action tool is
available to a student worker. Provider errors do not cause automatic paid retries.

Current limits: 6 workers, default 3 cycles (ceiling 5), 24 calls, 120,000 reported-token guard, 240 seconds
per execution window (including an explicitly requested retry), 45 seconds per request, an explicit estimated mission allowance under the server ceiling (default $5.00). Preflight
reservations use a conservative byte-based input bound plus output-token cap.
Interrupted requests remain uncertain and reserve their estimated maximum. Prices
are configurable estimates, not a provider billing guarantee. Default rates for
`gpt-5.4-mini` were verified on 27 October 2026: $0.75 input / $4.50 output per million.
A different model requires explicitly configured input/output rates.

Sources: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
and [GPT-5.4 Mini model and pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

Known limits: loopback access only, one active live mission, sequential scheduling
of ready workers, no arbitrary URL fetch or code execution, and model-assisted
rubric review rather than external fact verification. Multi-user production access,
other provider adapters and genuinely isolated code tools remain unimplemented.

## Bounded public web research

`web_research` is a worker permission and action. A separate Responses request
requires the built-in `web_search` tool, allows at most two tool calls and includes
`web_search_call.action.sources`. Its public assistant text, URL citation offsets,
HTTP(S) source metadata and search actions become a draft artifact. The ordinary
acceptance cycle then checks the research brief before any downstream handoff.
No reasoning items are persisted. A missing search result/source list fails clearly.

Accepted research source lists propagate to dependent worker outputs and the final
report. The UI renders provider citation spans and Markdown inline links as safe
anchors, with a separate source list. Retrieved text remains untrusted evidence.

The budget counts provider-reported tokens and $0.01 per returned search call.
Preflight reserves two search fees plus 16,000 extra estimated input tokens. This
is a conservative guard, not an absolute guarantee for provider-returned context.
Research calls share the mission call/token/time/spending limits. Network errors
do not trigger automatic paid retries.

References: [Web search](https://developers.openai.com/api/docs/guides/tools-web-search)
and [tool pricing](https://developers.openai.com/api/docs/pricing).

The backend derives a review verdict from all individual check flags and exact assigned-criterion coverage. No second model-generated pass flag can contradict those checks. Consulted-source metadata is stored in the research completion event; only cited references travel with the accepted brief to keep downstream context focused.

See AGENT_LOOPS.md for the current shared loop contract. The commander now runs a separate whole-mission rubric review on the actual assembled outputs. Assembly itself remains verbatim; review adds a bounded model call and must pass before mission completion. Explicit help and limit outcomes are saved per actor.

Spending-limit exceptions record a commander request for admin approval. BUDGET_APPROVALS.md documents approval-only, approval-and-resume, denial, and saved-stage recovery; no agent can grant itself a higher allowance.
