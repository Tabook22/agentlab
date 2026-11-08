import asyncio
import json
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from .db import database, Mission, Task, Agent, Event
from .worker_names import choose_worker_names, clean_worker_name, rename_report
from .limit_approvals import WAITING,FIELDS,effective_options,pending_request,resume_options,hold_for_limit
from .engine import Orchestrator
from .config import load_backend_environment, provider_status
from .provider import OpenAIProvider
from .budget_approvals import budget_state, request_budget, retry_options
from dataclasses import asdict
from .voice import voice_router
from types import SimpleNamespace
from .plan_approval import estimate_plan


class InstructionRequest(BaseModel):
    instruction: str = Field(min_length=5,max_length=1500)


class QuestionAnswerRequest(BaseModel):
    instruction: str = Field(min_length=1,max_length=1500)


class BudgetApprovalRequest(BaseModel):
    request_id: str = Field(min_length=1,max_length=100)
    new_limit_usd: float = Field(ge=.01,le=100,allow_inf_nan=False)
    resume: bool = False


class BudgetDenialRequest(BaseModel):
    request_id: str = Field(min_length=1,max_length=100)


class MissionRequest(BaseModel):
    attachment_ids: list[str] = Field(default_factory=list,max_length=5)
    open_ended: bool = True
    language: Literal['en','ar'] = 'en'
    prompt: str = Field(min_length=5, max_length=2000)
    scenario: Literal['weather', 'data', 'concepts', 'failure'] = 'weather'
    mode: Literal['simulation','live'] = 'simulation'
    max_workers: int = Field(default=8, ge=1, le=8)
    max_iterations: int = Field(default=3, ge=1, le=5)
    budget_usd: float = Field(default=0.10, ge=0.01, le=100,allow_inf_nan=False)


class HistoryEditRequest(BaseModel):
    title: str = Field(min_length=1,max_length=200)
    notes: str = Field(default='',max_length=2000)


class PlanApprovalRequest(BaseModel):
    plan_id: str = Field(min_length=1,max_length=100)
    total_budget_usd: float = Field(ge=.01,le=100,allow_inf_nan=False)
    worker_names: dict[str,str] | None = Field(default=None,max_length=8)
    open_ended: bool | None = None


class WorkerNameRequest(BaseModel):
    name: str = Field(min_length=1,max_length=120)


class LimitApprovalRequest(BaseModel):
    request_id: str = Field(min_length=1,max_length=100)
    new_limit: float = Field(gt=0,allow_inf_nan=False)


class PlanDeclineRequest(BaseModel):
    plan_id: str = Field(min_length=1,max_length=100)


