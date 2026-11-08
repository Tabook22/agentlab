import asyncio
import json
import time
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.db import Base, Agent, Event
from app.main import create_app
from app.engine import transition


@pytest.fixture
def client(tmp_path):
    app = create_app(f'sqlite:///{tmp_path / "test.db"}', delay=0.01)
    engine = app.state.sessions.kw['bind']
    Base.metadata.create_all(engine)
    with TestClient(app) as client:
        yield client


def launch(client, scenario='weather'):
    response = client.post('/api/missions', json={'prompt': 'A classroom experiment', 'scenario': scenario})
    assert response.status_code == 201
    return response.json()['id']


def finished(client, key):
    for _ in range(200):
        result = client.get(f'/api/missions/{key}').json()
        if result['status'] in ('COMPLETED', 'FAILED', 'CANCELLED'):
            return result
        time.sleep(.01)
    pytest.fail('Mission did not finish')


@pytest.mark.parametrize('scenario', ['weather', 'data', 'concepts', 'failure'])
def test_complete_mission_and_recoverable_events(client, scenario):
    key = launch(client, scenario)
    result = finished(client, key)
    assert result['status'] == 'COMPLETED'
    assert all(a['state'] == 'STANDBY' for a in result['agents'])
    events = client.get(f'/api/missions/{key}/events').json()
    assert [e['sequence'] for e in events] == list(range(1,len(events)+1))
    assert events[-1]['payload']['output'] == result['output']
    completed = {}
    for event in events:
        if event['type'] == 'task.completed':
            completed[event['task_id']] = event['sequence']
        if event['type'] == 'task.assigned':
            task = next(t for t in result['tasks'] if t['id'] == event['task_id'])
            assert all(completed[dep] < event['sequence'] for dep in task['dependencies'])
    messages = [e for e in events if e['type'] == 'agent.message_sent' and e['payload']['message_type']=='INFORMATION_RESPONSE']
    assert len(messages) == len(result['tasks'])-1
    assert all(m['payload']['delivery_status'] == 'DELIVERED' for m in messages)
    recovered = client.get(f'/api/missions/{key}/events?after=5').json()
    assert recovered == events[5:]
    with client.stream('GET', f'/api/missions/{key}/stream', headers={'Last-Event-ID':'5'}) as response:
        data = [json.loads(line[6:]) for line in response.iter_lines() if line.startswith('data: ')]
    assert data == recovered
    if scenario == 'failure':
        assert sum(e['type'] == 'task.failed' for e in events) == 1
        assert sum(e['type'] == 'task.retry_requested' for e in events) == 1
    if scenario == 'data':
        assert result['output']['mean'] == 80
    if scenario in ('weather', 'failure', 'data'):
        assert result['output']['verified'] is True


def test_state_machine():
    agent = Agent(state='CREATED')
    with pytest.raises(ValueError):
        transition(agent, 'RUNNING')
    for state in ['READY','ASSIGNED','RUNNING','FAILED','ASSIGNED','RUNNING','COMPLETED','STANDBY','TERMINATED']:
        transition(agent, state)
    with pytest.raises(ValueError):
        transition(agent, 'READY')


def test_plan_validation_and_tool_allowlist():
    from app.schemas import TaskPlan, AgentConfiguration
    with pytest.raises(ValueError):
        TaskPlan(tasks=[{'name':'Bad', 'role':'Test', 'title':'Cycle', 'dependencies':[0]}])
    with pytest.raises(ValueError):
        AgentConfiguration(name='Bad', role='Test', instructions='Run shell', tools=['shell'], created_at='now')


def test_admission_limit(client):
    client.app.state.runner.delay = 10
    keys = [launch(client) for _ in range(4)]
    assert client.post('/api/missions', json={'prompt':'One too many'}).status_code == 429
    for key in keys:
        assert client.post(f'/api/missions/{key}/cancel').status_code == 200
    assert not client.app.state.runner.jobs


def test_observable_calculation_and_exact_data_lineage(client):
    key = launch(client, 'data')
    mission = finished(client, key)
    events = client.get(f'/api/missions/{key}/events').json()
    agents = {a['config']['name']: a['id'] for a in mission['agents']}
    previous = None
    for name in ('Pixel', 'Nova', 'Scout'):
        own = [e for e in events if e['agent_id'] == agents[name]]
        incoming = next(e for e in own if e['type'] == 'agent.input_received')
        operations = [e for e in own if e['type'] == 'agent.operation']
        output = next(e for e in own if e['type'] == 'agent.tool_completed')
        assert incoming['sequence'] < operations[0]['sequence'] < output['sequence']
        assert output['payload']['output'] == operations[-1]['payload']['value']
        if previous:
            handoff = next(e for e in own if e['type'] == 'agent.message_sent')
            assert previous['payload']['output'] == handoff['payload']['data'] == incoming['payload']['input']
            assert previous['sequence'] < handoff['sequence'] < incoming['sequence']
        previous = output
    nova = [e['payload'] for e in events if e['agent_id'] == agents['Nova'] and e['type'] == 'agent.operation']
    assert [step['operation'] for step in nova] == ['Add scores', 'Count values', 'Calculate average']
    assert nova[0]['value']['sum'] == 400
    assert nova[1]['value']['count'] == 5
    assert nova[2]['value']['mean'] == 80
    assert mission['output']['checks'] == [{'check':'Recalculated average: 80', 'passed':True}]


