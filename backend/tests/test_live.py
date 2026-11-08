import asyncio
import json
import time
from dataclasses import replace
import httpx
import pytest
from fastapi.testclient import TestClient
from app.db import Base
from app.main import create_app
from app.provider import OpenAIProvider, LiveError, LiveLimits, RequestBudget
from app.live_tools import calculate
from app.live_schemas import FinalReport


def test_rejected_key_is_sanitized_and_has_no_reported_usage(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    monkeypatch.setenv('OPENAI_MODEL','gpt-5.4-mini')
    transport=httpx.MockTransport(lambda request: httpx.Response(401,json={'error':'SECRET_RESPONSE_BODY'}))
    provider=OpenAIProvider(transport=transport)
    budget=RequestBudget(provider.limits)
    with pytest.raises(LiveError,match='OpenAI rejected the key') as error:
        asyncio.run(provider.generate(FinalReport,'Public output only',{'mission':'Explain DNS'},budget))
    assert 'SECRET_RESPONSE_BODY' not in str(error.value)
    assert 'local-test-key' not in str(error.value)
    assert budget.calls==1
    assert budget.tokens==0 and budget.cost==0 and budget.uncertain_requests==0
    assert provider.connected is False


def mock_transport(workers=1,revise=False,bad_graph=False,blocked_tool=False,delay=0,research=False,master_help=False,worker_help=False,final_fail=False,final_revise=False,master_help_rounds=0):
    requests=[]
    async def respond(request):
        assert request.headers['authorization']=='Bearer local-test-key'
        body=json.loads(request.content);requests.append(body)
        if delay:
            await asyncio.sleep(delay)
        if 'tools' in body:
            assert body['tools'][0]['type']=='web_search'
            assert body['tool_choice']=='required' and body['max_tool_calls']==2
            return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':200,'output_tokens':200},
                'output':[{'type':'reasoning','summary':[{'text':'PRIVATE_SENTINEL'}]},
                    {'type':'web_search_call','status':'completed','action':{'type':'search','query':'grazing studies','sources':[
                        {'url':'https://example.org/study','title':'Tracking study'}, {'url':'javascript:alert(1)','title':'Unsafe'}]}},
                    {'type':'message','role':'assistant','content':[{'type':'output_text','text':'Study findings [1]',
                        'annotations':[{'type':'url_citation','start_index':15,'end_index':18,'url':'https://example.org/study','title':'Tracking study'}]}]}]})
        purpose=body['text']['format']['name'];data=json.loads(body['input'])
        if purpose=='LiveMissionPlan':
            result={'help_request':'','count_reason':f'This mission has {workers} distinct useful responsibilities.',
                'fewer_agents':'Fewer could combine responsibilities where appropriate.',
                'more_agents':'More would duplicate the bounded work.','scope':'Answer the actual mission using scoped workers.',
                'success_criteria':'All delegated outputs meet their rubrics.',
                'tasks':[{'name':f'Worker{i+1}','role':f'Aspect {i+1}','title':f'Prepare aspect {i+1}',
                    'instructions':f'Explain aspect {i+1} of the mission.', 'why_separate':'This is a distinct requested deliverable.',
                    'expected_output':'A useful short explanation.','input_description':'The mission and assigned predecessor outputs.',
                    'dependencies':([0] if bad_graph else []) if i==0 else [i-1],
                    'tools':['write_text'],'acceptance_criteria':['Contains useful content']} for i in range(workers)]}
        elif purpose=='WorkerProposal':
            result={'observation_summary':'The mission and dependency artifacts are available in my scoped context.',
                'public_plan':['Write the assigned explanation.','Check it against the acceptance criterion.'],
                'action':'calculate' if blocked_tool and data['cycle']==1 else 'write_text',
                'argument':'2+2' if blocked_tool and data['cycle']==1 else f'Useful content for {data["assigned_task"]}, revision {data["cycle"]}.',
                'action_summary':'Produce the assigned explanatory artifact.','known_limitations':['No external sources were accessed.']}
        elif purpose=='WorkerReview':
            passed=not revise or data['context']['cycle']>1 or data['task']=='Verify the whole mission'
            if final_fail and data['task']=='Verify the whole mission':
                passed=False
            if final_revise and data['task']=='Verify the whole mission':
                passed=sum(r.get('text',{}).get('format',{}).get('name')=='FinalReport' for r in requests)>1
            result={'checks':[{'criterion':criterion,'passed':passed,
                    'evidence':'The revised artifact meets this criterion.' if passed else 'The draft needs a clearer explanation.'} for criterion in data['criteria']],
                    'feedback':'Accepted.' if passed else 'Add a clearer explanation and try again.'}
        else:
            assert purpose=='FinalReport'
            result={'title':'Combined answer','content':'Master improved answer.\n'+'\n'.join(row['output']['content'] for row in data['worker_outputs']),
                    'limitations':['Rubric reviewed; no external fact checking.']}
        if purpose=='LiveMissionPlan' and (master_help or len(data.get('clarification_history',[]))<master_help_rounds):
            result['tasks']=[];result['help_request']='Which input dataset should the team use?' if not data.get('clarification_history') else 'Who is the intended audience?'
        if worker_help and purpose=='WorkerProposal':
            result.update(action='request_help',argument='Please provide the missing dataset and its column definitions.')
        if research and purpose=='LiveMissionPlan':
            result['tasks'][0]['tools']=['web_research']
        if research and purpose=='WorkerProposal' and data['allowed_tools']==['web_research']:
            result.update(action='web_research',argument='Find original grazing behaviour tracking studies in Dhofar and comparable settings.')
        return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':100,'output_tokens':100},
            'output':[{'type':'reasoning','summary':[{'type':'summary_text','text':'PRIVATE_SENTINEL'}]},
                      {'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps(result)}]}]})
    return httpx.MockTransport(respond),requests


@pytest.fixture
def make_client(tmp_path,monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    monkeypatch.setenv('OPENAI_MODEL','gpt-5.4-mini')
    opened=[]
    def make(**kwargs):
        transport,requests=mock_transport(**kwargs)
        provider=OpenAIProvider(transport)
        app=create_app(f'sqlite:///{tmp_path / f"live-{len(opened)}.db"}',delay=0,provider=provider)
        Base.metadata.create_all(app.state.sessions.kw['bind'])
        client=TestClient(app);client.__enter__();opened.append(client)
        return client,requests
    yield make
    for client in opened:
        client.__exit__(None,None,None)


def start(client,approve_plan=True,**kwargs):
    response=client.post('/api/missions',json={'prompt':'Explain the assigned educational topic.','mode':'live','open_ended':False,**kwargs})
    assert response.status_code==201,response.text
    key=response.json()['id']
    if approve_plan:
        for _ in range(300):
            mission=client.get(f'/api/missions/{key}').json()
            if mission['status']=='AWAITING_APPROVAL':
                events=client.get(f'/api/missions/{key}/events').json()
                plan=next(e for e in reversed(events) if e['type']=='mission.plan_approval_requested')
                approved=client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':plan['id'],'total_budget_usd':plan['payload']['estimate']['current_total_limit_usd']})
                assert approved.status_code==200,approved.text
                break
            if mission['status'] in ('COMPLETED','FAILED','CANCELLED','AWAITING_LIMIT_APPROVAL','AWAITING_CLARIFICATION'):break
            time.sleep(.01)
    return key


def wait_for_report(client,key):
    for _ in range(300):
        mission=client.get(f'/api/missions/{key}').json()
        if mission['status']=='AWAITING_APPROVAL':
            events=client.get(f'/api/missions/{key}/events').json()
            return mission,next(e for e in reversed(events) if e['type']=='mission.plan_approval_requested')
        time.sleep(.01)
    pytest.fail('Planning report was not published')


def test_plan_requires_consent_before_any_workers_and_reuses_exact_plan(make_client):
    client,requests=make_client(workers=4)
    key=start(client,approve_plan=False)
    mission,report=wait_for_report(client,key)
    assert len(requests)==1 and mission['agents']==[] and mission['tasks']==[]
    assert report['payload']['report']['worker_count']==4
    estimate=report['payload']['estimate']
    assert estimate['estimated_total_high_usd']>=estimate['estimated_total_low_usd']>0
    assert estimate['estimated_seconds_high']>estimate['estimated_seconds_low']>0
    assert estimate['planning_usage']['calls']==1
    time.sleep(.05)
    assert len(requests)==1
    assert client.post(f'/api/missions/{key}/resume').status_code==409
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':'wrong','total_budget_usd':.20}).status_code==409
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':6}).status_code==422
    approved=client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.20})
    assert approved.status_code==200
    result=finish(client,key)
    assert result['status']=='COMPLETED'
    assert [a['id'] for a in result['agents']]==report['payload']['agent_ids']
    assert sum(r['text']['format']['name']=='LiveMissionPlan' for r in requests)==1
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.20}).status_code==409


