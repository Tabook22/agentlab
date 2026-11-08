# Security boundary

This is a loopback-only, single-user educational app with no authentication or
per-student ownership. Do not expose it publicly or use confidential classroom data.
Live creation rejects non-loopback callers. Compose still binds the frontend to
127.0.0.1; live use behind a proxy requires a future authenticated deployment design.

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
operator controls access. Public deployment still needs authentication, ownership,
instructor authorization, rate limiting, CSRF/origin review, audit/usage management,
backup recovery and a production security assessment.

Public research is mediated by the fixed OpenAI Responses endpoint, not a backend
URL fetcher. The research action sends only the worker's query to this endpoint;
it has no local file or secret access. Search output is untrusted data. Only public
assistant text, search metadata and HTTP(S) URLs without embedded credentials are
persisted. React escapes all content; links use noopener/noreferrer. No page HTML
is executed. Source-backed acceptance does not prove scientific accuracy.

Budget increases require a pending event-backed request and an explicit local admin decision. The commander cannot self-approve. Decisions are logged; denial does not resume work. Approval retains cumulative usage and cannot exceed the configured server ceiling. This remains a local single-user trust model, not multi-user authentication.
