import json
from uuid import uuid4
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import create_app
from app.db import Base, Mission, Event, Agent
from app.provider import OpenAIProvider

@pytest.fixture
def chat_client(tmp_path,monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    monkeypatch.setenv('OPENAI_MODEL','gpt-5.4-mini')
    requests=[];response_code=[200]
    def respond(request):
        requests.append(json.loads(request.content))
        if response_code[0]==429:return httpx.Response(429,json={'error':{'code':'insufficient_quota','message':'PRIVATE_KEY'}})
        return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':100,'output_tokens':50},'output':[
            {'type':'reasoning','summary':[{'text':'PRIVATE_REASONING'}]},
            {'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps({'answer':'The recorded plan assigns distinct roles. A smaller team is an alternative, not an applied change.','evidence_sequences':[1,999,1],'follow_up_questions':['Which acceptance criteria matter most?']})}]}]})
    app=create_app(f'sqlite:///{tmp_path / "chat.db"}',delay=0,provider=OpenAIProvider(httpx.MockTransport(respond)))
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    with TestClient(app) as client:
        with app.state.sessions() as db:
            mission=Mission(prompt='Explain educational agents',scenario='concepts',mode='live',status='AWAITING_APPROVAL',output={'usage':{'calls':7,'estimated_cost_usd':.08}})
            db.add(mission);db.commit();key=mission.id
            app.state.runner.emit(db,key,'mission.plan_approval_requested',{'summary':'Two workers have distinct research and editing roles.','worker_plan':{'tasks':[{'name':'Lumen','role':'Researcher'},{'name':'Quill','role':'Editor'}]}})
        yield client,key,requests,response_code

def send(client,key,message='Why two workers?',**options):
    return client.post(f'/api/missions/{key}/master/chat',json={'message':message,'request_id':str(uuid4()),**options})

def test_discussion_before_approval_is_persisted_but_never_executes(chat_client):
    client,key,requests,_=chat_client
    identity=str(uuid4())
    response=send(client,key,request_id=identity,event_sequence=1,language='ar')
    assert response.status_code==200,response.text
    body=response.json();assert [m['role'] for m in body['messages']]==['user','assistant']
    answer=body['messages'][1]
    assert answer['evidence_sequences']==[1] and answer['discussion_only'] is True
    assert 'PRIVATE_REASONING' not in response.text
    assert body['usage']['calls']==1 and body['usage']['reported_tokens']==150
    assert body['usage']['estimated_cost_usd']>0
    assert 'chat_usage' in answer and 'usage' not in answer
    context=json.loads(requests[0]['input']);assert context['language']=='ar' and context['selected_decision']==1
    assert context['evidence'][0]['payload']['worker_plan']['tasks'][0]['role']=='Researcher'
    assert 'cannot approve' in requests[0]['instructions']
    with client.app.state.sessions() as db:
        mission=db.get(Mission,key)
        assert mission.status=='AWAITING_APPROVAL' and mission.output['usage']['calls']==7
        assert list(db.scalars(select(Agent).where(Agent.mission_id==key)))==[]
        assert not any(e.type in ('mission.plan_approved','master.final_approved') for e in db.scalars(select(Event).where(Event.mission_id==key)))
    assert client.get(f'/api/missions/{key}/master/chat').json()['messages']==body['messages']
    # An accidental resubmission cannot buy a second model answer.
    assert send(client,key,request_id=identity).json()==body
    assert len(requests)==1

def test_followup_uses_saved_conversation_and_completed_approval(chat_client):
    client,key,requests,_=chat_client
    send(client,key)
    with client.app.state.sessions() as db:
        mission=db.get(Mission,key);mission.status='COMPLETED'
        client.app.state.runner.emit(db,key,'master.final_approved',{'summary':'All recorded checks passed.','checks':[{'passed':True}]})
        db.add(Agent(mission_id=key,config={'name':'Salim','role':'Researcher'},state='COMPLETED'));db.commit()
    response=send(client,key,'Why did you accept the final result?')
    assert response.status_code==200 and response.json()['mission_status']=='COMPLETED'
    context=json.loads(requests[-1]['input'])
    assert context['conversation'][0]['role']=='user' and context['conversation'][1]['role']=='assistant'
    assert context['current_workers'][0]['name']=='Salim'
    assert any(e['type']=='master.final_approved' for e in context['evidence'])
    assert response.json()['usage']['calls']==2

def test_quota_error_saves_question_and_safe_failure_without_changing_mission(chat_client):
    client,key,requests,code=chat_client;code[0]=429
    response=send(client,key)
    assert response.status_code==200
    body=response.json();assert body['messages'][-1]['role']=='error'
    assert body['messages'][-1]['provider_issue']=='insufficient_quota'
    assert 'PRIVATE_KEY' not in response.text
    assert body['mission_status']=='AWAITING_APPROVAL' and body['usage']['estimated_cost_usd']==0
    assert len(requests)==1

def test_invalid_questions_and_decisions_do_not_call_provider(chat_client):
    client,key,requests,_=chat_client
    assert send(client,key,'   ').status_code==422
    assert send(client,key,'x'*3001).status_code==422
    assert send(client,key,event_sequence=999).status_code==422
    assert send(client,'missing').status_code==404
    assert requests==[]
    assert client.get(f'/api/missions/{key}/master/chat').json()['messages']==[]

def test_chat_is_local_only(chat_client):
    client,key,requests,_=chat_client
    with TestClient(client.app,client=('203.0.113.1',5000)) as remote:
        assert remote.get(f'/api/missions/{key}/master/chat').status_code==403
        assert send(remote,key).status_code==403
    assert requests==[]
