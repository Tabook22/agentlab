"""Measured comparisons of deterministic teaching workflows, not AI benchmarks."""
import math
import statistics
from time import perf_counter
from uuid import UUID
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import update
from .access import require_admin
from .db import StudioRun
from .studio import find_run, public_run

FIXTURE = [68, 75, None, 81, 92, 84]


class ExperimentRequest(BaseModel):
    request_id: UUID
    variable: Literal['team_size', 'criteria', 'input']
    prediction: str = Field(min_length=10, max_length=1200)


class ReflectionRequest(BaseModel):
    expected_revision: int = Field(ge=0)
    reflection: str = Field(min_length=10, max_length=1500)


def run_workflow(source, config):
    started = perf_counter()
    trace = []
    handoffs = []
    def record(owner, operation, value):
        trace.append({'sequence': len(trace) + 1, 'owner': owner, 'operation': operation, 'value': value})
    collector = 'Input worker' if config['workers'] == 3 else 'Analyst'
    analyst = 'Calculation worker' if config['workers'] == 3 else 'Analyst'
    reviewer = 'Review worker' if config['workers'] == 3 else 'Analyst'
    record(collector, 'read_source', list(source))
    if None in source and config['missing_policy'] is None:
        record(collector, 'request_clarification', 'missing_value_policy')
        return {'status': 'NEEDS_INPUT', 'output': None, 'checks': [], 'trace': trace, 'handoffs': [],
                'elapsed_ms': round((perf_counter() - started) * 1000, 3),
                'question': 'Should missing scores be excluded or treated as zero?', 'api_calls': 0, 'cost_usd': 0}
    values = [value for value in source if value is not None]
    record(collector, 'exclude_missing', {'excluded': len(source) - len(values), 'values': values})
    if config['workers'] == 3:
        handoffs.append({'sender': collector, 'receiver': analyst, 'data': list(values)})
    total = sum(values)
    output = {'mean': total / len(values)}
    record(analyst, 'calculate_mean', {'sum': total, 'count': len(values), 'mean': output['mean']})
    if config['criteria'] == 'explicit':
        output.update(count=len(values), minimum=min(values), maximum=max(values))
        record(analyst, 'calculate_range_and_count', dict(output))
    if config['workers'] == 3:
        handoffs.append({'sender': analyst, 'receiver': reviewer, 'data': dict(output)})
    # Re-read the frozen source and use a separate calculation for the mean.
    independent = [value for value in source if isinstance(value, (int, float))]
    checks = [{'id': 'mean', 'passed': math.isclose(output['mean'], statistics.fmean(independent)),
               'expected': statistics.fmean(independent), 'actual': output['mean']}]
    if config['criteria'] == 'explicit':
        for field, expected in [('count', len(independent)), ('minimum', min(independent)), ('maximum', max(independent))]:
            checks.append({'id': field, 'passed': output[field] == expected, 'expected': expected, 'actual': output[field]})
    record(reviewer, 'independent_check', checks)
    return {'status': 'COMPLETED', 'output': output, 'checks': checks, 'trace': trace, 'handoffs': handoffs,
            'elapsed_ms': round((perf_counter() - started) * 1000, 3), 'api_calls': 0, 'cost_usd': 0}


def build_experiment(variable, prediction):
    baseline = {'workers': 1, 'criteria': 'explicit', 'missing_policy': 'exclude'}
    alternative = dict(baseline)
    if variable == 'team_size':
        alternative['workers'] = 3
    elif variable == 'criteria':
        baseline['criteria'] = 'mean_only'
    else:
        alternative['missing_policy'] = None
    return {'engine': 'score-workflow-v1', 'variable': variable, 'prediction': prediction,
            'source_snapshot': list(FIXTURE), 'reflection': '',
            'baseline': {'config': baseline, **run_workflow(FIXTURE, baseline)},
            'alternative': {'config': alternative, **run_workflow(FIXTURE, alternative)}}


def experiment_router(sessions):
    router = APIRouter()

    @router.post('/experiments', status_code=201)
    def compare(body: ExperimentRequest, request: Request):
        require_admin(request)
        if len(body.prediction.strip()) < 10:
            raise HTTPException(422, 'Write a prediction of at least ten visible characters.')
        with sessions() as db:
            existing = db.get(StudioRun, str(body.request_id))
            if existing:
                if existing.kind != 'experiment':
                    raise HTTPException(409, 'This request already belongs to another activity.')
                return public_run(existing)
            row = StudioRun(id=str(body.request_id), kind='experiment', title='Score analysis · controlled comparison',
                            status='COMPLETED', data=build_experiment(body.variable, body.prediction.strip()))
            db.add(row); db.commit()
            return public_run(row)

    @router.post('/experiments/{key}/reflect')
    def reflect(key: str, body: ReflectionRequest, request: Request):
        require_admin(request)
        if len(body.reflection.strip()) < 10:
            raise HTTPException(422, 'Write a reflection of at least ten visible characters.')
        with sessions() as db:
            row = find_run(db, key, 'experiment')
            if body.expected_revision != row.revision:
                raise HTTPException(409, 'This experiment changed. Reopen the saved record.')
            if row.data.get('reflection') == body.reflection.strip():
                return public_run(row)
            result = db.execute(update(StudioRun).where(StudioRun.id == key, StudioRun.revision == body.expected_revision)
                                .values(data={**row.data, 'reflection': body.reflection.strip()}, revision=row.revision + 1))
            if result.rowcount != 1:
                raise HTTPException(409, 'Another reflection arrived. Reopen the saved record.')
            db.commit(); db.expire_all()
            return public_run(db.get(StudioRun, key))

    return router
