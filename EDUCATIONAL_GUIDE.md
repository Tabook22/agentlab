# Instructor guide

> Current implementation (27 October 2026): live mission-based orchestration is now available locally. See [LIVE_ORCHESTRATION.md](LIVE_ORCHESTRATION.md) for the current loop, schema, limits and scope. Earlier simulation descriptions below apply to Simulation mode. Public deployment/authentication remain pending.

## First experiment: follow the data

1. Open **Inside the work** and click **Start guided example**.
2. Follow Pixel: request to read a fixture → actual fixture read → five scores.
3. Follow Nova: received scores → sum 400 → count 5 → division → average 80.
4. Select Pixel again to see the named Pixel → Nova handoff and exact delivered data.
5. Follow Scout: received calculation → independently recalculated average → passed check.
6. Pause when needed. Replay with one event at a time to avoid missing a short step.

Ask students to identify the *same data* in one agent's output and the next agent's
input. Explain that these workers are deterministic local software components.
The stages show observable operations, not private language-model reasoning.

## 30 minutes

1. (5 min) Compare chatbot, tool-using agent, and multi-agent team in Learning Center.
2. (10 min) Run weather laboratory. Explain the SIMULATION label and synthetic data.
   Inspect Cloudy: creating a specialist configures software; it does not train AI.
3. (5 min) Switch to Workflow and inspect the result handoff. Why must Prism wait?
4. (5 min) Run recovery challenge. Identify failure, retry, and successful verification.
5. (5 min) Replay step by step. Discuss why replay makes no additional model calls.

## 60 minutes

Use the first 30-minute sequence, then spend 10 minutes on synthetic score analysis
and checking its mean by hand, 10 minutes pausing and comparing world/workflow
states, and 10 minutes discussing permissions, privacy, verification and tradeoffs.

Ask students: Would one tool-using agent be enough? What coordination overhead did
the team introduce? What does the verifier actually check? It checks data shape or
arithmetic, not the truth of a real forecast. Separate observable logs from private
model reasoning. This milestone has no real model and no interactive quiz catalog.

## Discuss decisions with the Master Agent

Open **Chat with Master Agent**, **Discuss this plan with the Master Agent** in
the approval report, or **Discuss my decisions** in the master inspector. The
Master’s study supports Arabic and English, saves the discussion, and keeps chat
API estimates separate from mission execution costs. Sending a question makes
a paid model request; opening or reading the room does not.

Before approval, compare the team with a smaller alternative, ask which inputs
each worker receives, and identify acceptance criteria. Select a recorded decision
to focus the question. After completion, ask which recorded checks justified final
approval. Open the numbered evidence chips to inspect the actual saved record.
Distinguish recorded reasons from proposed alternatives and retrospective explanation.

Discussion never changes the plan, authorizes workers, or grants final approval.
Use the existing plan/execution controls to apply decisions. The chat describes
public rationale and recorded evidence, not private internal reasoning. For long
missions its context includes the plan, selected decision, key reviews and recent
activity rather than every artifact; the answer records its evidence snapshot.

## A simpler mission workspace

Use the four direct shortcuts at the top: **Goal**, **Plan**, **Team**, and
**Answer**. These are navigation shortcuts, not an additional approval wizard.
A proposed plan opens for review before workers start; completed missions open
on their saved answer. Plan and Answer become available when those records exist.

Select **Ask the master** to discuss the current mission. Pause/resume and the
estimated execution cost stay in the same header. **More tools** contains replay,
the activity board, detailed work, animated world, workflow, and cancellation.

In the mission form, expand **Prefer to speak? Record your voice** to use Arabic
or English voice input, or type directly. Examples and advanced team settings
remain optional. During plan review, edit worker names directly; approving the
plan confirms those names. **Explore the full team plan** opens the detailed
responsibilities, acceptance criteria and coordination explanation.

Saved answers render headings, lists, code and comparison tables as readable content.
Use **Jump to a section** to go directly to the relevant part of a longer answer.
Only public HTTP/HTTPS source URLs become links; raw HTML remains text.

## Reuse an approved answer

The **Answer** page contains **Copy answer**, **PDF**, **Word**, and **Turn into
a prompt**. Copy includes rich formatting when the browser permits it, with a
manual text-copy fallback. PDF and editable Word reports include the original
goal, final answer, limitations, and source links. They are created locally
without extra model calls. Live final-report export requires a recorded final
Master approval and a completed mission.

**Turn into a prompt** builds an editable draft from the answer and original
goal. Review or change it, then copy it or download the edited version as PDF
or Word. This derived prompt is not a new Master-approved answer. Reset draft
restores the generated template and discards edits.

## Start with files and images

Use **Add files or images** or drag sources into the mission composer. Supported
formats are TXT/MD, PDF, DOCX, PNG/JPEG/WebP. Add typed or recorded comments
explaining what the master should do with them. Text extraction is local;
**Read visual content** explicitly sends images/scanned pages/graphics and your
comments to the configured OpenAI model. That reading is billed separately and
does not start a mission or authorize workers.

Review **text and coverage** on each file. A file is ready only after required
visual content is read. Limitations and uncertain OCR are retained for the master.
Requesting the plan sends comments and extracted source evidence to OpenAI. The
master receives that evidence when planning, workers and reviewers receive it
during execution, and Master chat can discuss it. Workers still start only after
you approve the proposed plan. Saved missions expose sources and original-file
downloads; editing a saved goal restores its sources.

Uploads support five sources per mission, 10 MB per source, 50 PDF pages and up to
10 visual pages/images per file. Text is limited to 120,000 characters per source
and 180,000 per mission. Oversized inputs are rejected rather than silently
truncated. These are attachment processing limits, not execution-cycle limits.
Word paragraph/table/header/footer text is extracted; complex shapes, equations,
footnotes, comments and revision history may require a PDF copy for full review.
