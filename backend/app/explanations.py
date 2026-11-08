"""Short public action explanations; never private model reasoning transcripts."""
from typing import Literal
from pydantic import BaseModel, Field


class PublicDecision(BaseModel):
    source: Literal['simulation_rule'] = 'simulation_rule'
    action: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    evidence: dict
    target_agent_id: str | None = None


def explain_action(action, reason, evidence, target_agent_id=None):
    explanation = PublicDecision(action=action, reason=reason, evidence=evidence,
                                 target_agent_id=target_agent_id)
    return {**explanation.model_dump(), 'summary': f'{action}. {reason}'}


def worker_reason(role, received):
    if role == 'Analysis':
        return 'An average needs a total and a count. Add the received scores, count them, then divide the total by that count.'
    if role == 'Verification':
        return ('A chart should preserve the source observations. Compare every chart row with the original day and temperature, and check the count.'
                if 'temperatures' in received else
                'The reported average needs a consistency check. Recalculate it from the received scores and compare the two values.')
    if role == 'Visualization':
        return 'A chart needs one row per day. Pair each received day label with its corresponding temperature while preserving the source values.'
    if role == 'Explanation':
        return 'The source explanation is already supplied. Split it into sentences to make it easier to read; this task does not require generating new claims.'
    return 'This task needs original classroom data. Read it from the approved local fixture instead of guessing values, then pass the unmodified source onward.'
