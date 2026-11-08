"""Persisted public guidance and bounded loop outcomes."""
from sqlalchemy import select
from .db import Event, uid


def guidance_for(runner,key,agent_id):
    with runner.sessions() as db:
        return [{'id':e.id,'instruction':e.payload['instruction'],'source':e.payload.get('source','commander')}
            for e in db.scalars(select(Event).where(Event.mission_id==key,Event.agent_id==agent_id,
                Event.type=='commander.instruction').order_by(Event.sequence))]


def guide(runner,key,agent_id,instruction,source='commander',reason='Review feedback',task_id=None,cycle=None):
    with runner.sessions() as db:
        event=runner.emit(db,key,'commander.instruction',{'summary':instruction,'instruction':instruction,
            'source':source,'reason':reason,'cycle':cycle,'target_agent_id':agent_id},agent_id,task_id)
        runner.emit(db,key,'agent.message_sent',{'summary':f'Commander → worker: {instruction}',
            'message_id':uid(),'sender':'master','receiver':agent_id,'message_type':'GUIDANCE',
            'delivery_status':'DELIVERED','source':source,'data':{'instruction':instruction,'reason':reason},
            'guidance_id':event.id},agent_id,task_id)
        runner.emit(db,key,'master.intervention',{'summary':instruction,'reason':reason,'source':source,
            'target_agent_id':agent_id,'guidance_id':event.id,'cycle':cycle},task_id=task_id)
        return event.id


def stop(runner,key,actor,outcome,summary,cycle=1,task_id=None):
    with runner.sessions() as db:
        runner.emit(db,key,'master.stopped' if actor=='master' else 'agent.stopped',
            {'summary':summary,'outcome':outcome,'cycle':cycle},None if actor=='master' else actor,task_id)
