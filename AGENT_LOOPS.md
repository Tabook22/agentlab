# Visible agent loops

Every new commander and worker recording uses the same public contract:
Understand → Plan → Act → Check → Adjust → Repeat. Adjust/repeat are recorded
only when work continues; completed work does not invent additional stages.

The commander analyses mission requirements, explains the approach and resources,
creates the team and completion criteria, dispatches ready tasks, monitors reports,
sends visible corrections and finally checks the actual combined deliverables
against the original mission. Passing worker rubrics alone does not complete a
live mission. A failed whole-mission review stops for help.

Each worker reads its assignment and scoped inputs, publishes a brief action plan,
uses an allowed tool, checks its artifact, reports progress, then finishes or reads
feedback in another cycle. Live workers can explicitly request_help when essential
input or a human decision is missing; the question is recorded to the commander.

## Stop outcomes

- completed: the actor’s required checks pass.
- help_needed: missing information, a blocked task, provider/configuration failure,
  or a combined result that does not satisfy the mission.
- limit_reached: worker cycles, commander steps, time, call/token or spending guard.

These are saved as agent.stopped/master.stopped events. Operational mission status
remains FAILED for the latter two for compatibility; stop_reason distinguishes
the teaching outcome in the API and boards. Manual cancellation remains a separate
user action. Live ceilings: 5 worker cycles, 8 commander steps, 24 calls, 120,000
reported tokens, a 240-second execution window and the original dollar guard.
Explicit retry retains usage, accepted outputs and cycle counts. Simulation uses
at most two worker attempts, eight commander steps and a 240-second window.

## Intervention and inspection

The live board presents each actor’s assignment, public explanation, current
status, activity log, progress/check counts, communication and verification.
Waiting workers also have a board. Replay uses only the visible event prefix.
Historical recordings without loop events do not acquire invented stages.

On an active live worker board, the admin may send a clarification through the
commander. POST /api/missions/{id}/agents/{agent_id}/guidance records its origin,
reason, recipient and message. Guidance is pending until agent.guidance_received
acknowledges it. Guidance arriving mid-cycle prevents accepting an outdated draft
and is read in the next bounded cycle. Completed outputs cannot be silently edited.

Failed worker checks trigger a recorded commander intervention and an actual
instruction carried into the worker’s next world snapshot. Simulation recovery
uses a labelled scripted intervention. Public plans and action explanations are
shown; private model reasoning is not requested or persisted.