def test_declining_a_plan_preserves_planning_usage_without_execution(make_client):
    client,requests=make_client()
    key=start(client,approve_plan=False)
    _,report=wait_for_report(client,key)
    declined=client.post(f'/api/missions/{key}/plan/decline',json={'plan_id':report['id']})
    assert declined.status_code==200
    result=finish(client,key)
    assert result['status']=='CANCELLED' and result['agents']==[] and len(requests)==1
    assert result['output']['usage']['calls']==1
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.20}).status_code==409


def test_pending_plan_survives_backend_restart_without_work_or_new_calls(make_client):
    client,requests=make_client()
    key=start(client,approve_plan=False)
    _,report=wait_for_report(client,key)
    app=create_app(str(client.app.state.sessions.kw['bind'].url),delay=0,provider=client.app.state.runner.provider)
    with TestClient(app) as restarted:
        saved=restarted.get(f'/api/missions/{key}').json()
        assert saved['status']=='AWAITING_APPROVAL' and saved['agents']==[]
        assert len(requests)==1
        assert restarted.post(f'/api/missions/{key}/plan/decline',json={'plan_id':report['id']}).status_code==200


def finish(client,key):
    for _ in range(300):
        result=client.get(f'/api/missions/{key}').json()
        if result['status'] in ('COMPLETED','FAILED','CANCELLED','AWAITING_LIMIT_APPROVAL','AWAITING_CLARIFICATION'):
            return result
        time.sleep(.01)
    pytest.fail('Live mission did not terminate')


@pytest.mark.parametrize('language,expected',[('ar','Arabic'),('en','English')])
def test_selected_language_reaches_all_agent_calls(make_client,language,expected):
    client,requests=make_client(workers=2)
    key=start(client,language=language)
    assert finish(client,key)['status']=='COMPLETED'
    events=client.get(f'/api/missions/{key}/events').json()
    created=next(e for e in events if e['type']=='mission.created')
    assert created['payload']['language']==language
    assert requests
    assert all(f'Write all public-facing text in {expected}.' in r['instructions'] for r in requests)


def test_unsupported_language_is_rejected(make_client):
    client,_=make_client()
    response=client.post('/api/missions',json={'prompt':'Explain DNS','mode':'live','language':'unsupported'})
    assert response.status_code==422


@pytest.mark.parametrize('workers',[1,2,4])
def test_commander_team_size_and_actual_handoffs(make_client,workers):
    client,requests=make_client(workers=workers)
    key=start(client);result=finish(client,key)
    assert result['status']=='COMPLETED',result['output']
    assert result['mode']=='live'
    assert len(result['agents'])==workers
    assert all(a['state']=='STANDBY' for a in result['agents'])
    events=client.get(f'/api/missions/{key}/events').json()
    assert 'PRIVATE_SENTINEL' not in json.dumps(events)
    assert 'local-test-key' not in json.dumps(events)
    plan=next(e for e in events if e['type']=='mission.plan_ready')['payload']['plan']
    assert plan['worker_count']==workers and plan['basis']=='openai_mission_plan'
    for i in range(1,workers):
        previous=result['tasks'][i-1]
        message=next(e for e in events if e['type']=='agent.message_sent' and e['payload']['sender']==previous['agent_id'] and e['payload'].get('message_type')=='INFORMATION_RESPONSE')
        assert message['payload']['data']==previous['output']
        assert message['payload']['data']['accepted'] is True
    assert {e['type'] for e in events} >= {'agent.observe','agent.plan','agent.act','agent.test','master.observe','master.plan','master.act','master.test'}
    assert len(requests)==3+workers*2
    idea=next(e for e in events if e['type']=='agent.message_sent' and e['payload'].get('message_type')=='IDEA')
    review_call=next(json.loads(r['input']) for r in requests if r['text']['format']['name']=='WorkerReview')
    assert idea['payload']['receiver']=='master'
    assert review_call['worker_approach']==idea['payload']['data']['public_plan']
    assert result['output']['worker_count']==workers
    assert all(task['output']['content'] in result['output']['content'] for task in result['tasks'])
    assert events[-1]['payload']['source']=='master'
    assert not client.app.state.runner.live_jobs


def test_worker_repeats_after_a_failed_test_and_observes_feedback(make_client):
    client,requests=make_client(revise=True)
    key=start(client);result=finish(client,key)
    assert result['status']=='COMPLETED'
    events=client.get(f'/api/missions/{key}/events').json()
    tests=[e for e in events if e['type']=='agent.test']
    assert [e['payload']['passed'] for e in tests]==[False,True]
    observations=[e['payload']['world'] for e in events if e['type']=='agent.observe']
    assert observations[0]['previous_attempt'] is None
    assert observations[1]['previous_attempt']['test_feedback']=='Add a clearer explanation and try again.'
    assert observations[1]['cycle']==2
    assert sum(e['type']=='agent.repeat' for e in events)==1
    accepted=next(e for e in events if e['type']=='agent.output_accepted')
    assert accepted['sequence']>tests[-1]['sequence']
    assert len(requests)==7


def test_cycle_limit_stops_without_publishing_a_final_result(make_client):
    client,_=make_client(revise=True)
    key=start(client,max_iterations=1);result=finish(client,key)
    assert result['status']=='AWAITING_LIMIT_APPROVAL'
    events=client.get(f'/api/missions/{key}/events').json()
    assert not any(e['type']=='mission.completed' for e in events)
    assert not any(e['type'] in ('task.failed','mission.failed') for e in events)


def test_tool_permission_violation_is_tested_then_replanned(make_client):
    client,_=make_client(blocked_tool=True)
    key=start(client);result=finish(client,key)
    assert result['status']=='COMPLETED'
    events=client.get(f'/api/missions/{key}/events').json()
    failed_test=next(e for e in events if e['type']=='agent.test')
    assert failed_test['payload']['passed'] is False
    assert failed_test['payload']['method']=='local tool validation'
    assert not any(e['type']=='agent.operation' and e['payload']['tool']=='calculate' for e in events)


