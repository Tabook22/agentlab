from typing import Literal, Annotated
from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class InputBinding(Strict):
    name: str = Field(pattern=r'^[a-zA-Z][a-zA-Z0-9_]{0,59}$')
    source: Literal['mission', 'step', 'dependencies'] = 'mission'
    key: str = Field(default='', max_length=120)
    step: int | None = None


class WorkflowStepSpec(Strict):
    title: str = Field(min_length=1, max_length=200)
    instructions: str = Field(min_length=5, max_length=4000)
    skill_id: str | None = None
    dependencies: list[int] = Field(default_factory=list, max_length=12)
    bindings: list[InputBinding] = Field(default_factory=list, max_length=30)
    executor: Literal['master', 'delegated'] = 'master'
    delegation_reason: Literal['none', 'isolated_context', 'independent_review', 'different_permissions'] = 'none'
    delegation_rationale: str = Field(default='', max_length=800)
    tools: list[Literal['write_text', 'calculate', 'inspect_context', 'web_research']] = Field(default_factory=lambda: ['write_text'], min_length=1, max_length=4)
    expected_outputs: list[Annotated[str, Field(min_length=1, max_length=2000)]] = Field(default_factory=lambda: ['A complete answer with supplied source references.'], min_length=1, max_length=5)

    @model_validator(mode='after')
    def delegation_is_necessary(self):
        if self.executor == 'delegated' and (self.delegation_reason == 'none' or len(self.delegation_rationale.strip()) < 10):
            raise ValueError('Delegate only with an explicit context, independent-review or permission boundary and rationale.')
        if self.executor == 'master' and self.delegation_reason != 'none':
            raise ValueError('Master steps do not require another agent.')
        if len({b.name for b in self.bindings}) != len(self.bindings):
            raise ValueError('A step input must have one unambiguous binding.')
        return self


class SkillSelection(Strict):
    skill_ids: list[str] = Field(max_length=6)
    reason: str = Field(min_length=1, max_length=1200)


class SkillMissionPlan(Strict):
    interpretation: str = Field(min_length=1, max_length=1400)
    steps: list[WorkflowStepSpec] = Field(min_length=1, max_length=12)

    @model_validator(mode='after')
    def graph(self):
        validate_graph(self.steps)
        return self


def validate_graph(steps):
    for index, step in enumerate(steps):
        if len(set(step.dependencies)) != len(step.dependencies) or any(dep < 0 or dep >= index for dep in step.dependencies):
            raise ValueError('Dependencies must reference distinct earlier steps; cycles and future references are not allowed.')
        for binding in step.bindings:
            if binding.source == 'step' and binding.step not in step.dependencies:
                raise ValueError('Input bindings can read only declared dependencies.')
            if binding.source == 'dependencies' and not step.dependencies:
                raise ValueError('Declare dependencies before binding their outputs.')


class OutputField(Strict):
    name: str
    value: str


class SourceReference(Strict):
    reference: str
    label: str


class StepArtifact(Strict):
    content: str = Field(min_length=1, max_length=20000)
    fields: list[OutputField] = Field(max_length=60)
    source_references: list[SourceReference] = Field(max_length=40)
    limitations: list[str] = Field(max_length=8)


class WorkflowFinal(Strict):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20000)
    limitations: list[str] = Field(max_length=8)
    suggest_skill: bool
    suggestion_reason: str = Field(max_length=1200)


class MissionInputs(Strict):
    inputs: dict[str, JsonValue]


class StepCorrection(Strict):
    instructions: str = Field(min_length=5, max_length=4000)


class WorkflowApproval(Strict):
    plan_revision: int = Field(ge=1)


class WorkflowRetry(Strict):
    step_id: str | None = None


class DraftFromRun(Strict):
    update_existing: bool = True
    target_skill_id: str | None = None
