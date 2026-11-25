# Security boundary

Accounts use salted scrypt password hashes and 256-bit random session tokens;
only SHA-256 token hashes are persisted. Cookies are HttpOnly, SameSite=Strict and
Secure under HTTPS. Sessions expire after 12 hours. Login failures are limited
per client address in the application process (10 attempts per five minutes).
Production proxy rate limits remain appropriate for multiple processes.

There is one named super admin: `nasser`. Public account registration and web
administrator setup are disabled, even on loopback. Nasser alone creates ordinary
user accounts and their assigned workspaces. Roles cannot be supplied through
account creation/edit requests. Database constraints restrict roles to `user` and
`super_admin`, reserve the super-admin name `nasser`, and allow at most one super
admin. Nasser cannot be renamed, disabled or deleted through the API. Migration
`0006` reuses the existing account identity and retains its password and records.

Every data endpoint requires a valid active account session, even before initial
operator provisioning and for loopback requests. Health and sign-in/session
endpoints are the only exceptions. Cross-origin writes are rejected. Keep the API
bound to loopback behind HTTPS with forwarded headers overwritten by the trusted
proxy. The existing Nginx Basic Auth gate remains an additional access gate.
No administrator password is stored in code, frontend assets, or documentation.

Mission, attachment and studio ownership is enforced on ORM reads and assigned
on insertion. Events, tasks and agents are also filtered through mission
ownership. Background jobs inherit the originating workspace. Administrators
explicitly select a user's workspace to review or intervene; work created there
belongs to that user. Browser requests include a workspace identifier so stale
tabs cannot accidentally write into another selected workspace. Stream loops
revalidate sessions and workspace selection. Password/username changes revoke
all sessions of that user. Disabling/deleting stops their running jobs; deletion
also returns reviewing administrators to their own workspaces. Deletion removes
credentials and archives the ownership identity and saved work in the database.
Database administrators/backups can still access archived records.

Only Nasser, the super admin, manages accounts or updates the shared provider key. Students
can use Live AI and manage their own missions; administrator approval is required
for extra limit/budget allowances. Provider configuration and one-live-mission
capacity are shared. There is no per-student billing allocation or hard provider
spending cap. This is an application workspace boundary, not an OS/container
sandbox: agent tools continue to have no arbitrary file or shell access.

Provider credentials remain in the backend environment or ignored local `.env`.
They never enter model context, API responses, replay events or frontend bundles.
The local launcher prefers the project file only inside its own process. Production
ASGI startup retains deployment-environment precedence. Provider errors are
sanitized and raw response bodies/headers are not logged. Reasoning items are
ignored; only validated assistant public output messages and usage are consumed.

Live plans use strict structured outputs and Pydantic validation. Team size is
bounded, dependency indexes must reference distinct earlier tasks, and worker names
are unique. Tools are allowlisted per worker. Arithmetic uses a bounded AST visitor,
never eval. There is no shell, filesystem, arbitrary network URL or generated-code
execution tool. Outputs render as text; model-produced HTML is not executed.

One live mission runs at a time. Calls, cycles, time, context reservations, tokens
and estimated spend are capped. Unknown/interrupted calls reserve conservative
usage estimates; rejected 4xx requests report no token usage. The estimate uses
configured model rates and is not a provider-side hard billing cap. Pausing cannot
stop a provider mid-computation. Cancelling stops local execution; in-flight work
may still be billed by the provider. Failed worker tests never deliver their draft
to a dependent task. Rubric review is not independent verification of factual truth.

Mission/dependency text is treated as untrusted data in model instructions. This
reduces but does not eliminate prompt-injection or content-quality risks. The local
operator controls initial access. Public deployment still needs proxy rate limiting,
CSRF/origin review, audit/usage management,
backup recovery and a production security assessment.

Public research is mediated by the fixed OpenAI Responses endpoint, not a backend
URL fetcher. The research action sends only the worker's query to this endpoint;
it has no local file or secret access. Search output is untrusted data. Only public
assistant text, search metadata and HTTP(S) URLs without embedded credentials are
persisted. React escapes all content; links use noopener/noreferrer. No page HTML
is executed. Source-backed acceptance does not prove scientific accuracy.

Budget increases require a pending event-backed request and an explicit administrator decision in the selected workspace. The commander cannot self-approve. Decisions are logged; denial does not resume work. Approval retains cumulative usage and cannot exceed the configured server ceiling.
