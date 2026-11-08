# Event protocol v1

> Current implementation (27 October 2026): live mission-based orchestration is now available locally. See [LIVE_ORCHESTRATION.md](LIVE_ORCHESTRATION.md) for the current loop, schema, limits and scope. Earlier simulation descriptions below apply to Simulation mode. Public deployment/authentication remain pending.

Every event contains `id`, `mission_id`, `sequence` (starting at 1), UTC ISO
`timestamp`, `type`, nullable `agent_id` / `task_id`, and a JSON `payload`.
Payload `summary` is the student explanation; technical fields remain inspectable.

Events: `mission.created`, `mission.planning`, `mission.plan_ready`, `agent.created`,
`agent.ready`, `task.created`, `task.assigned`, `agent.started`, `agent.tool_started`,
`agent.tool_completed`, `agent.message_sent`, `task.completed`, `task.failed`,
`task.retry_requested`, `agent.standby`, `agent.cancelled`, `mission.pause`,
`mission.resume`, `mission.cancel`, `mission.completed`, `mission.failed`.

Detailed work events extend v1 without changing its envelope:

| Type | Payload | Meaning |
|---|---|---|
| agent.input_received | input, source_agents, summary | Exact dependency output, or a fixture-read request for the first worker |
| agent.operation | operation, step, value, tool, summary | An operation already performed and its actual intermediate value |
| agent.tool_completed | output, summary | The completed tool result |

Each operation yields through a safe checkpoint for observation and pausing. The
delay is an educational pacing interval, not a model progress estimate. The tool
executes actual arithmetic / formatting / validation; no LLM reasoning is claimed.
`agent.message_sent.payload.data` equals the predecessor's saved output and the
receiver's subsequent input. Its summary names both agents. Handoffs are emitted
when a prerequisite result is delivered to the ready receiver, not at creation time.

Messages include message ID, sender, receiver, type, delivered status and actual
dependency output. Mission/task/timestamp live on the enclosing event. Currently
only dependency result handoffs use the structured message envelope; assignments
and retries are dedicated events. No fictional communication edges are generated.

`GET /api/missions/{id}/stream?after=N` emits standard SSE `id` and `data` fields.
`Last-Event-ID` is also supported; the greater cursor wins. Connection termination
after terminal state is expected. GET events can recover the complete record. Clients
deduplicate on mission sequence. Replay does not execute a mission or invoke models.

## Public planning rationale

`mission.plan_ready` now precedes all `agent.created` and `task.assigned` events.
Its payload includes `summary`, reserved `task_ids`, and a validated `plan` with
`worker_count`, `commander_count`, `requested_objective`, `scenario_scope`,
`count_reason`, `fewer_agents`, `more_agents`, `execution_order`, `success_criteria`,
and assignments. Each assignment contains the actual reserved task/agent IDs,
name, role, task, reason for a separate role, receives/performs/produces descriptions,
prerequisite names and recipient names. `basis=scripted_scenario_rules` identifies
the deterministic source of the explanation. Historical records without this
payload remain unchanged. A replay reveals this explanation at its original event.

## Public action explanations

`master.decision` and `agent.decision` contain `action`, `reason`, `evidence`,
`source=simulation_rule`, optional `target_agent_id`, and a student-friendly
`summary`. These are concise public explanations of programmed decisions, not
private model reasoning. Master events record scenario selection, dispatch gated by
completed dependencies, one permitted recovery attempt, and final-output selection.
Worker events occur after input receipt and before tool execution; evidence records
the actual received input and allowlisted tool. The full board reads only the event
prefix selected by live streaming or replay, so future actions stay hidden.


### Workspace collaboration

- `agent.message_sent` with `message_type: IDEA`: a worker's public approach is
  delivered to the master. `data` contains `public_plan`, `observations`, and
  `known_limitations`. The same public plan is supplied as `worker_approach` to
  draft review. This is distinct from `INFORMATION_RESPONSE` result handoffs,
  `HELP_REQUEST` questions, and `GUIDANCE` feedback.
- `workspace.question_answered`: a saved human answer, with `question_id`,
  `guidance_id`, `sender`, `receiver`, and `instruction`. The linked
  `commander.instruction` enters the worker's context upon explicit continuation.
  Saving an answer does not start or resume execution.


### Pre-delegation mission clarification

- `mission.clarification_requested`: question, current public understanding, usage,
  continuation options and status `AWAITING_CLARIFICATION`. The job releases its
  admission slot and the stream closes. No worker records are created.
- `mission.clarification_answered`: question ID, original question, user answer and
  status `RUNNING`. Another planning pass begins with all saved clarifications.
- `master.mission_understood`: public understanding, success criteria and number
  of clarification rounds used. Emitted before the proposed task graph. The normal
  `mission.plan_approval_requested` gate still precedes worker creation.
