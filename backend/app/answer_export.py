"""Local exports from approved saved answers. No model or network calls."""
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from .db import Event
from .answer_documents import clean_text,safe_url,LINK,make_docx,make_pdf

def answer_package(db,mission):
    completed=db.scalar(select(Event).where(Event.mission_id==mission.id,Event.type=='mission.completed').order_by(Event.sequence.desc()).limit(1))
    approved=db.scalar(select(Event).where(Event.mission_id==mission.id,Event.type=='master.final_approved').order_by(Event.sequence.desc()).limit(1))
    if mission.status!='COMPLETED' or not completed:raise HTTPException(409,'The finished answer is not available yet. Drafts cannot be exported as final answers.')
    if mission.mode=='live' and (not approved or approved.sequence>completed.sequence):raise HTTPException(409,'A recorded Master Agent final approval is required before exporting this live answer.')
    output=completed.payload.get('output') or mission.output or {}
    title=clean_text(output.get('title') or output.get('label') or 'Mission answer')
    body=clean_text(output.get('content') or output.get('lesson') or '')
    if output.get('mean') is not None:body+=f"\n\nAverage score: {output['mean']} / 100"
    if output.get('days') and output.get('temperatures'):
        body+='\n\n## Temperature data\n| Day | Temperature |\n| --- | --- |\n'+'\n'.join(f'| {day} | {temp} °C |' for day,temp in zip(output['days'],output['temperatures']))
    if not body.strip():body='\n'.join(f'{k}: {v}' for k,v in output.items() if k not in ('usage','verification','master_approved','validation','sources','limitations'))
    sources=[];seen=set()
    for source in [*(output.get('sources') or []),*({'url':m[2],'title':m[1]} for m in LINK.finditer(body))]:
        if not isinstance(source,dict):continue
        url=source.get('url','')
        if safe_url(url) and url not in seen:sources.append({'title':clean_text(source.get('title') or url),'url':url});seen.add(url)
    return {'mission_id':mission.id,'title':title,'goal':mission.prompt,'content':body.strip(),
            'limitations':[clean_text(x) for x in output.get('limitations',[])], 'sources':sources,
            'master_approved':bool(approved),'mode':mission.mode,'variant':'answer'}

class ExportRequest(BaseModel):
    format: Literal['pdf','docx']
    variant: Literal['answer','prompt']='answer'
    prompt_text: str | None=Field(default=None,min_length=1,max_length=60000)

def answer_export_router(runner,require,require_local):
    router=APIRouter(prefix='/api/missions')
    @router.get('/{key}/answer/package')
    def package(key:str,request:Request):
        require_local(request)
        with runner.sessions() as db:return answer_package(db,require(db,key))
    @router.post('/{key}/answer/export')
    def export(key:str,body:ExportRequest,request:Request):
        require_local(request)
        with runner.sessions() as db:data=answer_package(db,require(db,key))
        if body.variant=='prompt':
            if not body.prompt_text or not body.prompt_text.strip():raise HTTPException(422,'Review the reusable prompt before downloading it.')
            data={**data,'title':'Reusable prompt draft','content':body.prompt_text.strip(),'variant':'prompt','limitations':[],'sources':[]}
        try:content=make_pdf(data) if body.format=='pdf' else make_docx(data)
        except ImportError:raise HTTPException(503,'Document export dependencies are missing on the backend. Install backend requirements and restart it.') from None
        except RuntimeError as exc:raise HTTPException(503,str(exc)) from None
        name=f'agent-lab-{body.variant}-{key[:8]}.{body.format}'
        return Response(content,media_type='application/pdf' if body.format=='pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',headers={'Content-Disposition':f'attachment; filename="{name}"','Cache-Control':'no-store'})
    return router