@pytest.mark.parametrize('options',[{'bad_graph':True},{'workers':4}])
def test_invalid_or_over_limit_plan_never_creates_workers(make_client,options):
    client,_=make_client(**options)
    key=start(client,max_workers=2);result=finish(client,key)
    assert result['status']=='FAILED'
    assert result['agents']==[]


def test_cancel_inflight_call_releases_mission_admission(make_client):
    client,_=make_client(delay=10)
    key=start(client)
    time.sleep(.04)
    assert client.post('/api/missions',json={'prompt':'Another live mission','mode':'live'}).status_code==429
    assert client.post(f'/api/missions/{key}/cancel').status_code==200
    result=finish(client,key)
    assert result['status']=='CANCELLED'
    assert not client.app.state.runner.live_jobs
    assert not client.app.state.runner.jobs


def test_request_cap_prevents_additional_model_calls(make_client):
    client,requests=make_client()
    provider=client.app.state.runner.provider
    provider.limits=replace(provider.limits,max_calls=2)
    result=finish(client,start(client))
    assert result['status']=='AWAITING_LIMIT_APPROVAL'
    assert len(requests)==2
    assert result['output']['usage']['calls']==2


def test_spending_guard_rejects_request_before_it_is_sent():
    budget=RequestBudget(LiveLimits(budget_usd=.000001))
    with pytest.raises(LiveError):
        budget.reserve({'input':'Hello'},1000,.75,4.5)
    assert budget.calls==0


@pytest.mark.parametrize('expression',['__import__("os").system("whoami")','2**10000','True','1/0','10*1000000000000'])
def test_calculator_rejects_unpermitted_code_and_unbounded_values(expression):
    with pytest.raises(LiveError):
        calculate(expression)


def test_calculator_performs_actual_arithmetic():
    assert calculate('(68+75+81+92+84)/5')==80


def test_research_sources_pass_to_design_worker_and_final_report(make_client):
    client,requests=make_client(workers=2,research=True)
    result=finish(client,start(client,budget_usd=.20))
    assert result['status']=='COMPLETED',result['output']
    events=client.get(f'/api/missions/{result["id"]}/events').json()
    research=next(e for e in events if e['type']=='research.completed')
    assert research['payload']['sources']==[{'url':'https://example.org/study','title':'Tracking study'}]
    delivered=next(e for e in events if e['type']=='agent.message_sent' and e['payload'].get('message_type')=='INFORMATION_RESPONSE')['payload']['data']
    assert delivered['accepted'] and delivered['sources']==research['payload']['sources']
    assert delivered['citations'][0]['url']=='https://example.org/study'
    assert result['output']['sources']==delivered['sources']
    assert result['output']['usage']['web_search_calls']==1
    assert result['output']['usage']['estimated_cost_usd']>=.01
    assert len(requests)==8
    assert 'PRIVATE_SENTINEL' not in json.dumps(events)
    assert 'javascript:' not in json.dumps(events)


def test_web_search_fee_is_reserved_before_request():
    budget=RequestBudget(LiveLimits(),dollars=.01)
    with pytest.raises(LiveError,match='spending guard'):
        budget.reserve({'input':'Find studies'},1800,.75,4.5,tool_cost=.02,search_tokens=16000)
    assert budget.calls==0


