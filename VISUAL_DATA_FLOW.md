# Teaching with the visual data-flow board

Open **Team → Team in action**. The **Follow the data** board shows the master
and every planned or recorded worker with the same three stages:

- **Input** (blue): the received context or values, with recorded source agents.
- **Processing** (purple): public plans, executed operations and checks. Open
  **All steps in this attempt** to inspect intermediate events and values.
- **Output** (green): the current attempt's artifact and whether the master has
  accepted it. A new attempt clears the previous attempt's processing and output.

The transfer strip preserves each recorded exchange in order, including repeated
exchanges between the same two agents. Select one to highlight both participants
and read the transferred payload. Master revision feedback uses an amber return
arrow. Questions and guidance remain distinct from results and task approval.

**Replay key moments** now includes input, observation, processing, checks and
output events as well as handoffs. Use Previous, Next or Play to advance the board.
The board reconstructs each historical state from that event prefix, without new
model calls. Agent inspection is disabled in this local historical view so it
cannot accidentally open the latest state as though it were historical data.

The display represents recorded public activity, not private model reasoning.
Missing events remain marked as unrecorded. Transfers do not establish an agent
hierarchy. The current engine has one master and sequential workers; recursive
sub-agent creation and parallel worker scheduling remain future engine work.

The layout stacks input, processing and output vertically on narrow screens and
supports English and Arabic teaching labels. Color is reinforced by labels,
icons and arrow direction. Motion respects reduced-motion preferences.

Validation: frontend tests cover attempt isolation, input provenance, repeated
handoffs, revision direction, participant coverage, simulation acceptance and
replay milestones. Browser verification uses the local mocked-provider preview,
with no paid AI requests.
