"""Deterministic educational simulation. No LLM decisions or real weather claims."""
import asyncio
import os
from sqlalchemy import select, func
from .db import Mission, Task, Agent, Event, now, uid
from .schemas import AgentConfiguration, PlanItem, TaskPlan
from .tools import tool_steps
from .planning import explain_plan
from .explanations import explain_action, worker_reason
from .provider import LimitReached
from .loop_control import guide, guidance_for

TRANSITIONS = {
    'WAITING_LIMIT': {'READY','ASSIGNED','CANCELLED'},
    'CREATED': {'READY', 'CANCELLED'}, 'READY': {'ASSIGNED', 'CANCELLED'},
    'ASSIGNED': {'RUNNING', 'CANCELLED'}, 'RUNNING': {'COMPLETED', 'FAILED', 'CANCELLED'},
    'FAILED': {'ASSIGNED', 'CANCELLED'}, 'COMPLETED': {'STANDBY'},
    'STANDBY': {'TERMINATED'}, 'CANCELLED': {'TERMINATED'}, 'TERMINATED': set(),
}


def transition(agent, state):
    if state not in TRANSITIONS.get(agent.state, set()):
        raise ValueError(f'Invalid transition {agent.state} → {state}')
    agent.state = state


class Orchestrator:
    def __init__(self, sessions, delay=None, provider=None):
        self.sessions = sessions
        self.delay = float(os.getenv('LAB_EVENT_DELAY', '0.7')) if delay is None else delay
        self.jobs = {}
        self.provider = provider
        self.live_jobs = set()

    def emit(self, db, mission_id, kind, payload, agent_id=None, task_id=None):
        seq = db.scalar(select(func.max(Event.sequence)).where(Event.mission_id == mission_id)) or 0
        event = Event(mission_id=mission_id, sequence=seq + 1, type=kind,
                      payload=payload, agent_id=agent_id, task_id=task_id)
        db.add(event)
        db.commit()  # Every visible action is durable before the stream reads it.
        return event

    def start(self, mission_id, mode='simulation', options=None):
        if mode=='live':
            from .live import run_live
            self.live_jobs.add(mission_id)
            self.jobs[mission_id]=asyncio.create_task(run_live(self,mission_id,options or {}))
        else:
            self.jobs[mission_id] = asyncio.create_task(self.run(mission_id))
        def release(_):
            self.live_jobs.discard(mission_id)
            self.jobs.pop(mission_id,None)
        self.jobs[mission_id].add_done_callback(release)

    async def checkpoint(self, mission_id):
        await asyncio.sleep(self.delay)
        while True:
            with self.sessions() as db:
                status = db.get(Mission, mission_id).status
            if status == 'CANCELLED':
                raise asyncio.CancelledError()
            if status != 'PAUSED':
                return
            await asyncio.sleep(0.1)

    def plan(self, scenario):
        if scenario in ('weather', 'failure'):
            return [('Cloudy', 'Weather data', 'Read the synthetic weather fixture', []),
                    ('Prism', 'Visualization', 'Organize a six-day dashboard', [0]),
                    ('Scout', 'Verification', 'Check all six observations', [1])]
        if scenario == 'data':
            return [('Pixel', 'Data preparation', 'Load synthetic student scores', []),
                    ('Nova', 'Analysis', 'Calculate the mean score', [0]),
                    ('Scout', 'Verification', 'Verify the calculation', [1])]
        return [('Atlas', 'Lesson preparation', 'Read the curated agent lesson', []),
                ('Sage', 'Explanation', 'Prepare a beginner explanation', [0])]

    def create_agent(self, mission_id, item, agent_id=None):
        config = AgentConfiguration(name=item.name, role=item.role, instructions=item.title,
                                    tools=['educational_fixture'], created_at=now())
        return Agent(id=agent_id or uid(), mission_id=mission_id, config=config.model_dump())

    async def worker(self, mission_id, task_id, fail=False):
        await self.checkpoint(mission_id)
        with self.sessions() as db:
            task = db.get(Task, task_id)
            agent = db.get(Agent, task.agent_id)
            deps = [db.get(Task, key) for key in task.dependencies]
            cycle=1+len(list(db.scalars(select(Event).where(Event.mission_id==mission_id,Event.agent_id==agent.id,Event.type=='agent.observe'))))
            if cycle>2:
                raise LimitReached('Simulation worker step limit reached.')
            for dep in deps:
                sender = db.get(Agent, dep.agent_id)
                self.emit(db, mission_id, 'agent.message_sent', {
                    'message_id': uid(), 'sender': dep.agent_id, 'receiver': agent.id,
                    'message_type': 'INFORMATION_RESPONSE', 'delivery_status': 'DELIVERED',
                    'summary': f'{sender.config["name"]} → {agent.config["name"]}: here is my completed result.', 'data': dep.output,
                }, agent.id, task.id)
            transition(agent, 'ASSIGNED')
            task.status = 'ASSIGNED'
            self.emit(db, mission_id, 'task.assigned', {'summary': task.title, 'state': agent.state}, agent.id, task.id)
            transition(agent, 'RUNNING')
            task.status = 'RUNNING'
            self.emit(db, mission_id, 'agent.started', {'summary': f'{agent.config["name"]} is working.', 'state': agent.state}, agent.id, task.id)
            inputs = [dep.output for dep in deps]
            scenario = db.get(Mission, mission_id).scenario
            received = inputs[0] if inputs else {'source': 'Local synthetic weather fixture' if scenario in ('weather', 'failure') else 'Local synthetic student score fixture' if scenario == 'data' else 'Local curated lesson fixture', 'request': task.title}
            self.emit(db, mission_id, 'agent.input_received', {
                'summary': f'{agent.config["name"]} received the prerequisite output.' if deps else f'{agent.config["name"]} received a request to read a local fixture.',
                'input': received, 'source_agents': [dep.agent_id for dep in deps],
            }, agent.id, task.id)
            world={'assigned_task':task.title,'instructions':agent.config['instructions'],'input':received,'allowed_tools':agent.config['tools'],'cycle_limit':2,'mode':'simulation','commander_guidance':guidance_for(self,mission_id,agent.id)}
            self.emit(db,mission_id,'agent.observe',{'summary':'Read the assigned classroom task and recorded inputs.','cycle':cycle,'world':world},agent.id,task.id)
            self.emit(db,mission_id,'agent.plan',{'summary':'Use the selected scenario’s permitted local operation.','cycle':cycle,'public_plan':[task.title,'Check the recorded tool result.'],'selected_tool':'educational_fixture'},agent.id,task.id)
            if world['commander_guidance']:
                self.emit(db,mission_id,'agent.guidance_received',{'summary':'Read the scripted commander recovery instruction.','cycle':cycle,'guidance_ids':[row['id'] for row in world['commander_guidance']]},agent.id,task.id)
            self.emit(db, mission_id, 'agent.decision', explain_action(
                'Use the approved local fixture tool',
                worker_reason(agent.config['role'], received),
                {'task': task.title, 'allowed_tools': agent.config['tools'],
                 'received_input': received, 'source_agents': [dep.agent_id for dep in deps]},
                agent.id,
            ), agent.id, task.id)
        await self.checkpoint(mission_id)
        with self.sessions() as db:
            task = db.get(Task, task_id)
            agent = db.get(Agent, task.agent_id)
            if fail:
                transition(agent, 'FAILED')
                task.status = 'FAILED'
                self.emit(db, mission_id, 'task.failed', {'summary': 'Simulated API timeout. The commander will retry once.', 'state': 'FAILED', 'error': 'SIMULATED_TIMEOUT'}, agent.id, task.id)
                self.emit(db,mission_id,'agent.test',{'summary':'The simulated timeout prevented a tool result.','cycle':cycle,'passed':False,'checks':[{'criterion':'Tool returned a result','passed':False,'evidence':'Simulated timeout.'}],'feedback':'Use the permitted local recovery fixture.','method':'local simulation fault detection'},agent.id,task.id)
                self.emit(db,mission_id,'agent.progress',{'summary':'Reported the simulated timeout to the commander.','cycle':cycle,'status':'adjusting'},agent.id,task.id)
                return False
            self.emit(db, mission_id, 'agent.tool_started', {'summary': 'Running the permitted local fixture tool.', 'tool': 'educational_fixture', 'input': received}, agent.id, task.id)
            role = agent.config['role']
        # Yield between actual operations so learners can observe or pause each step.
        # Values are produced by the tool, never invented by the frontend.
        for index, (summary, operation, result) in enumerate(tool_steps(scenario, role, inputs), start=1):
            await self.checkpoint(mission_id)
            with self.sessions() as db:
                self.emit(db, mission_id, 'agent.operation', {
                    'summary': summary, 'operation': operation, 'step': index,
                    'value': result, 'tool': 'educational_fixture',
                }, agent.id, task_id)
        await self.checkpoint(mission_id)
        with self.sessions() as db:
            task = db.get(Task, task_id)
            agent = db.get(Agent, task.agent_id)
            task.output = result
            self.emit(db,mission_id,'agent.act',{'summary':'Executed the scenario’s local operations.','cycle':cycle,'tool':'educational_fixture','artifact':result},agent.id,task.id)
            self.emit(db,mission_id,'agent.review_requested',{'summary':'Submit the classroom draft to the master for a scripted check.','sender':agent.id,'receiver':'master','cycle':cycle,'data':result,'mode':'simulation'},agent.id,task.id)
        await self.checkpoint(mission_id)
        with self.sessions() as db:
            task=db.get(Task,task_id);agent=db.get(Agent,task.agent_id)
            checks=[{'criterion':'Scenario operation returned data','passed':bool(result),'evidence':'Recorded tool operations and output.'}]
            self.emit(db,mission_id,'master.review_completed',{'summary':'Master accepted the classroom task using local fixture validation.','sender':'master','receiver':agent.id,'worker_id':agent.id,'cycle':cycle,'approved':bool(result),'data':{'approved':bool(result),'feedback':'Scripted fixture check passed; no model review was performed.','checks':checks},'mode':'simulation'},task_id=task.id)
            self.emit(db,mission_id,'agent.test',{'summary':'The scenario tool returned the expected output shape.','cycle':cycle,'passed':bool(result),'checks':[{'criterion':'Scenario operation returned data','passed':bool(result),'evidence':'Recorded tool operations and output.'}],'feedback':'Classroom task completed.','method':'local fixture result validation'},agent.id,task.id)
            self.emit(db,mission_id,'agent.progress',{'summary':'Reported the completed classroom task.','cycle':cycle,'status':'completed'},agent.id,task.id)
            self.emit(db,mission_id,'agent.stopped',{'summary':'Assigned classroom task completed.','outcome':'completed','cycle':cycle},agent.id,task.id)
            self.emit(db, mission_id, 'agent.tool_completed', {'summary': 'Local operation completed.', 'output': result}, agent.id, task.id)
            transition(agent, 'COMPLETED')
            task.status = 'COMPLETED'
            self.emit(db, mission_id, 'task.completed', {'summary': 'Task complete. Sending results!', 'state': agent.state, 'output': result}, agent.id, task.id)
            transition(agent, 'STANDBY')
            self.emit(db, mission_id, 'agent.standby', {'summary': 'Ready for another task. No model tokens are being consumed.', 'state': agent.state}, agent.id, task.id)
        return True

    async def run(self, mission_id):
        try:
            async with asyncio.timeout(240):
                with self.sessions() as db:
                    mission = db.get(Mission, mission_id)
                    mission.status = 'RUNNING'
                    self.emit(db, mission_id, 'mission.planning', {'summary': 'Let’s divide this mission into smaller jobs. This is a scripted simulation.'})
                    plan = TaskPlan(tasks=[PlanItem(name=name, role=role, title=title, dependencies=deps)
                                           for name, role, title, deps in self.plan(mission.scenario)])
                    ids = [uid() for _ in plan.tasks]
                    agent_ids = [uid() for _ in plan.tasks]
                    explanation = explain_plan(plan, mission.scenario, mission.prompt, ids, agent_ids)
                    self.emit(db, mission_id, 'master.decision', explain_action(
                        f'Select {len(plan.tasks)} workers for the selected scenario',
                        explanation.count_reason,
                        {'scenario': mission.scenario, 'roles': [item.role for item in plan.tasks],
                         'selection_basis': explanation.basis, 'worker_count': len(plan.tasks)},
                    ))
                    self.emit(db,mission_id,'master.observe',{'summary':'Read the mission and selected classroom scenario.','cycle':1,'world':{'mission':mission.prompt,'scenario':mission.scenario,'expected_outcome':explanation.scenario_scope,'mode':'simulation','cycle_limit':8}})
                    self.emit(db,mission_id,'master.plan',{'summary':explanation.count_reason,'cycle':1,'public_plan':[item.title for item in plan.tasks],'selected_tool':'scenario_agent_factory'})
                    self.emit(db, mission_id, 'mission.plan_ready', {
                        'summary': explanation.count_reason, 'task_ids': ids,
                        'plan': explanation.model_dump(),
                    })
                # Publish the explanation before any specialist is created or assigned work.
                await self.checkpoint(mission_id)
                with self.sessions() as db:
                    for index, item in enumerate(plan.tasks):
                        agent = self.create_agent(mission_id, item, agent_ids[index])
                        db.add(agent)
                        db.flush()
                        self.emit(db, mission_id, 'agent.created', {'summary': f'Meet {item.name}! A specialist has been configured; no new model was trained.', 'config': agent.config, 'state': 'CREATED'}, agent.id)
                        transition(agent, 'READY')
                        self.emit(db, mission_id, 'agent.ready', {'summary': f'{item.name} is ready.', 'state': 'READY'}, agent.id)
                        task = Task(id=ids[index], mission_id=mission_id, agent_id=agent.id, title=item.title, dependencies=[ids[i] for i in item.dependencies])
                        db.add(task)
                        self.emit(db, mission_id, 'task.created', {'summary': item.title, 'dependencies': task.dependencies}, agent.id, task.id)
                with self.sessions() as db:
                    self.emit(db,mission_id,'master.act',{'summary':'Created the scenario team and task graph.','cycle':1,'tool':'scenario_agent_factory','artifact':{'worker_count':len(ids)}})
                master_cycle=1
                pending = set(ids)
                failed_once = False
                while pending:
                    if master_cycle>8:
                        raise LimitReached('Simulation commander step limit reached.')
                    await self.checkpoint(mission_id)
                    with self.sessions() as db:
                        ready = [key for key in ids if key in pending and all(db.get(Task, dep).status == 'COMPLETED' for dep in db.get(Task, key).dependencies)]
                        scenario = db.get(Mission, mission_id).scenario
                    if not ready:
                        raise ValueError('Task graph is blocked')
                    if master_cycle>1:
                        with self.sessions() as db:
                            self.emit(db,mission_id,'master.observe',{'summary':'Read the current task graph and accepted predecessor outputs.','cycle':master_cycle,'world':{'remaining_tasks':[db.get(Task,key).title for key in ids if key in pending],'cycle_limit':8,'mode':'simulation'}})
                            self.emit(db,mission_id,'master.plan',{'summary':'Dispatch ready tasks using completed prerequisites.','cycle':master_cycle,'public_plan':[db.get(Task,key).title for key in ready],'selected_tool':'task_dispatch'})
                    # Ready tasks are independently delegated; dependencies gate later tasks.
                    for key in ready:
                        with self.sessions() as db:
                            task = db.get(Task, key)
                            self.emit(db,mission_id,'master.act',{'summary':f'Assign and monitor {task.title}.','cycle':master_cycle,'tool':'task_dispatch','artifact':{'task_id':key}})
                            prerequisites = [db.get(Task, dep) for dep in task.dependencies]
                            self.emit(db, mission_id, 'master.decision', explain_action(
                                f'Dispatch: {task.title}',
                                'All required predecessor tasks have completed, so their outputs can be delivered.' if prerequisites else 'This task has no predecessor tasks, so it can start from its fixture-read request.',
                                {'task_status': task.status,
                                 'dependencies': [{'task_id': dep.id, 'status': dep.status} for dep in prerequisites]},
                                task.agent_id,
                            ), task_id=key)
                        fail = scenario == 'failure' and not failed_once
                        if fail:
                            failed_once = True
                        ok = await self.worker(mission_id, key, fail)
                        if ok:
                            pending.remove(key)
                        else:
                            with self.sessions() as db:
                                failed_task = db.get(Task, key)
                                self.emit(db, mission_id, 'master.decision', explain_action(
                                    'Retry the failed task once',
                                    'The scripted timeout demonstration permits one recovery attempt. Reuse the existing worker because its role has not changed.',
                                    {'task_status': failed_task.status, 'retry_limit': 1,
                                     'recovery_source': 'local recovery fixture'}, failed_task.agent_id,
                                ), task_id=key)
                                self.emit(db,mission_id,'agent.adjust',{'summary':'Switch to the scripted recovery fixture.','cycle':1,'next_action':'Retry the local operation once.'},failed_task.agent_id,key)
                                self.emit(db,mission_id,'agent.repeat',{'summary':'The scenario permits one recovery cycle.','cycle':1,'next_cycle':2},failed_task.agent_id,key)
                                guide(self,mission_id,failed_task.agent_id,'Use the local recovery fixture for the next attempt.',source='simulation_commander',reason='The scripted timeout was detected.',task_id=key,cycle=master_cycle)
                                self.emit(db, mission_id, 'task.retry_requested', {'summary': 'Retry 1 of 1, using the local recovery fixture.'}, task_id=key)
                    with self.sessions() as db:
                        self.emit(db,mission_id,'master.test',{'summary':f'{len(ids)-len(pending)} of {len(ids)} classroom tasks complete.','cycle':master_cycle,'passed':not pending,'scope':'scenario progress','checks':[{'criterion':'All scenario tasks complete','passed':not pending,'evidence':f'{len(pending)} tasks remain.'}],'method':'persisted task states'})
                        if pending:
                            self.emit(db,mission_id,'master.adjust',{'summary':'Use the completed outputs or recovery feedback to choose the next dispatch.','cycle':master_cycle,'next_action':'Dispatch the next eligible classroom task.'})
                            self.emit(db,mission_id,'master.repeat',{'summary':'Continue with the updated task state.','cycle':master_cycle,'next_cycle':master_cycle+1})
                    if pending:
                        master_cycle+=1
                await self.checkpoint(mission_id)
                with self.sessions() as db:
                    mission = db.get(Mission, mission_id)
                    mission.output = db.get(Task, ids[-1]).output
                    self.emit(db, mission_id, 'master.decision', explain_action(
                        'Deliver the final task output',
                        'Every planned task has completed. This scenario uses the last task’s output as the final mission result.',
                        {'tasks': [{'task_id': key, 'status': db.get(Task, key).status} for key in ids],
                         'output_task_id': ids[-1]},
                    ))
                    self.emit(db,mission_id,'master.test',{'summary':'Combined scenario result is available and all scenario tasks are complete.','cycle':master_cycle,'scope':'whole scenario','passed':bool(mission.output),'checks':[{'criterion':'Scenario output produced','passed':bool(mission.output),'evidence':'Final scenario task output and completed predecessor tasks.'}],'method':'local scenario completion validation'})
                    if not mission.output:
                        raise ValueError('The master cannot approve an empty scenario result')
                    self.emit(db,mission_id,'master.final_approved',{'summary':'Master approved the classroom result using scripted scenario checks. No model review or rewrite was performed.','cycle':master_cycle,'mode':'simulation'})
                    self.emit(db,mission_id,'master.stopped',{'summary':'The selected classroom scenario completed.','outcome':'completed','cycle':master_cycle})
                    mission.status = 'COMPLETED'
                    self.emit(db, mission_id, 'mission.completed', {'summary': 'Mission accomplished! Your team’s result is ready.', 'output': mission.output})
        except asyncio.CancelledError:
            with self.sessions() as db:
                for agent in db.scalars(select(Agent).where(Agent.mission_id == mission_id)):
                    if 'CANCELLED' in TRANSITIONS[agent.state]:
                        transition(agent, 'CANCELLED')
                        self.emit(db, mission_id, 'agent.cancelled', {'summary': 'Execution safely cancelled.', 'state': 'CANCELLED'}, agent.id)
                for task in db.scalars(select(Task).where(Task.mission_id == mission_id, Task.status != 'COMPLETED')):
                    task.status = 'CANCELLED'
                db.commit()
        except Exception as exc:
            with self.sessions() as db:
                mission = db.get(Mission, mission_id)
                mission.status = 'FAILED'
                outcome='limit_reached' if isinstance(exc,(LimitReached,TimeoutError)) else 'help_needed'
                summary='Simulation time or step limit reached.' if outcome=='limit_reached' else 'The scenario stopped and needs help.'
                for agent in db.scalars(select(Agent).where(Agent.mission_id==mission_id)):
                    if agent.state not in ('STANDBY','COMPLETED'):
                        self.emit(db,mission_id,'agent.stopped',{'summary':summary,'outcome':outcome,'cycle':1},agent.id)
                self.emit(db,mission_id,'master.stopped',{'summary':summary,'outcome':outcome,'cycle':1})
                self.emit(db, mission_id, 'mission.failed', {'summary':summary,'stop_reason':outcome})
            import logging
            logging.exception('Mission execution failed: %s', mission_id)
        finally:
            self.jobs.pop(mission_id, None)

    async def close(self):
        jobs = list(self.jobs.values())
        for job in jobs:
            job.cancel()
        await asyncio.gather(*jobs, return_exceptions=True)
