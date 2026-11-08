"""Durable mission holds. Recommendations are local calculations, never paid calls."""
import math
from dataclasses import replace
from sqlalchemy import select
from .db import Mission,Task,Agent,Event
from .budget_approvals import budget_state

WAITING='AWAITING_LIMIT_APPROVAL'
# Explicit local-admin grants stay bounded; reaching a ceiling keeps the mission held.
CEILINGS={'cycles':100,'calls':1000,'tokens':10000000,'commander':1000,'time':3600}
FIELDS={'cycles':'max_iterations','calls':'max_calls','tokens':'token_budget','commander':'master_steps','time':'mission_timeout'}


def effective_options(db,key,base):
    current,_,events=budget_state(db,key,base)
    created=next(e for e in events if e.type=='mission.created')
    options={**created.payload.get('limits',{}),'budget_usd':current,'language':created.payload.get('language','en'),
             'max_calls':base.max_calls,'token_budget':base.token_budget,'master_steps':base.master_steps,'mission_timeout':base.mission_timeout}
    for event in events:
        if event.type=='mission.limits_extended':options['max_iterations']=event.payload['max_iterations']
        if event.type=='mission.limit_approved':options.update(event.payload['approved_limits'])
        if event.type=='mission.execution_opened':options['open_ended']=True
    return options,events


def execution_limits(base,options):
    return replace(base,**{field:options[field] for field in FIELDS.values() if field in options})


def pending_request(events):
    settled={e.payload['request_id'] for e in events if e.type in ('mission.limit_approved','mission.limit_declined')}
    return next((e for e in reversed(events) if e.type=='master.limit_approval_requested' and e.id not in settled),None)


def hold_for_limit(runner,key,reason,budget,kind,required=None):
    with runner.sessions() as db:
        options,events=effective_options(db,key,runner.provider.limits)
        pending=pending_request(events)
        if kind=='spending':
            current=options['budget_usd'];ceiling=runner.provider.limits.max_budget_usd
            required=required or current+.01
            recommended=min(ceiling,max(round(current*2,2),math.ceil(required*115)/100))
        else:
            current=options.get(FIELDS[kind],runner.provider.limits.max_iterations)
            ceiling=CEILINGS[kind];required=required or current+1
            step=2 if kind=='cycles' else 8 if kind=='commander' else 24 if kind=='calls' else 120000 if kind=='tokens' else 240
            recommended=min(ceiling,math.ceil(max(current+step,required*1.15)))
        if not pending:
            pending=runner.emit(db,key,'master.limit_approval_requested',{
                'summary':'Critical: limit reached. Mission paused until admin approval.',
                'kind':kind,'reason':reason,'current_limit':current,'recommended_limit':recommended,
                'minimum_required':required,'ceiling':ceiling,'source':'commander',
                'recommendation_basis':'Saved progress, the blocked operation and a bounded extra allowance; no additional model request.',
                'requires_admin_approval':True})
        mission=db.get(Mission,key);mission.status=WAITING
        usage=budget.snapshot() if budget else (mission.output or {}).get('usage',{})
        mission.output={**(mission.output or {}),'mode':'live','usage':usage,'pause_reason':reason,
                        'stop_reason':'limit_reached','limit_info':{'kind':kind,'approval_id':pending.id,'required_total_usd':required if kind=='spending' else None}}
        for task in db.scalars(select(Task).where(Task.mission_id==key,Task.status!='COMPLETED')):
            task.status='WAITING_LIMIT'
        for agent in db.scalars(select(Agent).where(Agent.mission_id==key)):
            if agent.state not in ('COMPLETED','STANDBY','TERMINATED'):
                agent.state='WAITING_LIMIT'
                runner.emit(db,key,'agent.waiting_limit',{'summary':'Work preserved. Waiting for admin limit approval.','state':'WAITING_LIMIT'},agent.id)
        runner.emit(db,key,'mission.limit_approval_requested',{'summary':pending.payload['summary'],
            'reason':reason,'status':WAITING,'request_id':pending.id,'kind':kind,'usage':usage})


def resume_options(db,mission,base):
    options,events=effective_options(db,mission.id,base)
    tasks=list(db.scalars(select(Task).where(Task.mission_id==mission.id)))
    options.update(carry_usage=True,resume=bool(tasks),budget_resume=True)
    if not tasks:
        proposal=next((e for e in reversed(events) if e.type=='mission.plan_approval_requested'),None)
        consent=next((e for e in reversed(events) if e.type=='mission.plan_approved'),None)
        if proposal and consent and consent.payload['plan_id']==proposal.id:options['plan_approval_id']=proposal.id
    return options
