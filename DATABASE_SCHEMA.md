# Phase 1 database schema

> Current implementation (27 October 2026): live mission-based orchestration is now available locally. See [LIVE_ORCHESTRATION.md](LIVE_ORCHESTRATION.md) for the current loop, schema, limits and scope. Earlier simulation descriptions below apply to Simulation mode. Public deployment/authentication remain pending.

Alembic revision `0001` creates four tables with foreign keys and mission indexes:

| Table | Fields |
|---|---|
| missions | UUID id, prompt, scenario, status, created_at, JSON output |
| agents | UUID id, mission FK, JSON config, lifecycle state |
| tasks | UUID id, mission FK, agent FK, title, JSON prerequisite IDs, status, JSON output |
| events | UUID id, mission FK, sequence, timestamp, type, optional agent/task references, JSON payload |

Unique `(mission_id, sequence)` ensures ordered replay. Agent configuration stores
name, role, instructions, tools, model label, creation timestamp, context and retry
limit. Messages and tool executions are event payloads in this milestone. Task
inputs are resolved from prerequisite outputs. Event timestamps record starts,
completion and activity. Event agent/task references are descriptive strings, while
task-agent ownership has a foreign key. Dependency IDs are application-validated.

No delete endpoint exists, preserving history. Future normalized users, definitions,
messages, tools, output, usage, lesson and configuration tables are planned. JSON
and SQLAlchemy string keys keep the schema portable; PostgreSQL is not yet tested.
