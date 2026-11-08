from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Structured(BaseModel):
    model_config = ConfigDict(extra='forbid')


class LiveTaskSpec(Structured):
    name: str = Field(min_length=1, max_length=60)
    role: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    instructions: str = Field(min_length=1, max_length=1800)
    why_separate: str = Field(min_length=1, max_length=600)
    expected_output: str = Field(min_length=1, max_length=600)
    input_description: str = Field(min_length=1, max_length=600)
    dependencies: list[int] = Field(max_length=8)
    tools: list[Literal['write_text', 'calculate', 'inspect_context', 'web_research']] = Field(min_length=1, max_length=4)
    acceptance_criteria: list[str] = Field(min_length=1, max_length=5)


class LiveMissionPlan(Structured):
    help_request: str = Field(max_length=1000,description='Empty only when essential mission requirements are clear. Otherwise ask for clarification and return no tasks.')
    count_reason: str = Field(min_length=1, max_length=1200)
    fewer_agents: str = Field(min_length=1, max_length=700)
    more_agents: str = Field(min_length=1, max_length=700)
    scope: str = Field(min_length=1, max_length=800)
    success_criteria: str = Field(min_length=1, max_length=1000)
    tasks: list[LiveTaskSpec] = Field(max_length=8)

    @model_validator(mode='after')
    def validate_graph(self):
        if bool(self.help_request.strip())==bool(self.tasks):
            raise ValueError('Provide either a useful team or a help request, not both')
        names=set()
        for index, task in enumerate(self.tasks):
            if task.name.casefold() in names:
                raise ValueError('Worker names must be unique')
            names.add(task.name.casefold())
            if len(task.dependencies)!=len(set(task.dependencies)) or any(d<0 or d>=index for d in task.dependencies):
                raise ValueError('Dependencies must reference distinct earlier tasks')
            if len(task.tools)!=len(set(task.tools)):
                raise ValueError('Tool permissions must be unique')
        return self


class WorkerProposal(Structured):
    observation_summary: str = Field(min_length=1, max_length=800)
    public_plan: list[str] = Field(min_length=1, max_length=5)
    action: Literal['write_text','calculate','inspect_context','web_research','request_help']
    argument: str = Field(max_length=20000,description='For write_text: the complete finished deliverable, not instructions to another writer. For web_research: a focused query of at most 2000 characters.')
    action_summary: str = Field(min_length=1, max_length=600)
    known_limitations: list[str] = Field(max_length=5)


class ReviewCheck(Structured):
    criterion: str = Field(min_length=1, max_length=1200)
    passed: bool
    evidence: str = Field(min_length=1, max_length=600)


class WorkerReview(Structured):
    checks: list[ReviewCheck] = Field(min_length=1, max_length=6)
    feedback: str = Field(min_length=1, max_length=1000)

    @property
    def passed(self):
        # One source of truth: every individual criterion must pass.
        return all(check.passed for check in self.checks)


class FinalReport(Structured):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=10000)
    limitations: list[str] = Field(max_length=8)
