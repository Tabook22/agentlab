# Open-ended execution with visible cost

Live missions now default to `open_ended: true`. After the initial team/name approval, the commander and workers continue revising until their acceptance checks and final master approval pass. App spending, total model calls, total tokens, worker cycles, commander steps and total execution time do not stop or pause these missions.

Estimates remain informational. The mission report shows the initial cost/time estimate; the monitor shows cumulative estimated API cost, calls and tokens. Continuing an existing mission records a fresh rough total estimate for the next continuation pass. Extra research or review can exceed the estimate. Accounting is never reset. Usage is saved after completed model calls and retained across continuation.

Pause and cancel remain available. Tool permissions, per-request response-size settings, network timeouts, provider errors and genuine missing-input help requests still apply. Open-ended execution does not bypass final acceptance or invent unavailable data. Temporary connection failures and provider server errors retry automatically in open-ended mode, with a delay increasing from 5 to 60 seconds. The per-request connection timeout is 180 seconds; it is not a total mission time cap. Retry notices and conservative estimated usage for interrupted requests remain recorded. Provider authentication/quota errors or genuinely missing inputs can still require attention. Legacy bounded execution retains its no-automatic-retry behavior.

## Existing saved missions

`POST /api/missions/{id}/execution/open` is the explicit local-admin action to continue a waiting/failed saved live mission in open-ended mode. It keeps worker names and IDs, accepted outputs, drafts and cumulative usage. A saved request_help proposal is not replayed as a new request; the worker receives fresh commander guidance and observes its saved context again. No extra team approval is required when the existing plan already has consent.

The old numeric approval UI is replaced by **Continue until finished** and a refreshed current status. Completed/running missions are not misrepresented as awaiting a limit. `mission.execution_opened` persists the policy so refreshes and future continuations retain it. No work is silently resumed after a process restart.

## Compatibility

API clients may explicitly send `open_ended: false` to retain the previous bounded resource/approval workflow. Its stored limits, validation and endpoints remain for old clients and regression coverage. The app interface uses open-ended execution.
