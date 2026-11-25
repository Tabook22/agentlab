"""Free hands-on activities. These never call a provider or start a live mission."""
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from .db import StudioRun, now
from .access import require_user


class StartActivity(BaseModel):
    request_id: UUID


class LibraryContract(BaseModel):
    submission_id: UUID
    expected_revision: int = Field(ge=0)
    borrowing_rule: Literal['available_only', 'any_book']
    after_borrow: Literal['available', 'borrowed']
    after_return: Literal['available', 'borrowed']
    loan_days: int = Field(ge=1, le=30)
    explanation: str = Field(min_length=10, max_length=1500)


def library_checks(contract):
    """Execute the learner's state transitions against the task contract."""
    def borrow(state):
        allowed = state == 'available' or contract['borrowing_rule'] == 'any_book'
        return (contract['after_borrow'] if allowed else state), allowed

    first_state, first_allowed = borrow('available')
    second_state, second_allowed = borrow(first_state)
    returned = contract['after_return']
    _, next_allowed = borrow(returned)
    return [
        {'id': 'borrow', 'passed': first_allowed and first_state == 'borrowed',
         'actual': f'available → {first_state}',
         'feedback': 'A successful loan must mark the book borrowed.'},
        {'id': 'double_loan', 'passed': not second_allowed and second_state == 'borrowed',
         'actual': 'Second loan ' + ('allowed' if second_allowed else 'blocked'),
         'feedback': 'Only available books may be borrowed; a second loan must be blocked.'},
        {'id': 'return', 'passed': returned == 'available' and next_allowed,
         'actual': f'borrowed → {returned}; next loan ' + ('allowed' if next_allowed else 'blocked'),
         'feedback': 'Returning a book must make it available for the next student.'},
        {'id': 'duration', 'passed': 1 <= contract['loan_days'] <= 14,
         'actual': str(contract['loan_days']),
         'feedback': 'This classroom library permits loans of 1–14 days.'},
    ]


def public_run(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def find_run(db, key, kind=None):
    row = db.get(StudioRun, key)
    if not row or kind and row.kind != kind:
        raise HTTPException(404, 'Practice record not found.')
    return row


def studio_router(sessions):
    router = APIRouter(prefix='/api/studio', dependencies=[])

    @router.get('/runs')
    def list_runs(request: Request, kind: Literal['participation', 'experiment', 'project']):
        require_user(request)
        with sessions() as db:
            rows = db.scalars(select(StudioRun).where(StudioRun.kind == kind)
                              .order_by(StudioRun.created_at.desc(), StudioRun.id).limit(50))
            return [{k: getattr(row, k) for k in ('id', 'kind', 'title', 'status', 'revision', 'created_at')} for row in rows]

    @router.get('/runs/{key}')
    def read_run(key: str, request: Request):
        require_user(request)
        with sessions() as db:
            return public_run(find_run(db, key))

    @router.post('/participation', status_code=201)
    def start_participation(body: StartActivity, request: Request):
        require_user(request)
        with sessions() as db:
            existing = db.get(StudioRun, str(body.request_id))
            if existing:
                if existing.kind != 'participation':
                    raise HTTPException(409, 'This request already belongs to another activity.')
                return public_run(existing)
            row = StudioRun(id=str(body.request_id), kind='participation', title='Library team · requirements analyst',
                            data={'attempts': [], 'handoff': None, 'engine': 'library-contract-v1'})
            db.add(row); db.commit()
            return public_run(row)

    @router.post('/participation/{key}/submit')
    def submit_contract(key: str, body: LibraryContract, request: Request):
        require_user(request)
        if len(body.explanation.strip()) < 10:
            raise HTTPException(422, 'Explain your rules in at least ten visible characters.')
        with sessions() as db:
            row = find_run(db, key, 'participation')
            attempts = row.data['attempts']
            if any(attempt['id'] == str(body.submission_id) for attempt in attempts):
                return public_run(row)
            if row.status == 'COMPLETED' or body.expected_revision != row.revision:
                raise HTTPException(409, 'This activity changed. Reopen its saved record before submitting.')
            if len(attempts) >= 50:
                raise HTTPException(409, 'Start a fresh practice activity to continue.')
            contract = body.model_dump(exclude={'submission_id', 'expected_revision'})
            checks = library_checks(contract)
            accepted = all(check['passed'] for check in checks)
            attempt = {'id': str(body.submission_id), 'timestamp': now(), 'contract': contract,
                       'checks': checks, 'accepted': accepted}
            handoff = None
            if accepted:
                handoff = {'sender': 'You · requirements analyst', 'receiver': 'Designer · local simulation',
                           'contract': contract, 'source_submission_id': attempt['id'],
                           'flow': ['Check book availability', 'Block a loan if already borrowed',
                                    f'Record a loan for {contract["loan_days"]} days and mark borrowed',
                                    'On return, mark available for the next student'],
                           'verification': library_checks(contract)}
            # Optimistic update prevents concurrent tabs from overwriting attempts.
            previous = row.revision
            result = db.execute(update(StudioRun).where(StudioRun.id == key, StudioRun.revision == previous)
                                .values(data={**row.data, 'attempts': [*attempts, attempt], 'handoff': handoff},
                                        status='COMPLETED' if accepted else 'REVISION_NEEDED', revision=previous + 1))
            if result.rowcount != 1:
                db.rollback()
                raise HTTPException(409, 'Another submission arrived. Reopen the saved record.')
            db.commit(); db.expire_all()
            return public_run(db.get(StudioRun, key))

    from .studio_experiments import experiment_router
    router.include_router(experiment_router(sessions))
    from .studio_projects import project_router
    router.include_router(project_router(sessions))
    return router
