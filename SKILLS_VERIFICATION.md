# Skills workflow verification

Final checks: **235 backend tests passed**, **150 frontend tests passed**, and
the production frontend build passed. The normal-flow verification script passed
all five requested flows. `git diff --check` passed. Backend warnings concern
existing Starlette/Alembic deprecations; Vite reports a bundle-size advisory.

The reproducible checks use the normal authenticated mission, plan approval,
skill, history and retry APIs with a disposable database. Browser verification
uses the built frontend against that same application. External AI requests are
disabled in this fixture. Live execution behavior is tested with mocked provider
responses; actual paid model output quality has not been verified.

## No matching skill, draft and activation

Passed: a mission completes directly with the Master, its successful workflow is
saved as an inactive draft, then explicitly activated. Draft instructions exclude
source text, input/output values, credentials and raw correction text.

## Auto selection with different inputs

Passed: a subsequent request selects the active extraction skill and uses the
new excerpt and reference. The run records the stable skill ID and pinned version.
Tests also cover draft edits coexisting with an older active revision.

## Parallel extraction and dependent comparison

Passed: two **Extract Account Details** steps overlap in execution. Both use the
same skill revision with different inputs. **Compare Heritage Accounts** starts
after both finish. The output separates agreement and differences and preserves
`CLASSROOM-OMAN-A` and `CLASSROOM-OMAN-B`.

The supplied demonstration texts are fictional classroom examples set in Dhofar,
Oman. Their shared location and frankincense tradition agree; their participants,
collection descriptions and purposes differ. These examples demonstrate source
handling, rather than establish historical facts.

See the generated [comparison](tmp/skill-verification/heritage-comparison.md)
and [normal-flow results](tmp/skill-verification/report.json).

## Failed-step retry

Passed through both API and browser: the second extraction fails once, the
comparison waits, and retry preserves the first accepted result. Final attempt
counts are **1, 2, 1**. Tests cover retry after restart, pinned revisions, missing
nested inputs, and preventing additions from changing an accepted step's inputs.

## Existing configurations and history

Passed: legacy runs still expose their original agents, configurations and events
through the existing application APIs. A read-only backup of the existing local
database was migrated from revision `0005` to `0007` in a disposable copy:

| Record | Before | After |
| --- | ---: | ---: |
| Missions | 58 | 58 |
| Agents | 133 | 133 |
| Tasks | 133 | 133 |
| Events | 9,593 | 9,593 |
| Attachments | 4 | 4 |

Agent configuration values are unchanged; foreign key checks pass. This copy
check did not modify the source database. See the generated
[migration report](tmp/skill-verification/history-migration-report.json).

## Setup and reproduction

See [SKILLS_WORKFLOWS.md](SKILLS_WORKFLOWS.md) for commands, the no-cost browser
demo, version lifecycle, execution behavior and migration instructions. Generated
fixture reports and databases stay local under `tmp/skill-verification` and can
be recreated with `python scripts/verify_skill_workflows.py` from `backend`.
