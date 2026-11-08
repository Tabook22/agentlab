"""Durable pre-delegation questions and user-confirmed mission context."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from .db import Event, Agent, Task
from .config import provider_status

WAITING_CLARIFICATION='AWAITING_CLARIFICATION'


def clarification_history(db,key):
    return [{'question':e.payload['question'],'answer':e.payload['answer']}
            for e in db.scalars(select(Event).where(Event.mission_id==key,
                Event.type=='mission.clarification_answered').order_by(Event.sequence))]


def clarified_mission(db,mission):
    history=clarification_history(db,mission.id)
    if not history:return mission.prompt
    return mission.prompt+'\n\nUser-confirmed mission clarifications:\n'+'\n\n'.join(
        f"Question: {row['question']}\nUser answer: {row['answer']}" for row in history)


class ClarificationAnswer(BaseModel):
    answer: str = Field(min_length=1,max_length=4000)


def clarification_router(runner,require,require_local,serialize):
    router=APIRouter()

    @router.post('/api/missions/{key}/clarifications/{question_id}/answer')
    async def answer(key:str,question_id:str,body:ClarificationAnswer,request:Request):
        require_local(request)
        text=body.answer.strip()
        if not text:raise HTTPException(422,'Please answer the master’s clarification question.')
        with runner.sessions() as db:
            mission=require(db,key)
            question=db.get(Event,question_id)
            if not question or question.mission_id!=key or question.type!='mission.clarification_requested':
                raise HTTPException(404,'Clarification question not found in this mission.')
            answered=list(db.scalars(select(Event).where(Event.mission_id==key,Event.type=='mission.clarification_answered')))
            if any(e.payload.get('question_id')==question_id for e in answered):
                return {'mission':serialize(mission),'resumed':False,'already_answered':True}
            pending=db.scalar(select(Event).where(Event.mission_id==key,Event.type=='mission.clarification_requested').order_by(Event.sequence.desc()).limit(1))
            if mission.mode!='live' or mission.status!=WAITING_CLARIFICATION or not pending or pending.id!=question_id:
                raise HTTPException(409,'This question is no longer awaiting an answer. Refresh the mission.')
            if db.scalar(select(Agent.id).where(Agent.mission_id==key).limit(1)) or db.scalar(select(Task.id).where(Task.mission_id==key).limit(1)):
                raise HTTPException(409,'Pre-planning clarification cannot change a mission with existing workers.')
            if runner.live_jobs or len(runner.jobs)>=4 or key in runner.jobs:
                raise HTTPException(409,'Wait for active work to finish before continuing mission planning.')
            if not provider_status()['key_present']:
                raise HTTPException(400,'Configure the saved backend API key before continuing planning.')
            options={**question.payload['options'],'carry_usage':True}
            mission.status='RUNNING'
            runner.emit(db,key,'mission.clarification_answered',{
                'summary':'Your answer is saved. The master will check the clarified mission before proposing a team.',
                'question_id':question_id,'question':question.payload['question'],'answer':text,
                'source':'user','status':'RUNNING'})
            result=serialize(mission)
        runner.start(key,'live',options)
        return {'mission':result,'resumed':True}

    return router