def test_pause_resume_and_cancel_cleanup(client):
    client.app.state.runner.delay = .08
    key = launch(client)
    time.sleep(.02)
    assert client.post(f'/api/missions/{key}/pause').status_code == 200
    time.sleep(.1)
    before = client.get(f'/api/missions/{key}/events').json()
    time.sleep(.12)
    assert client.get(f'/api/missions/{key}/events').json() == before
    assert client.post(f'/api/missions/{key}/resume').status_code == 200
    assert client.post(f'/api/missions/{key}/cancel').status_code == 200
    time.sleep(.2)
    result = client.get(f'/api/missions/{key}').json()
    assert result['status'] == 'CANCELLED'
    assert all(a['state'] in ('CANCELLED','STANDBY') for a in result['agents'])
    assert all(t['status'] in ('COMPLETED','CANCELLED') for t in result['tasks'])
    assert not client.app.state.runner.jobs
    assert client.post(f'/api/missions/{key}/resume').status_code == 409


def test_input_validation_and_missing_missions(client):
    assert client.post('/api/missions', json={'prompt':'hey'}).status_code == 422
    assert client.post('/api/missions', json={'prompt':'     '}).status_code == 422
    assert client.post('/api/missions', json={'prompt':'Explain agents','mode':'unsupported'}).status_code == 422
    assert client.post('/api/missions', json={'prompt':'Explain agents','scenario':'shell'}).status_code == 422
    assert client.get('/api/missions/missing').status_code == 404
    assert client.get('/api/missions/missing/stream').status_code == 404


def test_history_edit_trash_and_restore_preserve_execution(client):
    key=launch(client)
    original=finished(client,key)
    recorded=client.get(f'/api/missions/{key}/events').json()
    edited=client.patch(f'/api/missions/{key}',json={'title':'My weather study','notes':'Compare this result next week.'})
    assert edited.status_code==200
    assert edited.json()['prompt']==original['prompt']
    row=next(m for m in client.get('/api/missions').json() if m['id']==key)
    assert row['history']=={'title':'My weather study','notes':'Compare this result next week.','deleted':False}
    assert client.delete(f'/api/missions/{key}').status_code==200
    assert key not in [m['id'] for m in client.get('/api/missions').json()]
    assert key in [m['id'] for m in client.get('/api/missions?trashed=true').json()]
    for path in [f'/api/missions/{key}',f'/api/missions/{key}/events',f'/api/missions/{key}/stream']:
        assert client.get(path).status_code==404
    assert client.patch(f'/api/missions/{key}',json={'title':'Hidden','notes':''}).status_code==404
    assert client.post(f'/api/missions/{key}/restore').status_code==200
    restored=client.get(f'/api/missions/{key}').json()
    assert restored['prompt']==original['prompt']
    assert restored['output']==original['output']
    assert restored['tasks']==original['tasks']
    assert restored['agents']==original['agents']
    events=client.get(f'/api/missions/{key}/events').json()
    assert events[:len(recorded)]==recorded
    assert client.get('/api/missions?trashed=true').json()==[]


def test_history_rejects_active_changes_and_invalid_details(client):
    from app.db import Mission
    # A paused mission stays active and cannot be hidden from the admin.
    with client.app.state.sessions() as db:
        mission=Mission(prompt='A paused test mission',scenario='weather',status='PAUSED')
        db.add(mission);db.commit();key=mission.id
    assert client.patch(f'/api/missions/{key}',json={'title':'New name'}).status_code==409
    assert client.delete(f'/api/missions/{key}').status_code==409
    completed=launch(client);finished(client,completed)
    for body in [{'title':' '},{'title':'x'*201},{'title':'Okay','notes':'x'*2001}]:
        assert client.patch(f'/api/missions/{completed}',json=body).status_code==422
    assert client.delete('/api/missions/missing').status_code==404
    assert client.post('/api/missions/missing/restore').status_code==404


def test_provider_endpoint_discloses_presence_only(client, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'never-return-this-test-secret')
    response = client.get('/api/settings/provider')
    assert response.status_code == 200
    assert response.json()['key_present'] is True
    assert response.json()['connection_tested'] is False
    assert response.json()['live_enabled'] is True
    assert 'never-return-this-test-secret' not in response.text


