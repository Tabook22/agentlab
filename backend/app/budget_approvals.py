"""Event-backed admin approval; no spending increase is self-approved."""
import math
from sqlalchemy import select
from .db import Event, Task


def budget_state(db,key,limits):
    events=list(db.scalars(select(Event).where(Event.mission_id==key).order_by(Event.sequence)))
    created=next(e for e in events if e.type=='mission.created')
    current=created.payload.get('limits',{}).get('budget_usd',limits.budget_usd)
    requests={}
    for e in events:
        if e.type=='master.budget_approval_requested':
            requests[e.id]={'id':e.id,**e.payload,'status':'pending'}
        elif e.type in ('mission.budget_approved','mission.budget_denied'):
            if e.payload['request_id'] in requests:
                requests[e.payload['request_id']]['status']='approved' if e.type=='mission.budget_approved' else 'denied'
            if e.type=='mission.budget_approved':current=e.payload['new_limit_usd']
    return current,list(requests.values()),events


def request_budget(runner,key,reason,required_total=None):
    with runner.sessions() as db:
        current,requests,_=budget_state(db,key,runner.provider.limits)
        pending=next((r for r in requests if r['status']=='pending'),None)
        if pending:return pending
        required=required_total or current+.01
        proposed=min(runner.provider.limits.max_budget_usd,max(round(current*2,2),math.ceil(required*115)/100))
        event=runner.emit(db,key,'master.budget_approval_requested',{
            'summary':f'Commander requests a total allowance of ${proposed:.2f}; waiting for admin approval.',
            'current_limit_usd':current,'requested_limit_usd':proposed,'minimum_required_usd':round(required,6),
            'estimate_available':required_total is not None,'reason':reason,'source':'commander','requires_admin_approval':True})
        return {'id':event.id,**event.payload,'status':'pending'}


def retry_options(db,mission,limits,extend_cycles=False,budget_override=None,approved_now=False):
    from .limit_approvals import effective_options
    current,_,events=budget_state(db,mission.id,limits)
    created=next(e for e in events if e.type=='mission.created')
    effective,_=effective_options(db,mission.id,limits)
    options={**effective,'budget_usd':budget_override or current,'carry_usage':True,'language':created.payload.get('language','en')}
    extension=next((e for e in reversed(events) if e.type=='mission.limits_extended'),None)
    if extension:options['max_iterations']=extension.payload['max_iterations']
    if extend_cycles:
        if options['max_iterations']>=limits.max_iterations:raise ValueError('The worker cycle ceiling has already been reached.')
        options['max_iterations']=min(options['max_iterations']+2,limits.max_iterations)
    failed=next((e for e in reversed(events) if e.type in ('mission.failed','mission.limit_approval_requested')),None)
    approved=next((e for e in reversed(events) if e.type=='mission.budget_approved'),None)
    spending=failed and (failed.payload.get('kind')=='spending' or failed.payload.get('limit_info',{}).get('kind')=='spending' or 'spending guard' in failed.payload.get('summary','').lower())
    options['budget_resume']=bool(spending and (approved_now or approved and approved.sequence>failed.sequence))
    tasks=list(db.scalars(select(Task).where(Task.mission_id==mission.id)))
    plan=next((e for e in reversed(events) if e.type=='mission.plan_ready'),None)
    options['resume']=bool(plan and tasks)
    if tasks and (not plan or len(tasks)!=len(plan.payload['plan']['assignments'])):
        raise ValueError('The saved team is incomplete. Start a new mission.')
    for task in tasks:
        if task.status=='COMPLETED':continue
        observed=[e for e in events if e.agent_id==task.agent_id and e.type=='agent.observe']
        used=max((e.payload.get('cycle',0) for e in observed),default=0)
        checked=any(e.agent_id==task.agent_id and e.type=='agent.test' and e.payload.get('cycle')==used for e in events)
        if used>=options['max_iterations'] and not (options['budget_resume'] and not checked):
            raise ValueError('A worker exhausted its cycle limit. Extend cycles separately or narrow the mission.')
    usage=(mission.output or {}).get('usage',{})
    if usage.get('estimated_cost_usd',0)>=options['budget_usd']:raise ValueError('The approved total is already consumed.')
    if usage.get('reported_tokens',0)>=options['token_budget'] or usage.get('calls',0)>=options['max_calls']:
        raise ValueError('The call/token limit is also exhausted. A budget increase does not reset it.')
    return options,tasks
