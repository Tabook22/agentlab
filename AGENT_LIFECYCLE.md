# Agent lifecycle

> Current implementation (27 October 2026): live mission-based orchestration is now available locally. See [LIVE_ORCHESTRATION.md](LIVE_ORCHESTRATION.md) for the current loop, schema, limits and scope. Earlier simulation descriptions below apply to Simulation mode. Public deployment/authentication remain pending.

Normal: CREATED → READY → ASSIGNED → RUNNING → COMPLETED → STANDBY.
Failure: RUNNING → FAILED → ASSIGNED (one scripted recovery attempt).
Cancellation: CREATED / READY / ASSIGNED / RUNNING / FAILED → CANCELLED.
Terminal eligibility: STANDBY / CANCELLED → TERMINATED.

`transition()` rejects other transitions. Termination is modeled but not exposed
through an administrator endpoint in Phase 1. Standby workers consume no model
tokens. Each mission creates fresh context and agent IDs. History is not deleted.
Pause is mission-level: agents retain their state until execution resumes. Shutdown
cancels runner tasks; an interrupted nonterminal mission is failed on next startup.