def test_research_without_source_metadata_is_rejected(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    transport=httpx.MockTransport(lambda request:httpx.Response(200,json={'status':'completed',
        'usage':{'input_tokens':100,'output_tokens':100},'output':[{'type':'message','role':'assistant',
        'content':[{'type':'output_text','text':'An unsupported research claim.'}]}]}))
    provider=OpenAIProvider(transport)
    with pytest.raises(LiveError,match='no usable source-backed result'):
        asyncio.run(provider.research('Find studies',RequestBudget(provider.limits)))


def test_multiple_assistant_messages_are_separate_json_documents(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    final={'title':'Final study plan','content':'A proposed pilot.','limitations':['Requires field validation.']}
    def respond(request):
        return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':100,'output_tokens':100},
            'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':'Preparing the public artifact.'}]},
            {'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps(final)}]}]})
    provider=OpenAIProvider(httpx.MockTransport(respond))
    result,_=asyncio.run(provider.generate(FinalReport,'Public artifact',{'mission':'Design a pilot'},RequestBudget(provider.limits)))
    assert result.title=='Final study plan' and result.content=='A proposed pilot.'


def test_research_provider_failure_does_not_trigger_paid_retry_cycles(make_client):
    client,requests=make_client(research=True)
    attempts=[]
    async def fail(query,budget):
        attempts.append(query)
        raise LiveError('Provider research request was incomplete. No automatic paid retry was made.')
    client.app.state.runner.provider.research=fail
    key=start(client);result=finish(client,key)
    assert result['status']=='FAILED'
    events=client.get(f'/api/missions/{key}/events').json()
    assert len(attempts)==1 and len(requests)==2
    assert not any(e['type']=='agent.repeat' for e in events)


def test_duplicate_public_tool_items_are_counted_once(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    search={'id':'ws-1','type':'web_search_call','status':'completed','action':{'type':'search','query':'Studies','sources':[{'url':'https://example.org/paper','title':'Study'}]}}
    message={'id':'msg-1','type':'message','role':'assistant','content':[{'type':'output_text','text':'A cited evidence brief.'}]}
    transport=httpx.MockTransport(lambda request:httpx.Response(200,json={'status':'completed',
        'usage':{'input_tokens':100,'output_tokens':100},'output':[search,search,message,message]}))
    provider=OpenAIProvider(transport);budget=RequestBudget(provider.limits)
    artifact=asyncio.run(provider.research('Find studies',budget))
    assert budget.web_search_calls==1
    assert len(artifact['searches'])==1
    assert artifact['content']=='A cited evidence brief.'


def test_review_verdict_is_derived_from_individual_checks():
    from app.live_schemas import WorkerReview
    review=WorkerReview(checks=[{'criterion':'Contains source links','passed':True,'evidence':'Links are present.'},
        {'criterion':'Includes vegetation evidence','passed':False,'evidence':'Missing.'}],feedback='Add missing evidence.')
    assert review.passed is False
    assert 'passed' not in WorkerReview.model_json_schema()['properties']


def test_retry_keeps_accepted_outputs_and_prior_usage(make_client):
    client,requests=make_client(workers=2)
    provider=client.app.state.runner.provider;original=provider.generate;failed=[]
    async def once(schema,instructions,data,budget,**kwargs):
        if schema.__name__=='WorkerProposal' and data['assigned_task']=='Prepare aspect 2' and not failed:
            failed.append(True)
            raise LiveError('Simulated interrupted response.')
        return await original(schema,instructions,data,budget,**kwargs)
    provider.generate=once
    key=start(client);first=finish(client,key)
    assert first['status']=='FAILED'
    before=first['output']['usage']
    accepted=[task for task in first['tasks'] if task['status']=='COMPLETED']
    assert len(accepted)==1
    assert client.post(f'/api/missions/{key}/retry').status_code==200
    final=finish(client,key)
    assert final['status']=='COMPLETED',final['output']
    assert len(final['agents'])==2
    assert next(task for task in final['tasks'] if task['id']==accepted[0]['id'])['output']==accepted[0]['output']
    assert final['output']['usage']['calls']>before['calls']
    events=client.get(f'/api/missions/{key}/events').json()
    assert len([e for e in events if e['type']=='mission.plan_ready'])==1
    worker2=next(agent for agent in final['agents'] if agent['config']['name']=='Worker2')
    assert [e['payload']['cycle'] for e in events if e['type']=='agent.observe' and e['agent_id']==worker2['id']]==[1,2]
    assert client.post(f'/api/missions/{key}/retry').status_code==409


def test_retry_cannot_reset_a_worker_cycle_limit(make_client):
    client,_=make_client(workers=2)
    provider=client.app.state.runner.provider;original=provider.generate
    async def fail(schema,instructions,data,budget,**kwargs):
        if schema.__name__=='WorkerProposal' and data['assigned_task']=='Prepare aspect 2':
            raise LiveError('Simulated interrupted response.')
        return await original(schema,instructions,data,budget,**kwargs)
    provider.generate=fail
    key=start(client,max_iterations=1)
    assert finish(client,key)['status']=='FAILED'
    assert client.post(f'/api/missions/{key}/retry').status_code==409


def test_explicit_extension_keeps_prior_spending_and_logs_new_cycle_limit(make_client):
    client,_=make_client(workers=2)
    provider=client.app.state.runner.provider;original=provider.generate;failed=[]
    async def once(schema,instructions,data,budget,**kwargs):
        if schema.__name__=='WorkerProposal' and data['assigned_task']=='Prepare aspect 2' and not failed:
            failed.append(True)
            raise LiveError('Interrupted response.')
        return await original(schema,instructions,data,budget,**kwargs)
    provider.generate=once
    key=start(client,max_iterations=1);first=finish(client,key)
    assert client.post(f'/api/missions/{key}/retry').status_code==409
    assert client.post(f'/api/missions/{key}/retry?extend_cycles=true').status_code==200
    final=finish(client,key)
    assert final['status']=='COMPLETED',final['output']
    assert final['output']['usage']['calls']>first['output']['usage']['calls']
    events=client.get(f'/api/missions/{key}/events').json()
    extended=next(e for e in events if e['type']=='mission.limits_extended')
    assert extended['payload']['max_iterations']==3


@pytest.mark.parametrize('options',[{'master_help':True},{'worker_help':True}])
def test_explicit_help_requests_stop_without_guessing_or_looping(make_client,options):
    client,requests=make_client(**options)
    key=start(client);result=finish(client,key)
    events=client.get(f'/api/missions/{key}/events').json()
    if options.get('master_help'):
        assert result['status']=='AWAITING_CLARIFICATION'
        assert not result['agents'] and not result['tasks']
        assert len(requests)==1
        assert any(e['type']=='mission.clarification_requested' for e in events)
        assert not any(e['type'] in ('mission.failed','mission.plan_ready') for e in events)
        return
    assert result['status']=='FAILED'
    assert result['output']['stop_reason']=='help_needed'
    assert next(e for e in events if e['type']=='master.stopped')['payload']['outcome']=='help_needed'
    assert not any(e['type']=='mission.completed' for e in events)
    assert len(requests)==(1 if options.get('master_help') else 2)
    if options.get('worker_help'):
        assert next(e for e in events if e['type']=='agent.stopped')['payload']['outcome']=='help_needed'
        assert not any(e['type']=='agent.tool_started' for e in events)


def test_commander_repeats_monitors_and_verifies_actual_combined_result(make_client):
    client,requests=make_client(workers=2,revise=True)
    key=start(client);result=finish(client,key)
    assert result['status']=='COMPLETED'
    events=client.get(f'/api/missions/{key}/events').json()
    assert len([e for e in events if e['type']=='master.observe'])==3
    assert any(e['type']=='master.adjust' for e in events)
    assert any(e['type']=='master.repeat' for e in events)
    assert any(e['type']=='master.monitor' for e in events)
    intervention=next(e for e in events if e['type']=='master.intervention')
    receipt=next(e for e in events if e['type']=='agent.guidance_received')
    assert intervention['payload']['guidance_id'] in receipt['payload']['guidance_ids']
    whole=next(e for e in events if e['type']=='master.test' and e['payload'].get('scope')=='whole mission')
    assert whole['payload']['passed']
    assert whole['sequence']<next(e['sequence'] for e in events if e['type']=='mission.completed')
    review=next(json.loads(request['input']) for request in requests if request.get('text',{}).get('format',{}).get('name')=='WorkerReview' and json.loads(request['input'])['task']=='Verify the whole mission')
    assert review['artifact']['content']==result['output']['content']
    assert review['context']['mission']=='Explain the assigned educational topic.'
    assert len([e for e in events if e['type']=='agent.stopped' and e['payload']['outcome']=='completed'])==2


def test_passing_workers_do_not_override_a_failed_whole_mission_check(make_client):
    client,_=make_client(final_fail=True)
    key=start(client);result=finish(client,key)
    assert result['status']=='FAILED' and result['output']['stop_reason']=='help_needed'
    events=client.get(f'/api/missions/{key}/events').json()
    assert any(e['type']=='agent.stopped' and e['payload']['outcome']=='completed' for e in events)
    assert not any(e['type']=='mission.completed' for e in events)
    assert next(e for e in events if e['type']=='master.stopped')['payload']['outcome']=='help_needed'


@pytest.mark.parametrize('kind',['worker','commander','time'])
def test_limits_produce_explicit_stopping_outcomes(make_client,kind):
    client,_=make_client(revise=kind=='worker',delay=.1 if kind=='time' else 0)
    provider=client.app.state.runner.provider
    if kind=='commander':provider.limits=replace(provider.limits,master_steps=1)
    if kind=='time':provider.limits=replace(provider.limits,mission_timeout=.01)
    key=start(client,max_iterations=1);result=finish(client,key)
    assert result['status']=='AWAITING_LIMIT_APPROVAL'
    assert result['output']['stop_reason']=='limit_reached'
    events=client.get(f'/api/missions/{key}/events').json()
    assert any(e['type']=='mission.limit_approval_requested' for e in events)
    assert not any(e['type']=='mission.failed' for e in events)
    assert not any(e['type']=='mission.completed' for e in events)


def test_admin_guidance_is_recorded_then_read_by_the_assigned_worker(make_client):
    client,requests=make_client(workers=2,delay=.06)
    key=start(client)
    for _ in range(150):
        result=client.get(f'/api/missions/{key}').json()
        if len(result['agents'])==2:break
        time.sleep(.01)
    target=next(agent for agent in result['agents'] if agent['config']['name']=='Worker2')
    text='Include a concrete classroom example and explain its purpose.'
    response=client.post(f'/api/missions/{key}/agents/{target["id"]}/guidance',json={'instruction':text})
    assert response.status_code==201,response.text
    assert finish(client,key)['status']=='COMPLETED'
    events=client.get(f'/api/missions/{key}/events').json()
    receipt=next(e for e in events if e['type']=='agent.guidance_received' and e['agent_id']==target['id'])
    assert response.json()['id'] in receipt['payload']['guidance_ids']
    world=next(e['payload']['world'] for e in events if e['type']=='agent.observe' and e['agent_id']==target['id'])
    assert any(row['instruction']==text and row['source']=='admin' for row in world['commander_guidance'])
    assert client.post(f'/api/missions/{key}/agents/{target["id"]}/guidance',json={'instruction':text}).status_code==409


def test_guidance_arriving_during_check_forces_a_new_cycle_before_acceptance(make_client):
    from app.loop_control import guide
    from app.db import Task
    from sqlalchemy import select
    client,_=make_client();runner=client.app.state.runner;original=runner.provider.generate;sent=[]
    async def interrupt(schema,instructions,data,budget,**kwargs):
        result=await original(schema,instructions,data,budget,**kwargs)
        if schema.__name__=='WorkerReview' and data['task']!='Verify the whole mission' and not sent:
            key=next(iter(runner.jobs))
            with runner.sessions() as db:
                task=db.scalars(select(Task).where(Task.mission_id==key)).first()
                target=task.agent_id
            sent.append(guide(runner,key,target,'Add a concrete example before completing this task.',source='admin'))
        return result
    runner.provider.generate=interrupt
    key=start(client);result=finish(client,key)
    assert result['status']=='COMPLETED'
    events=client.get(f'/api/missions/{key}/events').json()
    tests=[e for e in events if e['type']=='agent.test']
    assert tests[0]['payload']['passed'] is False
    assert tests[-1]['payload']['passed'] is True
    accepted=next(e for e in events if e['type']=='agent.output_accepted')
    assert accepted['payload']['cycle']==2
    assert any(sent[0] in e['payload']['guidance_ids'] for e in events if e['type']=='agent.guidance_received')


def budget_pending(client,key):
    state=client.get(f'/api/missions/{key}/budget').json()
    return state,next(row for row in state['requests'] if row['status']=='pending')


def test_commander_budget_request_waits_for_admin_then_resumes_before_planning(make_client):
    client,requests=make_client()
    key=start(client,budget_usd=.01)
    stopped=finish(client,key)
    assert stopped['output']['stop_reason']=='limit_reached'
    assert stopped['output']['limit_info']['kind']=='spending'
    assert requests==[]
    state,pending=budget_pending(client,key)
    assert state['current_limit_usd']==.01
    assert pending['requires_admin_approval'] is True
    assert client.get(f'/api/missions/{key}').json()['status']=='AWAITING_LIMIT_APPROVAL'
    approved=client.post(f'/api/missions/{key}/budget/approve',json={'request_id':pending['id'],'new_limit_usd':.50,'resume':True})
    assert approved.status_code==200,approved.text
    _,report=wait_for_report(client,key)
    assert len(requests)==1  # Budget permission did not authorize the proposed team.
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.50}).status_code==200
    result=finish(client,key)
    assert result['status']=='COMPLETED',result['output']
    assert result['output']['usage']['budget_usd']==.50
    assert result['output']['usage']['calls']==len(requests)
    count=len(requests)
    assert client.post(f'/api/missions/{key}/budget/approve',json={'request_id':pending['id'],'new_limit_usd':1,'resume':True}).status_code==409
    assert len(requests)==count


