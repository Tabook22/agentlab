from account_helpers import sign_in_admin
import asyncio
import time
from dataclasses import replace
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.db import Base,Mission,Event
from app.main import create_app
from app.engine import Orchestrator
from app.provider import LiveLimits,RequestBudget,LimitReached
from app.answer_resources import ResourceQueries,ResourceGuide,ResourceItem,grounded_guide,start_resource_search,resource_state
from app.answer_export import answer_package

URL='https://www.youtube.com/watch?v=example123'
PAPER='https://example.org/research'
def item(url=URL,kind='video'):
    return ResourceItem(url=url,kind=kind,why='Explains the method used in the answer.',how_to_use='Watch the demonstration, then compare it with the plan.',level='beginner',access='unknown',creator='',year='')
def guide():
    return ResourceGuide(introduction='Start with an explanation, then inspect the evidence.',items=[item(),item(PAPER,'paper'),item('https://invented.example/book','book')],start_here_urls=[URL,PAPER,'https://invented.example/book'],limitations=['Search discovery is not independent verification.'])

class FakeProvider:
    limits=LiveLimits();transport=None;model='test';input_price=.75;output_price=4.5
    def __init__(self,fail=False,slow=False):self.fail=fail;self.slow=slow;self.queries=[]
    async def generate(self,schema,instructions,data,budget,output_tokens=1800):
        budget.reserve(data,output_tokens,self.input_price,self.output_price);budget.cost+=.001
        return (ResourceQueries(learning_query='public topic explanatory talks tools',research_query='public topic papers books') if schema is ResourceQueries else guide()),budget.snapshot()
    async def research(self,query,budget,language='en'):
        self.queries.append(query)
        if self.slow:await asyncio.sleep(60)
        if self.fail:raise LimitReached('No remaining calls.','calls',25)
        budget.reserve({},1000,self.input_price,self.output_price);budget.cost+=.001;budget.web_search_calls+=1
        return {'content':'The lecture explains the method and the paper describes the evidence.','sources':[{'title':'Method lecture','url':URL},{'title':'Original paper','url':PAPER}],'searches':[{'query':query}]}

