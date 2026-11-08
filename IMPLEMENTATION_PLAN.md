# AI Agent Lab implementation plan

> Current implementation (27 October 2026): live mission-based orchestration is now available locally. See [LIVE_ORCHESTRATION.md](LIVE_ORCHESTRATION.md) for the current loop, schema, limits and scope. Earlier simulation descriptions below apply to Simulation mode. Public deployment/authentication remain pending.

## Milestone 1 — runnable vertical slice (this delivery)
FastAPI, SQLAlchemy/SQLite, Alembic, validated mission requests, an agent factory,
dependency scheduling, real structured handoffs, event persistence and reconnectable
SSE. React/TypeScript laboratory and workflow views consume the same events.
Include inspector, persisted history/replay, pause/resume/cancel and an intentionally
failing simulation with recovery. Validate with automated backend and frontend tests.

## Milestone 2 — live orchestration
Provider adapters, validated model plans, real allowlisted tools, verification,
timeouts, token accounting and enforced budgets. Do not enable live execution before
these controls and mocked-provider integration tests exist.

## Milestone 3 — richer educational world
Movement between stations, message packet animations, lifecycle controls, optional
muted sound, complete Arabic content and classroom presentation refinements.

## Milestone 4 — advanced inspection
Reusable definitions, configurable safe agent teams, task reassignment, tool traces.

## Milestone 5 — learning and replay
Fifteen interactive bilingual lessons, quizzes, comparison experiments, speed controls
and replay scrubbing with end-to-end browser coverage.

## Milestone 6 — classroom deployment
Authentication, per-user ownership, instructor authorization, rate limits, audit and
usage reporting, PostgreSQL validation, hardened VPS deployment and HTTPS.

Phase 1 is a local single-user demonstrator, not a student-facing production service.