def test_declining_or_only_approving_a_budget_never_starts_paid_work(make_client):
    client,requests=make_client()
    key=start(client,budget_usd=.01);finish(client,key)
    _,pending=budget_pending(client,key)
    declined=client.post(f'/api/missions/{key}/budget/deny',json={'request_id':pending['id']})
    assert declined.status_code==200
    assert requests==[]
    assert client.get(f'/api/missions/{key}/budget').json()['current_limit_usd']==.01
    proposed=client.post(f'/api/missions/{key}/budget/request',json={})
    assert proposed.status_code==201
    assert requests==[]
    approved=client.post(f'/api/missions/{key}/budget/approve',json={'request_id':proposed.json()['id'],'new_limit_usd':.50,'resume':False})
    assert approved.status_code==200
    assert requests==[]
    assert client.get(f'/api/missions/{key}').json()['status']=='AWAITING_LIMIT_APPROVAL'
    assert client.get(f'/api/missions/{key}/budget').json()['current_limit_usd']==.50
    assert client.post(f'/api/missions/{key}/retry').status_code==200
    _,report=wait_for_report(client,key)
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.50}).status_code==200
    assert finish(client,key)['status']=='COMPLETED'


@pytest.mark.parametrize('stage',['tool','review','master'])
def test_budget_approval_resumes_the_blocked_stage_without_repeating_completed_work(make_client,stage):
    from app.provider import SpendingApprovalRequired
    client,requests=make_client(research=stage=='tool');provider=client.app.state.runner.provider
    original=provider.generate;original_research=provider.research;blocked=[]
    async def generate(schema,instructions,data,budget,**kwargs):
        should_block=schema.__name__=='WorkerReview' and (data['task']=='Verify the whole mission')==(stage=='master')
        if stage!='tool' and should_block and not blocked:
            blocked.append(True);raise SpendingApprovalRequired(budget.limit_usd,.15)
        return await original(schema,instructions,data,budget,**kwargs)
    async def research(query,budget):
        if not blocked:
            blocked.append(True);raise SpendingApprovalRequired(budget.limit_usd,.15)
        return await original_research(query,budget)
    provider.generate=generate
    if stage=='tool':provider.research=research
    key=start(client,max_iterations=1)
    first=finish(client,key);assert first['status']=='AWAITING_LIMIT_APPROVAL'
    before=first['output']['usage']
    _,pending=budget_pending(client,key)
    response=client.post(f'/api/missions/{key}/budget/approve',json={'request_id':pending['id'],'new_limit_usd':.50,'resume':True})
    assert response.status_code==200,response.text
    final=finish(client,key)
    assert final['status']=='COMPLETED',final['output']
    assert final['output']['usage']['estimated_cost_usd']>=before['estimated_cost_usd']
    assert final['output']['usage']['calls']==len(requests)
    assert len([r for r in requests if r.get('text',{}).get('format',{}).get('name')=='WorkerProposal'])==1
    events=client.get(f'/api/missions/{key}/events').json()
    assert len([e for e in events if e['type']=='agent.act'])==1
    assert max(e['payload']['cycle'] for e in events if e['type']=='agent.observe')==1
    assert not any(e['type']=='mission.limits_extended' for e in events)
    if stage=='review':assert any(e['type']=='agent.check_resumed' for e in events)
    assert final['output']['usage']['budget_usd']==.50


def test_approval_enforces_ceiling_pending_id_and_current_limit(make_client):
    client,requests=make_client();provider=client.app.state.runner.provider
    provider.limits=replace(provider.limits,max_budget_usd=.30)
    key=start(client,budget_usd=.01);finish(client,key)
    _,pending=budget_pending(client,key)
    for amount in [.005,.01,.50]:
        assert client.post(f'/api/missions/{key}/budget/approve',json={'request_id':pending['id'],'new_limit_usd':amount}).status_code==422
    assert client.post(f'/api/missions/{key}/budget/approve',json={'request_id':'made-up','new_limit_usd':.20}).status_code==409
    assert client.post('/api/missions',json={'prompt':'An educational mission','mode':'live','budget_usd':.50,'open_ended':False}).status_code==422
    assert requests==[]