def serialize(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def create_app(url=None, delay=None, provider=None):
    load_backend_environment()
    engine, sessions = database(url)
    runner = Orchestrator(sessions, delay, provider or OpenAIProvider())

    @asynccontextmanager
    async def lifespan(app):
        # Interrupted runs are never silently restarted or charged again.
        with sessions() as db:
            for mission in db.scalars(select(Mission).where(Mission.status.in_(['CREATED', 'RUNNING', 'PAUSED']))):
                mission.status = 'FAILED'
                runner.emit(db, mission.id, 'mission.failed', {'summary': 'Server restarted. Start a new simulation to try again.'})
            legacy=[(m.id,(m.output or {}).get('error','Limit reached.'),(m.output or {}).get('limit_info',{})) for m in db.scalars(select(Mission).where(Mission.status=='FAILED',Mission.mode=='live')) if (m.output or {}).get('stop_reason')=='limit_reached']
        for key,reason,info in legacy:
            kind=info.get('kind') or ('cycles' if 'cycle' in reason.lower() else 'commander' if 'commander' in reason.lower() else 'time' if 'time limit' in reason.lower() else 'calls')
            hold_for_limit(runner,key,reason,None,kind,info.get('required_total_usd'))
        yield
        await runner.close()
        engine.dispose()

    app = FastAPI(title='AI Agent Lab', lifespan=lifespan)
    app.state.sessions = sessions
    app.state.runner = runner
    app.include_router(voice_router(transport=runner.provider.transport))

    def history_metadata(db,key):
        event=db.scalar(select(Event).where(Event.mission_id==key,Event.type=='mission.history_updated').order_by(Event.sequence.desc()).limit(1))
        return event.payload['history'] if event else {'title':'','notes':'','deleted':False}

    def require(db, key, include_deleted=False):
        mission = db.get(Mission, key)
        if not mission:
            raise HTTPException(404, 'Mission not found')
        if not include_deleted and history_metadata(db,key)['deleted']:
            raise HTTPException(404,'Mission is in Trash. Restore it from Mission History first.')
        return mission

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'mode': 'simulation_and_live', 'access': 'local-single-user'}

    @app.get('/api/settings/provider')
    def provider_configuration():
        # Presence only: no key, suffix, hash or environment dump is exposed.
        return {**provider_status(),'limits':asdict(runner.provider.limits),'connection_tested':getattr(runner.provider,'connected',False)}

    @app.post('/api/missions', status_code=201)
    async def create(body: MissionRequest, request: Request):
        if body.attachment_ids and body.mode!='live':raise HTTPException(422,'Attachments require Live AI; simulation cannot analyze your files.')
        if body.mode=='live':
            if not body.open_ended and body.budget_usd>runner.provider.limits.max_budget_usd:
                raise HTTPException(422,'The selected allowance exceeds the server admin ceiling.')
            if request.client and request.client.host not in ('127.0.0.1','::1','testclient'):
                raise HTTPException(403,'Live AI is available only from loopback until classroom authentication is implemented.')
            if not provider_status()['key_present']:
                raise HTTPException(400,'Configure OPENAI_API_KEY in backend/.env and restart the backend first.')
            if runner.live_jobs:
                raise HTTPException(429,'One live mission is already active. Finish or cancel it first.')
        if len(runner.jobs) >= 4:
            raise HTTPException(429, 'Four missions are already active. Wait or cancel one.')
        with sessions() as db:
            from .attachments import selected_attachments,public_attachment
            sources=selected_attachments(db,body.attachment_ids)
            mission = Mission(prompt=body.prompt.strip(), scenario='live' if body.mode=='live' else body.scenario,mode=body.mode)
            if len(mission.prompt) < 5:
                raise HTTPException(422, 'Please describe your mission.')
            db.add(mission)
            db.flush()
            runner.emit(db, mission.id, 'mission.created', {'summary': 'Live AI mission received.' if body.mode=='live' else 'Simulation mission received.',
                'prompt': mission.prompt, 'scenario': mission.scenario,'mode':body.mode,'language':body.language,
                'attachment_ids':body.attachment_ids,'attachments':[public_attachment(row,False) for row in sources],
                'limits':{'max_workers':body.max_workers,'max_iterations':body.max_iterations,'budget_usd':body.budget_usd,'open_ended':body.open_ended} if body.mode=='live' else {}})
            result = serialize(mission)
            if sources:runner.emit(db,mission.id,'mission.attachments_received',{'summary':f'{len(sources)} source files prepared for the commander. Your comments define the task; file contents are supporting evidence.','attachments':[public_attachment(row,False) for row in sources]})
        runner.start(mission.id,body.mode,{'max_workers':body.max_workers,'max_iterations':body.max_iterations,'budget_usd':body.budget_usd,'language':body.language,'open_ended':body.open_ended})
        return result

    @app.get('/api/missions')
    def history(trashed: bool=False):
        with sessions() as db:
            metadata={}
            for event in db.scalars(select(Event).where(Event.type=='mission.history_updated').order_by(Event.sequence)):
                metadata[event.mission_id]=event.payload['history']
            result=[]
            for mission in db.scalars(select(Mission).order_by(Mission.created_at.desc(),Mission.id)):
                info=metadata.get(mission.id,{'title':'','notes':'','deleted':False})
                if info['deleted']==trashed:result.append({**serialize(mission),'history':info})
            return result

    def change_history(db,key,changes,summary,include_deleted=False):
        mission=require(db,key,include_deleted)
        if mission.status not in ('COMPLETED','FAILED','CANCELLED') or key in runner.jobs:
            raise HTTPException(409,'Finish or cancel this mission before editing or deleting its history.')
        info={**history_metadata(db,key),**changes}
        runner.emit(db,key,'mission.history_updated',{'summary':summary,'history':info,'source':'local_admin'})
        return {**serialize(mission),'history':info}

    @app.patch('/api/missions/{key}')
    def edit_history(key: str,body: HistoryEditRequest,request: Request):
        require_local(request)
        title=body.title.strip()
        if not title:raise HTTPException(422,'Enter a mission title.')
        with sessions() as db:
            return change_history(db,key,{'title':title,'notes':body.notes.strip()},'Mission title and notes updated. Original execution preserved.')

    @app.delete('/api/missions/{key}')
    def delete_history(key: str,request: Request):
        require_local(request)
        with sessions() as db:
            return change_history(db,key,{'deleted':True},'Mission moved to Trash. Recorded work is retained for restoration.')

    @app.post('/api/missions/{key}/restore')
    def restore_history(key: str,request: Request):
        require_local(request)
        with sessions() as db:
            return change_history(db,key,{'deleted':False},'Mission restored from Trash.',include_deleted=True)

    @app.get('/api/missions/{key}')
    def detail(key: str):
        with sessions() as db:
            return {**serialize(require(db, key)), 'agents': [serialize(a) for a in db.scalars(select(Agent).where(Agent.mission_id == key))], 'tasks': [serialize(t) for t in db.scalars(select(Task).where(Task.mission_id == key))]}

    @app.get('/api/missions/{key}/events')
    def events(key: str, after: int = 0):
        with sessions() as db:
            require(db, key)
            return [serialize(e) for e in db.scalars(select(Event).where(Event.mission_id == key, Event.sequence > after).order_by(Event.sequence))]

    @app.post('/api/missions/{key}/plan/approve')
    async def approve_plan(key: str,body: PlanApprovalRequest,request: Request):
        require_local(request)
        if runner.live_jobs or len(runner.jobs)>=4:raise HTTPException(409,'Finish or cancel active work before approving this plan.')
        with sessions() as db:
            mission=require(db,key)
            pending=db.scalar(select(Event).where(Event.mission_id==key,Event.type=='mission.plan_approval_requested').order_by(Event.sequence.desc()).limit(1))
            if mission.status!='AWAITING_APPROVAL' or not pending or pending.id!=body.plan_id:
                raise HTTPException(409,'This plan is not awaiting approval. Refresh the mission report.')
            current=pending.payload['estimate']['current_total_limit_usd']
            open_ended=body.open_ended if body.open_ended is not None else pending.payload['options'].get('open_ended',False)
            if not open_ended and (body.total_budget_usd<current or body.total_budget_usd>runner.provider.limits.max_budget_usd):
                raise HTTPException(422,'Choose a total allowance at least as high as the planning allowance and within the server ceiling.')
            names=choose_worker_names(pending.payload['agent_ids'],
                [task['name'] for task in pending.payload['worker_plan']['tasks']],body.worker_names)
            if body.worker_names is not None:
                report=rename_report(pending.payload['report'],names)
                runner.emit(db,key,'mission.plan_ready',{'summary':'Your chosen worker names are saved in the approved team plan.',
                    'task_ids':pending.payload['task_ids'],'plan':report,'mode':'live','names_updated':True})
            options={**pending.payload['options'],'budget_usd':body.total_budget_usd,'carry_usage':True,'plan_approval_id':pending.id,'open_ended':open_ended}
            mission.status='RUNNING'
            runner.emit(db,key,'mission.plan_approved',{'summary':'Admin approved this team, workflow and total allowance. Workers may now be created.',
                'plan_id':pending.id,'total_budget_usd':None if open_ended else body.total_budget_usd,'worker_names':names,'open_ended':open_ended,'source':'local_admin','status':'RUNNING'})
            if open_ended:
                runner.emit(db,key,'mission.execution_opened',{'summary':'Open-ended execution authorized. Cost estimates remain visible; app resource caps are disabled.',
                    'open_ended':True,'source':'local_admin','usage':(mission.output or {}).get('usage',{})})
            # Keep the existing budget ledger as the single source of truth.
            if not open_ended and body.total_budget_usd>current:
                runner.emit(db,key,'mission.budget_approved',{'summary':'Admin approved the total allowance in the mission plan report.',
                    'request_id':pending.id,'old_limit_usd':current,'new_limit_usd':body.total_budget_usd,'source':'local_admin','resume_authorized':True})
            result=serialize(mission)
        runner.start(key,'live',options)
        return {'mission':result,'resumed':True}

    @app.patch('/api/missions/{key}/agents/{agent_id}/name')
    async def rename_worker(key: str,agent_id: str,body: WorkerNameRequest,request: Request):
        require_local(request)
        with sessions() as db:
            require(db,key)
            agent=db.get(Agent,agent_id)
            if not agent or agent.mission_id!=key:
                raise HTTPException(404,'Worker not found in this mission.')
            name=clean_worker_name(body.name)
            others=list(db.scalars(select(Agent).where(Agent.mission_id==key,Agent.id!=agent_id)))
            if any(clean_worker_name(other.config['name']).casefold()==name.casefold() for other in others):
                raise HTTPException(422,'Give each worker a different name.')
            old_name=agent.config['name']
            agent.config={**agent.config,'name':name}
            event=runner.emit(db,key,'agent.renamed',{'summary':'Worker display name updated by you.',
                'name':name,'previous_name':old_name,'source':'local_admin'},agent_id)
            return {'agent_id':agent_id,'name':name,'event':serialize(event)}

    @app.post('/api/missions/{key}/plan/decline')
    async def decline_plan(key: str,body: PlanDeclineRequest,request: Request):
        require_local(request)
        with sessions() as db:
            mission=require(db,key)
            pending=db.scalar(select(Event).where(Event.mission_id==key,Event.type=='mission.plan_approval_requested').order_by(Event.sequence.desc()).limit(1))
            if mission.status!='AWAITING_APPROVAL' or not pending or pending.id!=body.plan_id:
                raise HTTPException(409,'This plan is not awaiting approval. Refresh the mission report.')
            mission.status='CANCELLED'
            runner.emit(db,key,'mission.plan_declined',{'summary':'Admin declined the proposed plan. No workers were created or started.','plan_id':pending.id})
            runner.emit(db,key,'mission.cancelled',{'summary':'Plan declined. Planning usage is retained; execution was not authorized.','status':'CANCELLED'})
            return {'mission':serialize(mission),'resumed':False}

    @app.get('/api/missions/{key}/stream')
    async def stream(key: str, request: Request, after: int = 0):
        with sessions() as db:
            require(db, key)
        try:
            cursor = max(after, int(request.headers.get('last-event-id', '0')))
        except ValueError:
            raise HTTPException(400, 'Invalid Last-Event-ID')

        async def generate():
            nonlocal cursor
            while not await request.is_disconnected():
                with sessions() as db:
                    batch = list(db.scalars(select(Event).where(Event.mission_id == key, Event.sequence > cursor).order_by(Event.sequence)))
                    terminal = require(db, key).status in ('COMPLETED', 'CANCELLED', 'FAILED',WAITING,'AWAITING_CLARIFICATION')
                    for event in batch:
                        cursor = event.sequence
                        yield f'id: {cursor}\ndata: {json.dumps(serialize(event))}\n\n'
                if terminal:
                    return
                yield ': heartbeat\n\n'
                await asyncio.sleep(0.25)
        return StreamingResponse(generate(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

    @app.post('/api/missions/{key}/agents/{agent_id}/guidance',status_code=201)
    async def guidance(key: str,agent_id: str,body: InstructionRequest,request: Request):
        if request.client and request.client.host not in ('127.0.0.1','::1','testclient'):
            raise HTTPException(403,'Commander guidance is available only from loopback.')
        with sessions() as db:
            mission=require(db,key);agent=db.get(Agent,agent_id)
            if not agent or agent.mission_id!=key:
                raise HTTPException(404,'Worker not found in this mission.')
            if mission.mode!='live' or mission.status not in ('RUNNING','PAUSED') or agent.state not in ('READY','ASSIGNED','RUNNING'):
                raise HTTPException(409,'Guide a waiting or active worker in a live mission. Completed and stopped work is read-only.')
            text=body.instruction.strip()
            if len(text)<5:
                raise HTTPException(422,'Please give a clear instruction.')
        from .loop_control import guide
        identifier=guide(runner,key,agent_id,text,source='admin',reason='Admin guidance sent through the commander; applied at the next worker cycle.')
        return {'id':identifier,'status':'pending','summary':'Guidance recorded; the worker will acknowledge it when read.'}

    @app.post('/api/missions/{key}/questions/{question_id}/answer',status_code=201)
    async def answer_question(key: str,question_id: str,body: QuestionAnswerRequest,request: Request):
        if request.client and request.client.host not in ('127.0.0.1','::1','testclient'):
            raise HTTPException(403,'Answering worker questions is available only from loopback.')
        text=body.instruction.strip()
        if not text:raise HTTPException(422,'Write an answer first.')
        with sessions() as db:
            mission=require(db,key)
            question=db.get(Event,question_id)
            if not question or question.mission_id!=key or question.type!='agent.message_sent' or question.payload.get('message_type')!='HELP_REQUEST':
                raise HTTPException(404,'Worker question not found in this mission.')
            # Each request is idempotent, including answers older than the latest answer.
            answers=list(db.scalars(select(Event).where(Event.mission_id==key,Event.type=='workspace.question_answered')))
            prior=next((e for e in answers if e.payload.get('question_id')==question_id),None)
            if prior:return serialize(prior)
            agent=db.get(Agent,question.agent_id)
            task=db.get(Task,question.task_id) if question.task_id else None
            if mission.mode!='live' or mission.status!='FAILED' or key in runner.jobs or not agent or agent.mission_id!=key or (task and task.status=='COMPLETED'):
                raise HTTPException(409,'Answer a stopped worker question in a failed live mission. Completed work is read-only.')
            # Persist guidance and its answer marker together, without starting a provider call.
            instruction=Event(mission_id=key,sequence=(db.scalar(select(func.max(Event.sequence)).where(Event.mission_id==key)) or 0)+1,
                type='commander.instruction',agent_id=agent.id,task_id=question.task_id,
                payload={'summary':text,'instruction':text,'source':'admin','reason':'Human answer to the worker question: '+question.payload.get('summary',''),'question_id':question_id})
            db.add(instruction);db.flush()
            event=runner.emit(db,key,'workspace.question_answered',{'summary':text,'question_id':question_id,'guidance_id':instruction.id,
                'sender':'you','receiver':agent.id,'status':'saved','instruction':text},agent.id,question.task_id)
            return serialize(event)

    def require_local(request):
        if request.client and request.client.host not in ('127.0.0.1','::1','testclient'):
            raise HTTPException(403,'Budget administration is available only from loopback.')

    @app.post('/api/missions/{key}/execution/open')
    async def open_execution(key: str,request: Request):
        require_local(request)
        if runner.live_jobs or len(runner.jobs)>=4:raise HTTPException(409,'Finish or cancel active work before continuing this mission.')
        if not provider_status()['key_present']:raise HTTPException(400,'Configure the saved backend key before continuing.')
        with sessions() as db:
            mission=require(db,key)
            if mission.mode!='live' or mission.status not in ('FAILED',WAITING,'PAUSED'):
                raise HTTPException(409,'This mission is not waiting to continue. Refresh its current status.')
            if key in runner.jobs:raise HTTPException(409,'Wait for the current worker to pause before changing execution policy.')
            options=resume_options(db,mission,runner.provider.limits);options['open_ended']=True
            unfinished=[t.agent_id for t in db.scalars(select(Task).where(Task.mission_id==key,Task.status!='COMPLETED'))]
            specs=[]
            for agent_id in unfinished:
                agent=db.get(Agent,agent_id)
                specs.append(SimpleNamespace(tools=agent.config['tools']))
                agent.config={**agent.config,'resource_limits':{'max_cycles':None,'execution':'open_ended'}}
            estimate=estimate_plan(SimpleNamespace(tasks=specs),runner.provider,(mission.output or {}).get('usage',{'estimated_cost_usd':0}),1,0)
            continuation_estimate={name:estimate[name] for name in ('estimated_total_low_usd','estimated_total_high_usd','expected_additional_calls')}
            mission.output={**(mission.output or {}),'open_ended':True,'usage':{**(mission.output or {}).get('usage',{}),'open_ended':True,'budget_usd':None}}
            mission.status='RUNNING'
            runner.emit(db,key,'mission.execution_opened',{'summary':'Continue until the master approves the final answer. App spending, call, token, cycle and total-time caps are disabled.',
                'open_ended':True,'source':'local_admin','usage':mission.output['usage'],'estimate':continuation_estimate})
            runner.emit(db,key,'mission.retry_requested',{'summary':'Continuing saved work in open-ended mode. Pause and cancel remain available.','status':'RUNNING'})
            result=serialize(mission)
        from .loop_control import guide
        for agent_id in unfinished:
            guide(runner,key,agent_id,'Continue the assigned work using your available tools and previous review feedback. App resource limits are disabled. Use web_research directly when assigned; permission for an already assigned tool is not a missing input. Ask for help only for genuinely unavailable essential information.',source='admin',reason='Admin authorized open-ended continuation of this saved mission.')
        runner.start(key,'live',options)
        return {'mission':result,'resumed':True}

    @app.get('/api/missions/{key}/limits')
    def inspect_limits(key: str,request: Request):
        require_local(request)
        with sessions() as db:
            mission=require(db,key)
            options,events=effective_options(db,key,runner.provider.limits)
            pending=pending_request(events)
            proposal={'id':pending.id,**pending.payload} if pending else None
            if options.get('open_ended'):proposal=None
            if proposal and proposal['kind']=='spending':
                proposal['ceiling']=runner.provider.limits.max_budget_usd
                proposal['recommended_limit']=min(proposal['ceiling'],max(proposal['current_limit']*2,round(proposal['minimum_required']*1.2+.01,2)))
            return {'mission_status':mission.status,'open_ended':options.get('open_ended',False),'current_limits':options,'usage':(mission.output or {}).get('usage',{}),
                    'pending':proposal}

    @app.post('/api/missions/{key}/limits/request')
    def propose_limit(key: str,request: Request):
        require_local(request)
        with sessions() as db:
            mission=require(db,key)
            if mission.mode!='live' or mission.status not in ('FAILED',WAITING) or (mission.output or {}).get('stop_reason')!='limit_reached':
                raise HTTPException(409,'Only a mission held at a limit can request another allowance.')
            reason=(mission.output or {}).get('pause_reason') or (mission.output or {}).get('error','Limit reached.')
            info=(mission.output or {}).get('limit_info',{})
            kind=info.get('kind') or ('cycles' if 'cycle' in reason.lower() else 'commander' if 'commander' in reason.lower() else 'time' if 'time limit' in reason.lower() else 'calls')
        hold_for_limit(runner,key,reason,None,kind,info.get('required_total_usd'))
        return {'resumed':False}

    @app.post('/api/missions/{key}/limits/approve')
    async def approve_limit(key: str,body: LimitApprovalRequest,request: Request):
        require_local(request)
        if runner.live_jobs or len(runner.jobs)>=4:raise HTTPException(409,'Finish or pause other active work before continuing this mission.')
        if not provider_status()['key_present']:raise HTTPException(400,'Configure the backend key before continuing.')
        with sessions() as db:
            mission=require(db,key)
            options,events=effective_options(db,key,runner.provider.limits)
            pending=pending_request(events)
            if mission.status!=WAITING or not pending or pending.id!=body.request_id:
                raise HTTPException(409,'This limit approval is no longer pending. Refresh the mission.')
            p=pending.payload;kind=p['kind'];value=body.new_limit
            field='budget_usd' if kind=='spending' else FIELDS[kind]
            ceiling=runner.provider.limits.max_budget_usd if kind=='spending' else p['ceiling']
            if value<=options[field] or value<p['minimum_required'] or value>ceiling or (kind!='spending' and not value.is_integer()):
                raise HTTPException(422,'Choose a higher allowance that covers the recommendation minimum and stays within the admin ceiling.')
            value=value if kind=='spending' else int(value)
            if kind=='spending':
                _,requests,_=budget_state(db,key,runner.provider.limits)
                old_request=next((r for r in requests if r['status']=='pending'),None)
                runner.emit(db,key,'mission.budget_approved',{'summary':'Admin approved more spending for the paused mission. Prior usage is retained.',
                    'request_id':old_request['id'] if old_request else pending.id,'old_limit_usd':options[field],
                    'new_limit_usd':value,'source':'local_admin','resume_authorized':True})
            runner.emit(db,key,'mission.limit_approved',{'summary':'Admin approved the increased allowance. Continue the same mission from saved work.',
                'request_id':pending.id,'kind':kind,'old_limit':options[field],'new_limit':value,'approved_limits':{field:value},'source':'local_admin'})
            options=resume_options(db,mission,runner.provider.limits)
            if kind=='cycles':
                for agent in db.scalars(select(Agent).where(Agent.mission_id==key)):
                    agent.config={**agent.config,'resource_limits':{'max_cycles':value}}
                runner.emit(db,key,'mission.limits_extended',{'summary':'Admin approved more worker cycles. Saved drafts and cumulative usage are retained.','max_iterations':value})
            mission.status='RUNNING'
            runner.emit(db,key,'mission.retry_requested',{'summary':'Mission continuing after admin limit approval. Accepted outputs are kept.','status':'RUNNING'})
            result=serialize(mission)
        runner.start(key,'live',options)
        return {'mission':result,'resumed':True}

    @app.post('/api/missions/{key}/limits/decline')
    def decline_limit(key: str,body: BudgetDenialRequest,request: Request):
        require_local(request)
        with sessions() as db:
            mission=require(db,key);_,events=effective_options(db,key,runner.provider.limits);pending=pending_request(events)
            if mission.status!=WAITING or not pending or pending.id!=body.request_id:raise HTTPException(409,'This request is no longer pending.')
            runner.emit(db,key,'mission.limit_declined',{'summary':'Increase deferred by admin. Mission stays paused; saved work is retained.','request_id':pending.id})
        return {'resumed':False}

    @app.get('/api/missions/{key}/budget')
    def inspect_budget(key: str,request: Request):
        require_local(request)
        with sessions() as db:
            mission=require(db,key)
            if mission.mode!='live':raise HTTPException(409,'Simulation has no paid mission allowance.')
            current,requests,_=budget_state(db,key,runner.provider.limits)
            blockers=[]
            try:retry_options(db,mission,runner.provider.limits,budget_override=runner.provider.limits.max_budget_usd,approved_now=True)
            except ValueError as exc:blockers.append(str(exc))
            return {'current_limit_usd':current,'usage':(mission.output or {}).get('usage',{}),
                'max_allowed_usd':runner.provider.limits.max_budget_usd,'requests':requests,
                'mission_status':mission.status,'resume_blockers':blockers}

    @app.post('/api/missions/{key}/budget/request',status_code=201)
    def propose_budget(key: str,request: Request):
        require_local(request)
        with sessions() as db:
            mission=require(db,key)
            if mission.mode!='live' or mission.status not in ('FAILED',WAITING):raise HTTPException(409,'Request an increase for a paused live mission.')
            reason=(mission.output or {}).get('error','Admin requested a higher mission allowance.')
            minimum=(mission.output or {}).get('limit_info',{}).get('required_total_usd')
        return request_budget(runner,key,reason,minimum)

    @app.post('/api/missions/{key}/budget/approve')
    async def approve_budget(key: str,body: BudgetApprovalRequest,request: Request):
        require_local(request)
        with sessions() as db:
            mission=require(db,key)
            if mission.mode!='live' or mission.status not in ('FAILED',WAITING):raise HTTPException(409,'Approve an increase for a paused live mission.')
            current,requests,_=budget_state(db,key,runner.provider.limits)
            pending=next((r for r in requests if r['id']==body.request_id and r['status']=='pending'),None)
            if not pending:raise HTTPException(409,'This request is no longer pending.')
            if current!=pending['current_limit_usd']:raise HTTPException(409,'The allowance changed. Refresh this request.')
            if body.new_limit_usd<=current or body.new_limit_usd>runner.provider.limits.max_budget_usd or body.new_limit_usd<pending['minimum_required_usd']:
                raise HTTPException(422,'Choose a higher total allowance that covers the estimated next request and stays within the server ceiling.')
            options=None
            if body.resume:
                if runner.live_jobs or len(runner.jobs)>=4:raise HTTPException(429,'Finish or cancel active work before resuming.')
                if not provider_status()['key_present']:raise HTTPException(400,'Configure the backend key before resuming.')
                try:options,_=retry_options(db,mission,runner.provider.limits,budget_override=body.new_limit_usd,approved_now=True)
                except ValueError as exc:raise HTTPException(409,str(exc))
            runner.emit(db,key,'mission.budget_approved',{'summary':f'Admin approved a ${body.new_limit_usd:.2f} total allowance. Prior usage is retained.',
                'request_id':body.request_id,'old_limit_usd':current,'new_limit_usd':body.new_limit_usd,
                'additional_allowance_usd':round(body.new_limit_usd-current,6),'source':'local_admin','resume_authorized':body.resume})
            _,all_events=effective_options(db,key,runner.provider.limits)
            held=pending_request(all_events)
            if held and held.payload['kind']=='spending':
                runner.emit(db,key,'mission.limit_approved',{'summary':'Admin approved the paused mission spending allowance.',
                    'request_id':held.id,'kind':'spending','old_limit':current,'new_limit':body.new_limit_usd,
                    'approved_limits':{'budget_usd':body.new_limit_usd},'source':'local_admin'})
            if body.resume:
                mission.status='RUNNING'
                runner.emit(db,key,'mission.retry_requested',{'summary':'Commander resumes after explicit admin budget approval. Saved work and prior usage are retained.','status':'RUNNING'})
            result=serialize(mission)
        if body.resume:runner.start(key,'live',options)
        return {'mission':result,'resumed':body.resume,'status':'approved'}

    @app.post('/api/missions/{key}/budget/deny')
    def deny_budget(key: str,body: BudgetDenialRequest,request: Request):
        require_local(request)
        with sessions() as db:
            mission=require(db,key)
            _,requests,_=budget_state(db,key,runner.provider.limits)
            if not any(r['id']==body.request_id and r['status']=='pending' for r in requests):raise HTTPException(409,'This request is no longer pending.')
            runner.emit(db,key,'mission.budget_denied',{'summary':'Admin declined the increase. No work was resumed.','request_id':body.request_id,'source':'local_admin'})
            return {'mission':serialize(mission),'status':'denied','resumed':False}

    @app.post('/api/missions/{key}/retry')
    async def retry(key: str,request: Request,extend_cycles: bool=False):
        if request.client and request.client.host not in ('127.0.0.1','::1','testclient'):
            raise HTTPException(403,'Live retry is available only from loopback.')
        if not provider_status()['key_present']:
            raise HTTPException(400,'Configure the backend key first.')
        if runner.live_jobs or len(runner.jobs)>=4:
            raise HTTPException(429,'Finish or cancel active work first.')
        with sessions() as db:
            mission=require(db,key)
            if mission.mode!='live' or mission.status not in ('FAILED',WAITING):
                raise HTTPException(409,'Only failed live missions can retry remaining work.')
            _,limit_events=effective_options(db,key,runner.provider.limits)
            held=pending_request(limit_events)
            if mission.status==WAITING and held and not (extend_cycles and held.payload['kind']=='cycles'):
                raise HTTPException(409,'Approve the pending limit recommendation before continuing this mission.')
            try:options,tasks=retry_options(db,mission,runner.provider.limits,extend_cycles)
            except ValueError as exc:raise HTTPException(409,str(exc))
            if extend_cycles:
                for task in tasks:
                    agent=db.get(Agent,task.agent_id)
                    agent.config={**agent.config,'resource_limits':{'max_cycles':options['max_iterations']}}
                runner.emit(db,key,'mission.limits_extended',{'summary':'Admin extended the worker cycle allowance; prior spending and usage still apply.','max_iterations':options['max_iterations']})
                if held:
                    runner.emit(db,key,'mission.limit_approved',{'summary':'Admin extended the cycle allowance.','request_id':held.id,
                        'kind':'cycles','approved_limits':{'max_iterations':options['max_iterations']}})
            mission.status='RUNNING'
            runner.emit(db,key,'mission.retry_requested',{'summary':'Retry requested for remaining tasks. Accepted outputs, prior usage and cycle limits are retained.','status':'RUNNING'})
            result=serialize(mission)
        runner.start(key,'live',options)
        return result

    @app.post('/api/missions/{key}/{action}')
    async def control(key: str, action: Literal['pause', 'resume', 'cancel']):
        with sessions() as db:
            mission = require(db, key)
            allowed = {'pause': {'RUNNING'}, 'resume': {'PAUSED'}, 'cancel': {'RUNNING', 'PAUSED', 'CREATED','AWAITING_APPROVAL','AWAITING_CLARIFICATION',WAITING}}
            if mission.status not in allowed[action]:
                raise HTTPException(409, f'Cannot {action} a {mission.status.lower()} mission')
            mission.status = {'pause': 'PAUSED', 'resume': 'RUNNING', 'cancel': 'CANCELLED'}[action]
            if action=='cancel' and key not in runner.jobs:
                for task in db.scalars(select(Task).where(Task.mission_id==key,Task.status!='COMPLETED')):task.status='CANCELLED'
                for agent in db.scalars(select(Agent).where(Agent.mission_id==key,Agent.state=='WAITING_LIMIT')):
                    agent.state='CANCELLED'
                    runner.emit(db,key,'agent.cancelled',{'summary':'Admin cancelled the paused mission.','state':'CANCELLED'},agent.id)
            runner.emit(db, key, f'mission.{action}', {'summary': f'Mission {action} requested.', 'status': mission.status})
            result = serialize(mission)
        if action == 'cancel' and (job := runner.jobs.get(key)):
            job.cancel()
            await asyncio.gather(job, return_exceptions=True)
        return result
    from .mission_clarification import clarification_router
    app.include_router(clarification_router(runner,require,require_local,serialize))
    from .master_chat import master_chat_router
    app.include_router(master_chat_router(runner,require,require_local))
    from .answer_export import answer_export_router
    app.include_router(answer_export_router(runner,require,require_local))
    from .attachments import attachments_router
    app.include_router(attachments_router(runner,require_local))
    return app


app = create_app()