@pytest.fixture
def resource_app(tmp_path,monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    provider=FakeProvider();app=create_app(f'sqlite:///{tmp_path / "resources.db"}',delay=0,provider=provider)
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    with TestClient(app) as client:
        sign_in_admin(client)
        with app.state.sessions() as db:
            mission=Mission(owner_id='administrator',prompt='Explain a public educational topic',mode='live',scenario='live',status='COMPLETED',output={'content':'Original approved answer.','usage':{'calls':5,'estimated_cost_usd':.01}});db.add(mission);db.commit();key=mission.id
            app.state.runner.emit(db,key,'mission.created',{'prompt':mission.prompt,'language':'en','find_resources':True,'limits':{'open_ended':False,'budget_usd':.2}})
            app.state.runner.emit(db,key,'master.final_approved',{})
            app.state.runner.emit(db,key,'mission.completed',{'output':{'title':'Original answer','content':'Original approved answer.'}})
        yield client,app,key,provider

def wait_resources(client,key):
    for _ in range(100):
        state=client.get(f'/api/missions/{key}/answer/resources').json()
        if state['status']!='searching':return state
        time.sleep(.01)
    raise AssertionError('Resource search did not finish')

def test_only_retrieved_urls_survive_and_specific_youtube_videos_are_required():
    result=grounded_guide(guide(),[{'url':URL,'title':'Real retrieved title'},{'url':PAPER,'title':'Paper'}])
    assert [i['url'] for i in result['items']]==[URL,PAPER]
    assert result['items'][0]['title']=='Real retrieved title'
    assert result['start_here_urls']==[URL,PAPER] and 'book' in result['missing_types']
    channels=ResourceGuide(introduction='Guide',items=[item('https://www.youtube.com/@channel')],start_here_urls=[],limitations=[])
    assert grounded_guide(channels,[{'url':'https://www.youtube.com/@channel','title':'Channel'}])['items']==[]

def test_search_preserves_approved_answer_usage_and_includes_resources_in_exports(resource_app):
    client,app,key,provider=resource_app
    before=client.get(f'/api/missions/{key}/events').json()
    assert client.post(f'/api/missions/{key}/answer/resources/search').status_code==202
    result=wait_resources(client,key)
    assert result['status']=='ready' and len(result['items'])==2
    assert provider.queries==['public topic explanatory talks tools','public topic papers books']
    mission=client.get(f'/api/missions/{key}').json()
    assert mission['status']=='COMPLETED' and mission['output']['content']=='Original approved answer.'
    assert mission['output']['usage']['calls']==9 and mission['output']['usage']['web_search_calls']==2
    after=client.get(f'/api/missions/{key}/events').json()
    assert next(e for e in after if e['type']=='mission.completed')==before[-1]
    package=client.get(f'/api/missions/{key}/answer/package').json()
    assert package['content']=='Original approved answer.' and URL in package['resource_content']
    assert 'invented.example' not in package['resource_content']
    assert client.post(f'/api/missions/{key}/answer/export',json={'format':'docx'}).status_code==200

def test_limit_failure_does_not_fail_the_mission_or_reset_usage(resource_app):
    client,app,key,provider=resource_app;provider.fail=True
    client.post(f'/api/missions/{key}/answer/resources/search')
    result=wait_resources(client,key)
    assert result['status']=='limited' and result['items']==[]
    mission=client.get(f'/api/missions/{key}').json()
    assert mission['status']=='COMPLETED' and mission['output']['usage']['calls']==6
    assert not any(e['type']=='mission.failed' for e in client.get(f'/api/missions/{key}/events').json())

def test_duplicate_search_stop_and_interrupted_state_are_safe(resource_app):
    client,app,key,provider=resource_app;provider.slow=True
    client.post(f'/api/missions/{key}/answer/resources/search')
    client.post(f'/api/missions/{key}/answer/resources/search')
    assert len(provider.queries)<=1
    assert client.post(f'/api/missions/{key}/answer/resources/stop').status_code==200
    assert wait_resources(client,key)['status']=='interrupted'
    assert client.get(f'/api/missions/{key}').json()['status']=='COMPLETED'
    with app.state.sessions() as db:
        mission=db.get(Mission,key);mission.output={**mission.output,'learning_resources':{'status':'searching','items':[]}};db.commit()
    before=len(provider.queries)
    assert client.get(f'/api/missions/{key}/answer/resources').json()['status']=='interrupted'
    assert len(provider.queries)==before

def test_drafts_simulations_and_remote_requests_cannot_start_paid_search(resource_app):
    client,app,key,provider=resource_app
    with app.state.sessions() as db:
        mission=db.get(Mission,key);mission.mode='simulation';db.commit()
    assert client.post(f'/api/missions/{key}/answer/resources/search').status_code==409
    with app.state.sessions() as db:
        mission=db.get(Mission,key);mission.mode='live';mission.status='RUNNING';db.commit()
    assert client.post(f'/api/missions/{key}/answer/resources/search').status_code==409
    assert provider.queries==[]


def test_nonlocal_call_cannot_start_research(resource_app):
    import httpx
    client,app,key,provider=resource_app
    async def remote():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app,client=('203.0.113.7',1234)),base_url='http://test') as remote_client:
            return await remote_client.post(f'/api/missions/{key}/answer/resources/search')
    assert asyncio.run(remote()).status_code==401
    assert provider.queries==[]


def test_failed_refresh_preserves_previously_found_resources(resource_app):
    client,app,key,provider=resource_app
    client.post(f'/api/missions/{key}/answer/resources/search')
    first=wait_resources(client,key)
    assert first['status']=='ready'
    provider.fail=True
    client.post(f'/api/missions/{key}/answer/resources/search')
    failed=wait_resources(client,key)
    assert failed['status']=='limited' and failed['items']==first['items']
    assert URL in client.get(f'/api/missions/{key}/answer/package').json()['resource_content']