def test_budget_increase_does_not_reset_other_guards(make_client):
    from app.db import Mission
    client,_=make_client()
    key=start(client,budget_usd=.01);finish(client,key)
    _,pending=budget_pending(client,key)
    with client.app.state.sessions() as db:
        mission=db.get(Mission,key)
        mission.output={**mission.output,'usage':{**mission.output['usage'],'calls':24}}
        db.commit()
    response=client.post(f'/api/missions/{key}/budget/approve',json={'request_id':pending['id'],'new_limit_usd':.50,'resume':True})
    assert response.status_code==409
    assert client.get(f'/api/missions/{key}/budget').json()['current_limit_usd']==.01
    response=client.post(f'/api/missions/{key}/budget/approve',json={'request_id':pending['id'],'new_limit_usd':.50,'resume':False})
    assert response.status_code==200
    assert client.get(f'/api/missions/{key}').json()['output']['usage']['calls']==24
    assert client.post(f'/api/missions/{key}/retry').status_code==409


def test_master_reviews_improves_and_approves_before_delivery(make_client):
    client,requests=make_client(final_revise=True)
    key=start(client);result=finish(client,key)
    assert result['status']=='COMPLETED',result['output']
    events=client.get(f'/api/missions/{key}/events').json()
    types=[e['type'] for e in events]
    assert types.index('agent.review_requested')<types.index('master.review_completed')<types.index('task.completed')
    assert types.count('master.improved')==2
    assert types.index('master.improved')<types.index('master.final_approved')<types.index('mission.completed')
    assert result['output']['master_approved'] is True
    assert result['tasks'][0]['output']['master_approved'] is True
    reports=[json.loads(r['input']) for r in requests if r['text']['format']['name']=='FinalReport']
    assert len(reports)==2 and reports[1]['review_feedback']
    assert result['output']['content'].startswith('Master improved answer.')
    reviews=[e for e in events if e['type']=='master.test' and e['payload'].get('scope')=='whole mission']
    assert [e['payload']['passed'] for e in reviews]==[False,True]


def test_eight_workers_can_be_planned_without_bypassing_final_approval(make_client):
    client,_=make_client(workers=8)
    result=finish(client,start(client,max_workers=8,budget_usd=1))
    assert result['status']=='COMPLETED',result['output']
    assert len(result['agents'])==8
    assert result['output']['master_approved'] is True


def test_chosen_worker_names_apply_before_creation_without_replanning(make_client):
    client,requests=make_client(workers=2)
    key=start(client,approve_plan=False)
    _,report=wait_for_report(client,key)
    ids=report['payload']['agent_ids'];names={ids[0]:'  الباحث سالم  ',ids[1]:'My Editor'}
    approved=client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.5,'worker_names':names})
    assert approved.status_code==200,approved.text
    result=finish(client,key)
    assert result['status']=='COMPLETED',result['output']
    assert [a['config']['name'] for a in result['agents']]==['الباحث سالم','My Editor']
    assert {a['id'] for a in result['agents']}==set(ids)
    assert len(requests)==7
    assert sum(r['text']['format']['name']=='LiveMissionPlan' for r in requests)==1
    events=client.get(f'/api/missions/{key}/events').json()
    updated=[e for e in events if e['type']=='mission.plan_ready'][-1]['payload']['plan']
    assert updated['assignments'][1]['waits_for']==['الباحث سالم']
    assert updated['assignments'][0]['sends_to']==['My Editor']
    original=next(e for e in events if e['id']==report['id'])
    assert original['payload']['worker_plan']['tasks'][0]['name']=='Worker1'


@pytest.mark.parametrize('values',[['Same','same'],['','Second'],['A'*61,'Second'],['First\nName','Second'],['Ａ','A']])
def test_invalid_names_keep_plan_pending_and_never_start_workers(make_client,values):
    client,requests=make_client(workers=2)
    key=start(client,approve_plan=False);_,report=wait_for_report(client,key)
    names=dict(zip(report['payload']['agent_ids'],values))
    response=client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.5,'worker_names':names})
    assert response.status_code==422
    result=client.get(f'/api/missions/{key}').json()
    assert result['status']=='AWAITING_APPROVAL' and not result['agents']
    assert len(requests)==1


def test_worker_names_must_belong_to_the_saved_plan(make_client):
    client,requests=make_client();key=start(client,approve_plan=False);_,report=wait_for_report(client,key)
    response=client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.5,'worker_names':{'unknown':'My Name'}})
    assert response.status_code==422 and len(requests)==1


def test_renaming_an_existing_worker_is_persisted_without_new_model_calls(make_client):
    client,requests=make_client(workers=2)
    key=start(client);result=finish(client,key);count=len(requests)
    agent=result['agents'][0]
    response=client.patch(f'/api/missions/{key}/agents/{agent["id"]}/name',json={'name':'  الباحث أحمد  '})
    assert response.status_code==200,response.text
    assert response.json()['event']['type']=='agent.renamed'
    assert response.json()['name']=='الباحث أحمد'
    saved=client.get(f'/api/missions/{key}').json()
    renamed=next(a for a in saved['agents'] if a['id']==agent['id'])
    assert renamed['config']=={**agent['config'],'name':'الباحث أحمد'}
    assert saved['tasks']==result['tasks'] and saved['output']==result['output']
    assert len(requests)==count
    assert client.patch(f'/api/missions/{key}/agents/{agent["id"]}/name',json={'name':'worker2'}).status_code==422
    assert client.patch(f'/api/missions/{key}/agents/unknown/name',json={'name':'Someone'}).status_code==404


def approve_waiting_limit(client,key):
    state=client.get(f'/api/missions/{key}/limits').json();pending=state['pending']
    assert pending and state['mission_status']=='AWAITING_LIMIT_APPROVAL'
    response=client.post(f'/api/missions/{key}/limits/approve',json={'request_id':pending['id'],'new_limit':pending['recommended_limit']})
    assert response.status_code==200,response.text
    return pending


def test_cycle_holds_can_be_approved_repeatedly_without_recreating_the_mission(make_client):
    client,requests=make_client();provider=client.app.state.runner.provider;original=provider.generate
    async def needs_six(schema,instructions,data,budget,**kwargs):
        result=await original(schema,instructions,data,budget,**kwargs)
        if schema.__name__=='WorkerReview' and data['task']!='Verify the whole mission':
            for check in result[0].checks:check.passed=data['context']['cycle']>=6
        return result
    provider.generate=needs_six
    key=start(client,max_iterations=1,budget_usd=1);held=finish(client,key)
    ids=[a['id'] for a in held['agents']];count=len(requests)
    assert held['status']=='AWAITING_LIMIT_APPROVAL'
    assert all(t['status']=='WAITING_LIMIT' for t in held['tasks'])
    assert client.post(f'/api/missions/{key}/resume').status_code==409
    assert client.post(f'/api/missions/{key}/retry').status_code==409
    time.sleep(.03);assert len(requests)==count
    usage=held['output']['usage']['calls'];approved=[]
    while held['status']=='AWAITING_LIMIT_APPROVAL':
        approved.append(approve_waiting_limit(client,key)['recommended_limit'])
        held=finish(client,key)
        assert [a['id'] for a in held['agents']]==ids
        assert held['output']['usage']['calls']>=usage;usage=held['output']['usage']['calls']
        assert len(approved)<=4
    assert held['status']=='COMPLETED',held['output']
    assert approved==[3,5,7]
    events=client.get(f'/api/missions/{key}/events').json()
    assert not any(e['type'] in ('mission.failed','task.failed','agent.cancelled') for e in events)
    assert len([e for e in events if e['type']=='agent.created'])==1


