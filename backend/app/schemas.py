from typing import Literal
from pydantic import BaseModel, Field, model_validator


class AgentConfiguration(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    role: str = Field(min_length=1, max_length=100)
    instructions: str = Field(min_length=1, max_length=2000)
    tools: list[Literal['educational_fixture']]
    model: Literal['None — simulation'] = 'None — simulation'
    created_at: str
    context: str = 'Only this mission’s fixture data.'
    resource_limits: dict[str, int] = Field(default_factory=lambda: {'retries': 1})


class PlanItem(BaseModel):
    name: str
    role: str
    title: str
    dependencies: list[int] = Field(default_factory=list)


class TaskPlan(BaseModel):
    tasks: list[PlanItem] = Field(min_length=1, max_length=6)

    @model_validator(mode='after')
    def ordered_acyclic_graph(self):
        for index, task in enumerate(self.tasks):
            if len(task.dependencies) != len(set(task.dependencies)):
                raise ValueError('Duplicate prerequisite')
            if any(dep < 0 or dep >= index for dep in task.dependencies):
                raise ValueError('Prerequisites must reference an earlier task')
        return self
