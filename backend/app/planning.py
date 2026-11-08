"""Public planning rationale for the scenario rules actually used by the simulator."""
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from .schemas import TaskPlan


class PlannedAssignment(BaseModel):
    task_id: str
    agent_id: str
    name: str
    role: str
    task: str
    why_separate: str
    receives: str
    performs: str
    produces: str
    waits_for: list[str]
    sends_to: list[str]


class MasterPlanExplanation(BaseModel):
    basis: Literal['scripted_scenario_rules','openai_mission_plan'] = 'scripted_scenario_rules'
    worker_count: int = Field(ge=1, le=8)
    commander_count: Literal[1] = 1
    requested_objective: str
    scenario_scope: str
    count_reason: str
    fewer_agents: str
    more_agents: str
    execution_order: str
    success_criteria: str
    assignments: list[PlannedAssignment]

    @model_validator(mode='after')
    def count_matches_team(self):
        if self.worker_count != len(self.assignments):
            raise ValueError('Explained worker count must equal the planned team size')
        if len({item.agent_id for item in self.assignments}) != self.worker_count:
            raise ValueError('Each planned worker must have a unique identity')
        return self


ROLE_DETAILS = {
    'Weather data': (
        'Keep data collection separate so students can inspect the original observations before any formatting.',
        'A request to read the local synthetic weather fixture.',
        'Read six temperatures and their day labels from the fixture.',
        'Six day labels and six synthetic temperatures.'),
    'Visualization': (
        'Give chart preparation its own inspectable input and output, separate from collection and checking.',
        'The weather observations produced by the data agent.',
        'Pair each day with its temperature to build chart-ready rows.',
        'Six chart-ready rows, preserving the original observations.'),
    'Data preparation': (
        'Make the original dataset visible before any calculation changes or summarizes it.',
        'A request to read the local synthetic student dataset.',
        'Read the five sample scores from the fixture.',
        'The original scores: 68, 75, 81, 92, 84.'),
    'Analysis': (
        'Keep the arithmetic inspectable as a separate responsibility from loading and checking the data.',
        'The five scores supplied by the data preparation agent.',
        'Add the scores, count the values, and divide the total by the count.',
        'The original scores, total 400, count 5, and average 80.'),
    'Lesson preparation': (
        'Expose where the explanation came from before it is formatted.',
        'A request to read a curated local lesson.',
        'Read the stored explanation of instructions, context, tools, and control logic.',
        'The original curated lesson text.'),
    'Explanation': (
        'Separate reading the source text from making its presentation easier to read.',
        'The curated text supplied by the lesson preparation agent.',
        'Split the text into readable sentences using a local formatting operation.',
        'The source text plus its formatted sentences.'),
}


def explain_plan(plan: TaskPlan, scenario: str, objective: str, task_ids: list[str], agent_ids: list[str]):
    weather = scenario in ('weather', 'failure')
    if weather:
        count_reason = 'I am using 3 worker agents because this classroom dashboard has three inspectable responsibilities: collect the observations, prepare the chart rows, and check that those rows preserve the source values. I keep the checker separate from the agent that prepares the chart data.'
        scope = 'Prepare and verify a six-day chart dataset using a local synthetic weather fixture.'
        fewer = 'A smaller implementation could combine collection and chart preparation in one worker and keep a second worker for checking. One worker could also do all the operations. This teaching template uses three so the data handoffs stay visible.'
        more = 'Extra workers would duplicate these small operations. More could be useful if the mission added distinct work such as independent data sources, separate city datasets, or a written report. Those tasks are outside this simulation.'
        success = 'Deliver six chart rows whose day labels and temperatures match the original fixture, with a passed consistency check. This does not verify a real forecast.'
    elif scenario == 'data':
        count_reason = 'I am using 3 worker agents to make three responsibilities visible: load the scores, calculate their average, and verify the calculation. Separating the checker lets students compare the analyst’s result with a recalculation from the received scores.'
        scope = 'Calculate and verify the average of five local synthetic student scores.'
        fewer = 'One worker could load the scores and calculate the average, while a second checks it. A single worker could perform the whole calculation too. This teaching template keeps all three stages separate to expose each input and output.'
        more = 'These five scores do not need extra workers. A larger mission might add distinct tasks for cleaning a messy dataset, comparing groups, or preparing charts. Adding workers without adding useful work would create extra coordination.'
        success = 'Deliver the original five scores, total 400, count 5, average 80, and a passed recalculation check.'
    else:
        count_reason = 'I am using 2 worker agents because this lesson example has two responsibilities: read the curated source and format it into sentences. There is no dataset calculation or chart-building task requiring a third specialist in this template.'
        scope = 'Read and format a curated explanation of how an AI agent works.'
        fewer = 'One worker could read and format the lesson. This teaching template uses two so students can see the source text handed to a different worker.'
        more = 'An extra worker would repeat work in this short example. More workers could be useful for additional tasks such as translation, source checking, or quiz creation, which this simulation does not perform.'
        success = 'Deliver the original curated lesson text and a list of readable sentences. No independent fact-checking agent is included in this example.'

    assignments = []
    for i, item in enumerate(plan.tasks):
        if item.role == 'Verification':
            detail = (
                'Give checking its own responsibility instead of asking the producer to mark its own output as correct.',
                'The prepared chart rows and original observations.' if weather else 'The analyst’s scores and reported average.',
                'Check the row count and compare each row with the source values.' if weather else 'Recalculate sum(scores) / len(scores) and compare it with the reported average.',
                'The received result plus recorded check results and a verified flag.')
        else:
            detail = ROLE_DETAILS[item.role]
        recipients = [other.name for other in plan.tasks if i in other.dependencies]
        assignments.append(PlannedAssignment(
            task_id=task_ids[i], agent_id=agent_ids[i], name=item.name, role=item.role, task=item.title,
            why_separate=detail[0], receives=detail[1], performs=detail[2], produces=detail[3],
            waits_for=[plan.tasks[d].name for d in item.dependencies],
            sends_to=recipients or ['Master Agent / final result'],
        ))
    if scenario == 'failure':
        count_reason += ' The simulated timeout is recovered by retrying the data agent once; it does not justify creating another worker.'
    return MasterPlanExplanation(
        worker_count=len(plan.tasks), requested_objective=objective, scenario_scope=scope,
        count_reason=count_reason, fewer_agents=fewer, more_agents=more,
        execution_order=' → '.join(item.name for item in plan.tasks) + ' → Master Agent / final result',
        success_criteria=success, assignments=assignments,
    )