def test_call_hold_reuses_the_saved_worker_draft_after_approval(make_client):
    client,requests=make_client();provider=client.app.state.runner.provider
    provider.limits=replace(provider.limits,max_calls=2)
    key=start(client,budget_usd=1);held=finish(client,key)
    assert held['status']=='AWAITING_LIMIT_APPROVAL'
    assert held['output']['limit_info']['kind']=='calls'
    approve_waiting_limit(client,key)
    final=finish(client,key);assert final['status']=='COMPLETED',final['output']
    assert len([r for r in requests if r['text']['format']['name']=='WorkerProposal'])==1
    assert final['output']['usage']['calls']==len(requests)


def test_defer_keeps_the_mission_paused_and_rejects_stale_or_invalid_grants(make_client):
    client,requests=make_client(revise=True);key=start(client,max_iterations=1);finish(client,key)
    state=client.get(f'/api/missions/{key}/limits').json();pending=state['pending'];count=len(requests)
    for value in [1,1.5,pending['ceiling']+1]:
        assert client.post(f'/api/missions/{key}/limits/approve',json={'request_id':pending['id'],'new_limit':value}).status_code==422
    assert client.post(f'/api/missions/{key}/limits/decline',json={'request_id':pending['id']}).status_code==200
    assert client.get(f'/api/missions/{key}').json()['status']=='AWAITING_LIMIT_APPROVAL'
    assert client.post(f'/api/missions/{key}/limits/approve',json={'request_id':pending['id'],'new_limit':3}).status_code==409
    assert len(requests)==count
    assert client.post(f'/api/missions/{key}/limits/request').status_code==200
    approve_waiting_limit(client,key)
    assert finish(client,key)['status']=='COMPLETED'


def test_waiting_limit_survives_restart_without_calls_or_failed_tasks(make_client):
    client,requests=make_client(revise=True);key=start(client,max_iterations=1);finish(client,key);count=len(requests)
    original=client.get(f'/api/missions/{key}/limits').json()['pending']
    app=create_app(str(client.app.state.sessions.kw['bind'].url),delay=0,provider=client.app.state.runner.provider)
    with TestClient(app) as restarted:
        assert restarted.get(f'/api/missions/{key}').json()['status']=='AWAITING_LIMIT_APPROVAL'
        assert restarted.get(f'/api/missions/{key}/limits').json()['pending']['id']==original['id']
        assert len(requests)==count


def test_token_hold_continues_from_saved_draft_and_retains_usage(make_client):
    from app.provider import LimitReached
    client,requests=make_client();provider=client.app.state.runner.provider;original=provider.generate;blocked=[]
    async def once(schema,instructions,data,budget,**kwargs):
        if schema.__name__=='WorkerReview' and not blocked:
            blocked.append(True);raise LimitReached('More tokens required.','tokens',200000)
        return await original(schema,instructions,data,budget,**kwargs)
    provider.generate=once;key=start(client,budget_usd=1);held=finish(client,key)
    assert held['output']['limit_info']['kind']=='tokens'
    before=held['output']['usage']['calls'];approve_waiting_limit(client,key)
    result=finish(client,key)
    assert result['status']=='COMPLETED'
    assert result['output']['usage']['calls']>before
    assert len([r for r in requests if r['text']['format']['name']=='WorkerProposal'])==1


def test_limit_approval_before_planning_still_requires_team_consent(make_client):
    client,requests=make_client();key=start(client,budget_usd=.01)
    assert finish(client,key)['status']=='AWAITING_LIMIT_APPROVAL'
    approve_waiting_limit(client,key)
    _,report=wait_for_report(client,key)
    assert len(requests)==1
    assert client.get(f'/api/missions/{key}').json()['agents']==[]
    assert report['type']=='mission.plan_approval_requested'


def test_cancelling_a_limit_hold_is_explicit_and_cancels_pending_workers(make_client):
    client,requests=make_client(revise=True);key=start(client,max_iterations=1);finish(client,key);count=len(requests)
    assert client.post(f'/api/missions/{key}/cancel').status_code==200
    result=finish(client,key)
    assert result['status']=='CANCELLED'
    assert result['agents'][0]['state']=='CANCELLED'
    assert result['tasks'][0]['status']=='CANCELLED' and len(requests)==count


def test_open_execution_has_no_resource_caps_but_retains_cost_accounting(make_client):
    client,requests=make_client(revise=True,delay=.02);provider=client.app.state.runner.provider
    provider.limits=replace(provider.limits,max_calls=1,token_budget=1,max_iterations=1,master_steps=1,mission_timeout=.001)
    key=start(client,open_ended=True,budget_usd=.01,max_iterations=1)
    result=finish(client,key)
    assert result['status']=='COMPLETED',result['output']
    assert result['output']['usage']['open_ended'] is True
    assert result['output']['usage']['budget_usd'] is None
    assert result['output']['usage']['calls']==len(requests)>1
    assert result['output']['usage']['reported_tokens']>1
    assert result['output']['usage']['estimated_cost_usd']>0
    events=client.get(f'/api/missions/{key}/events').json()
    assert not any(e['type']=='mission.limit_approval_requested' for e in events)
    assert max(e['payload']['cycle'] for e in events if e['type']=='agent.observe')==2


def test_new_live_missions_are_open_by_default(make_client):
    client,_=make_client()
    response=client.post('/api/missions',json={'prompt':'Explain a short educational topic.','mode':'live','budget_usd':.01})
    key=response.json()['id'];_,report=wait_for_report(client,key)
    assert report['payload']['estimate']['open_ended'] is True
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.01}).status_code==200
    assert finish(client,key)['status']=='COMPLETED'


def test_open_continuation_recovers_from_a_saved_help_proposal_without_repeating_it(make_client):
    client,requests=make_client(worker_help=True);provider=client.app.state.runner.provider
    key=start(client);first=finish(client,key)
    assert first['status']=='FAILED' and first['output']['stop_reason']=='help_needed'
    ids=[a['id'] for a in first['agents']];before=first['output']['usage']['calls']
    transport,continued_requests=mock_transport();provider.transport=transport
    response=client.post(f'/api/missions/{key}/execution/open')
    assert response.status_code==200,response.text
    result=finish(client,key)
    assert result['status']=='COMPLETED',result['output']
    assert [a['id'] for a in result['agents']]==ids
    assert result['output']['usage']['calls']==before+len(continued_requests)
    assert client.get(f'/api/missions/{key}/limits').json()['open_ended'] is True


def test_open_master_revises_beyond_two_drafts_until_approved(make_client):
    client,requests=make_client();provider=client.app.state.runner.provider;original=provider.generate
    async def three_reviews(schema,instructions,data,budget,**kwargs):
        result=await original(schema,instructions,data,budget,**kwargs)
        if schema.__name__=='WorkerReview' and data['task']=='Verify the whole mission':
            count=sum(r['text']['format']['name']=='FinalReport' for r in requests)
            for check in result[0].checks:check.passed=count>=3
        return result
    provider.generate=three_reviews
    result=finish(client,start(client,open_ended=True))
    assert result['status']=='COMPLETED'
    assert sum(r['text']['format']['name']=='FinalReport' for r in requests)==3