@pytest.mark.parametrize('scenario',['data','failure'])
def test_public_action_explanations_use_recorded_inputs_and_ready_tasks(client, scenario):
    key=launch(client,scenario)
    mission=finished(client,key)
    assert mission['status']=='COMPLETED'
    events=client.get(f'/api/missions/{key}/events').json()
    decisions=[e for e in events if e['type'] in ('master.decision','agent.decision')]
    assert decisions
    for decision in decisions:
        payload=decision['payload']
        assert payload['source']=='simulation_rule'
        assert payload['action'] and payload['reason'] and payload['evidence']
        if decision['type']=='agent.decision':
            inputs=[e for e in events if e['type']=='agent.input_received' and e['agent_id']==decision['agent_id'] and e['sequence']<decision['sequence']]
            assert payload['evidence']['received_input']==inputs[-1]['payload']['input']
            assert payload['evidence']['allowed_tools']==['educational_fixture']
        if 'dependencies' in payload['evidence']:
            assert all(dep['status']=='COMPLETED' for dep in payload['evidence']['dependencies'])
    final=next(e for e in reversed(decisions) if e['type']=='master.decision')
    assert all(task['status']=='COMPLETED' for task in final['payload']['evidence']['tasks'])
    assert final['sequence']<events[-1]['sequence']
    if scenario=='failure':
        retry=[e for e in decisions if e['payload']['action']=='Retry the failed task once']
        assert len(retry)==1
        assert retry[0]['payload']['evidence']['task_status']=='FAILED'
        assert retry[0]['payload']['target_agent_id'] in {a['id'] for a in mission['agents']}


@pytest.mark.parametrize(('scenario','count'), [('weather',3),('data',3),('failure',3),('concepts',2)])
def test_master_explains_actual_team_before_creation(client, scenario, count):
    key = launch(client, scenario)
    mission = finished(client, key)
    events = client.get(f'/api/missions/{key}/events').json()
    planned = next(e for e in events if e['type']=='mission.plan_ready')
    plan = planned['payload']['plan']
    assert plan['worker_count'] == count == len(mission['agents']) == len(plan['assignments'])
    assert plan['commander_count'] == 1
    assert plan['basis'] == 'scripted_scenario_rules'
    assert plan['requested_objective'] == mission['prompt']
    assert all(planned['sequence'] < e['sequence'] for e in events if e['type'] in ('agent.created','task.assigned'))
    assert plan['count_reason'] and plan['fewer_agents'] and plan['more_agents'] and plan['success_criteria']
    names = {a['id']:a['config']['name'] for a in mission['agents']}
    tasks = {t['id']:t for t in mission['tasks']}
    for assignment in plan['assignments']:
        task = tasks[assignment['task_id']]
        assert assignment['agent_id'] == task['agent_id']
        assert assignment['name'] == names[task['agent_id']]
        assert assignment['task'] == task['title']
        assert assignment['waits_for'] == [names[tasks[d]['agent_id']] for d in task['dependencies']]
        expected_receivers = [names[t['agent_id']] for t in mission['tasks'] if task['id'] in t['dependencies']]
        assert assignment['sends_to'] == (expected_receivers or ['Master Agent / final result'])
        assert all(assignment[field] for field in ('why_separate','receives','performs','produces'))


def test_restart_marks_interrupted_missions_failed(tmp_path):
    from app.db import Mission
    app = create_app(f'sqlite:///{tmp_path / "restart.db"}', delay=0)
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    with app.state.sessions() as db:
        mission = Mission(prompt='Interrupted mission', scenario='weather', status='RUNNING')
        db.add(mission)
        db.commit()
        key = mission.id
    with TestClient(app) as client:
        assert client.get(f'/api/missions/{key}').json()['status'] == 'FAILED'
        assert client.get(f'/api/missions/{key}/events').json()[-1]['type'] == 'mission.failed'


def test_simulation_boards_record_real_loops_and_recovery_guidance(client):
    key=launch(client,'failure');result=finished(client,key)
    assert result['status']=='COMPLETED'
    events=client.get(f'/api/missions/{key}/events').json()
    for agent in result['agents']:
        own=[e for e in events if e['agent_id']==agent['id']]
        assert {'agent.observe','agent.plan','agent.act','agent.test','agent.progress','agent.stopped'}<=set(e['type'] for e in own)
        assert next(e for e in reversed(own) if e['type']=='agent.stopped')['payload']['outcome']=='completed'
    assert any(e['type']=='master.intervention' for e in events)
    assert any(e['type']=='agent.guidance_received' for e in events)
    assert any(e['type']=='agent.adjust' for e in events)
    assert any(e['type']=='agent.repeat' for e in events)
    assert next(e for e in reversed(events) if e['type']=='master.test')['payload']['scope']=='whole scenario'
    assert next(e for e in events if e['type']=='master.stopped')['payload']['outcome']=='completed'