def test_open_provider_recovers_from_connection_errors_and_keeps_uncertain_usage(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    attempts=[];delays=[]
    async def no_wait(seconds):delays.append(seconds)
    monkeypatch.setattr('app.provider.asyncio.sleep',no_wait)
    def respond(request):
        attempts.append(request)
        if len(attempts)<3:raise httpx.ConnectError('Temporary disconnect',request=request)
        return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':100,'output_tokens':100},'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps({'title':'Recovered','content':'Saved work continues.','limitations':[]})}]}]})
    provider=OpenAIProvider(httpx.MockTransport(respond));budget=RequestBudget(provider.limits,.01,open_ended=True)
    notices=[];budget.on_retry=lambda delay,attempt:notices.append((delay,attempt))
    result,_=asyncio.run(provider.generate(FinalReport,'Produce a public answer',{'mission':'Explain DNS'},budget))
    assert result.title=='Recovered'
    assert delays==[5,10] and notices==[(5,1),(10,2)]
    assert budget.calls==3 and budget.uncertain_requests==2 and budget.cost>0


def test_workspace_answer_is_saved_once_without_calls_and_reaches_resumed_worker(make_client):
    client,requests=make_client(worker_help=True)
    key=start(client);result=finish(client,key)
    assert result['status']=='FAILED'
    events=client.get(f'/api/missions/{key}/events').json()
    question=next(e for e in events if e['type']=='agent.message_sent' and e['payload'].get('message_type')=='HELP_REQUEST')
    endpoint=f"/api/missions/{key}/questions/{question['id']}/answer"
    count=len(requests)
    remote=TestClient(client.app,client=('203.0.113.10',5000))
    assert remote.post(endpoint,json={'instruction':'Answer'}).status_code==403
    assert client.post(endpoint,json={'instruction':'   '}).status_code==422
    response=client.post(endpoint,json={'instruction':'The audience is first-year students.'})
    assert response.status_code==201,response.text
    assert client.post(endpoint,json={'instruction':'The audience is first-year students.'}).json()['id']==response.json()['id']
    assert len(requests)==count
    assert client.get(f'/api/missions/{key}').json()['status']=='FAILED'
    saved=client.get(f'/api/missions/{key}/events').json()
    assert len([e for e in saved if e['type']=='workspace.question_answered'])==1
    assert len([e for e in saved if e['type']=='commander.instruction' and e['payload'].get('question_id')==question['id']])==1
    assert client.post(f"/api/missions/{key}/questions/{events[0]['id']}/answer",json={'instruction':'Answer'}).status_code==404
    other=start(client,approve_plan=False)
    wait_for_report(client,other)
    assert client.post(f"/api/missions/{other}/questions/{question['id']}/answer",json={'instruction':'Answer'}).status_code==404
    transport,continued=mock_transport();client.app.state.runner.provider.transport=transport
    assert client.post(f'/api/missions/{key}/execution/open').status_code==200
    assert finish(client,key)['status']=='COMPLETED'
    world=next(json.loads(r['input']) for r in continued if r['text']['format']['name']=='WorkerProposal')
    assert any(g['instruction']=='The audience is first-year students.' for g in world['commander_guidance'])


def test_master_clarifies_twice_before_team_plan_and_preserves_answers_through_delivery(make_client):
    client,requests=make_client(master_help_rounds=2)
    key=start(client)
    first=finish(client,key)
    assert first['status']=='AWAITING_CLARIFICATION' and not first['agents'] and not first['tasks']
    events=client.get(f'/api/missions/{key}/events').json()
    q1=next(e for e in events if e['type']=='mission.clarification_requested')
    url1=f"/api/missions/{key}/clarifications/{q1['id']}/answer"
    assert client.post(url1,json={'answer':'   '}).status_code==422
    remote=TestClient(client.app,client=('203.0.113.10',5000))
    assert remote.post(url1,json={'answer':'Data'}).status_code==403
    assert len(requests)==1
    response=client.post(url1,json={'answer':'Use scores 68, 75, 81, 92, 84.'})
    assert response.status_code==200,response.text
    second=finish(client,key)
    assert second['status']=='AWAITING_CLARIFICATION' and not second['agents'] and not second['tasks']
    events=client.get(f'/api/missions/{key}/events').json()
    q2=next(e for e in reversed(events) if e['type']=='mission.clarification_requested')
    assert q2['id']!=q1['id'] and len(requests)==2
    assert json.loads(requests[1]['input'])['clarification_history']==[{'question':q1['payload']['question'],'answer':'Use scores 68, 75, 81, 92, 84.'}]
    assert client.post(url1,json={'answer':'Repeated request'}).json()['already_answered'] is True
    assert len(requests)==2
    stream=client.get(f'/api/missions/{key}/stream')
    assert stream.status_code==200 and 'mission.clarification_requested' in stream.text
    response=client.post(f"/api/missions/{key}/clarifications/{q2['id']}/answer",json={'answer':'Write for first-year students.'})
    assert response.status_code==200,response.text
    mission,report=wait_for_report(client,key)
    assert not mission['agents'] and not mission['tasks'] and len(requests)==3
    assert report['payload']['estimate']['planning_usage']['calls']==3
    history=json.loads(requests[2]['input'])['clarification_history']
    assert len(history)==2 and history[-1]['answer']=='Write for first-year students.'
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.1}).status_code==200
    final=finish(client,key)
    assert final['status']=='COMPLETED',final['output']
    assert final['prompt']=='Explain the assigned educational topic.'
    worker=next(json.loads(r['input']) for r in requests if r['text']['format']['name']=='WorkerProposal')
    assert 'Use scores 68, 75, 81, 92, 84.' in worker['mission']
    assert 'Write for first-year students.' in worker['mission']
    editor=next(json.loads(r['input']) for r in requests if r['text']['format']['name']=='FinalReport')
    assert 'Write for first-year students.' in editor['mission']
    events=client.get(f'/api/missions/{key}/events').json()
    understood=next(e for e in events if e['type']=='master.mission_understood')
    assert understood['payload']['clarifications_used']==2
    assert understood['sequence']<next(e['sequence'] for e in events if e['type']=='mission.plan_ready')
    assert final['output']['usage']['calls']==len(requests)
    before=len(requests)
    assert client.post(url1,json={'answer':'Duplicate after completion'}).json()['already_answered']
    assert len(requests)==before


def test_pending_master_clarification_survives_reload_and_can_be_cancelled(make_client):
    client,requests=make_client(master_help=True)
    key=start(client);mission=finish(client,key)
    assert mission['status']=='AWAITING_CLARIFICATION'
    events=client.get(f'/api/missions/{key}/events').json()
    question=next(e for e in events if e['type']=='mission.clarification_requested')
    count=len(requests)
    restart_transport,restarted_calls=mock_transport()
    restarted=create_app(str(client.app.state.sessions.kw['bind'].url),delay=0,provider=OpenAIProvider(transport=restart_transport))
    with TestClient(restarted) as reopened:
        assert reopened.get(f'/api/missions/{key}').json()['status']=='AWAITING_CLARIFICATION'
        assert reopened.get(f'/api/missions/{key}/events').json()[-1]['id']==question['id']
        assert not restarted_calls
    for _ in range(2):
        assert client.get(f'/api/missions/{key}').json()['status']=='AWAITING_CLARIFICATION'
        assert client.get(f'/api/missions/{key}/events').json()[-1]['id']==question['id']
    assert len(requests)==count
    assert client.post(f'/api/missions/{key}/resume').status_code==409
    assert client.post(f'/api/missions/{key}/cancel').status_code==200
    assert client.post(f"/api/missions/{key}/clarifications/{question['id']}/answer",json={'answer':'Too late'}).status_code==409
    assert len(requests)==count and not client.get(f'/api/missions/{key}').json()['agents']
