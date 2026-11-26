"""Normal authenticated mission flow; no paid requests or production data."""
import asyncio
import json
import time
from pathlib import Path
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import create_app
from app.db import Base, Skill, Agent, Mission, Event, Task
from app.heritage_demo import EXCERPTS, EXAMPLE_SKILLS
from app.provider import OpenAIProvider
from account_helpers import sign_in_admin, TEST_PASSWORD


@pytest.fixture
def lab(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', '')
    app = create_app(f'sqlite:///{tmp_path / "skills.db"}', delay=0)
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    with TestClient(app) as client:
        sign_in_admin(client)
        yield client


def wait(client, key, statuses=('AWAITING_APPROVAL',)):
    for _ in range(400):
        run = client.get(f'/api/missions/{key}/workflow')
        assert run.status_code == 200, run.text
        data = run.json()
        if data['status'] in statuses and key not in client.app.state.runner.jobs:
            return data
        time.sleep(.01)
    pytest.fail(f'Workflow did not reach {statuses}: {data}')


def submit(client, **changes):
    body = {'prompt': 'Extract Account Details from the current heritage excerpt.', 'mode': 'simulation',
            'execution_strategy': 'skills', 'inputs': dict(EXCERPTS[0]), **changes}
    response = client.post('/api/missions', json=body)
    assert response.status_code == 201, response.text
    key = response.json()['id']
    return key, wait(client, key)


def approve(client, key, plan):
    response = client.post(f'/api/missions/{key}/workflow/approve', json={'plan_revision': plan['plan_revision']})
    assert response.status_code == 200, response.text
    return wait(client, key, ('COMPLETED', 'FAILED', 'AWAITING_CLARIFICATION'))


def create_skill(client, body, activate=True):
    response = client.post('/api/skills', json=body)
    assert response.status_code == 201, response.text
    skill = response.json()
    if activate:
        response = client.post(f'/api/skills/{skill["id"]}/activate', json={'version': 1})
        assert response.status_code == 200, response.text
    return skill


def heritage_steps(extract, compare, delegated=False):
    result = []
    for index in range(2):
        step = {'title': f'Extract Account Details · {index+1}', 'instructions': 'Extract this account without adding facts.',
                'skill_id': extract['id'], 'bindings': [
                    {'name': 'excerpt', 'key': f'excerpts.{index}.excerpt'},
                    {'name': 'source_reference', 'key': f'excerpts.{index}.source_reference'}]}
        if delegated:
            step.update(executor='delegated', delegation_reason='isolated_context',
                        delegation_rationale='This source must be analyzed without exposure to the other account.')
        result.append(step)
    result.append({'title': 'Compare Heritage Accounts', 'instructions': 'Compare accepted accounts and preserve attribution.',
                   'skill_id': compare['id'], 'dependencies': [0, 1], 'bindings': [{'name': 'accounts', 'source': 'dependencies'}]})
    return result


def test_no_match_save_draft_activate_and_auto_reuse_with_new_inputs(lab):
    key, plan = submit(lab)
    assert plan['selection']['selected'] == []
    assert all(s['executor'] == 'master' for s in plan['steps'])
    done = approve(lab, key, plan)
    assert done['status'] == 'COMPLETED'
    assert done['suggestion']['recommended']
    response = lab.post(f'/api/missions/{key}/workflow/skill-draft', json={})
    assert response.status_code == 201, response.text
    draft = response.json()
    assert draft['active_version'] is None and draft['status'] == 'draft'
    saved = json.dumps(draft)
    assert EXCERPTS[0]['excerpt'] not in saved
    assert 'CLASSROOM-OMAN-A' not in saved
    # Draft remains absent from automatic selection until explicit review/activation.
    other, pending = submit(lab)
    assert pending['selection']['selected'] == []
    lab.post(f'/api/missions/{other}/cancel')
    assert lab.post(f'/api/skills/{draft["id"]}/activate', json={'version': 1}).status_code == 200
    fresh = {**EXCERPTS[1], 'excerpt': 'Location: Muscat, Oman.\nTradition: A different supplied classroom account.', 'source_reference': 'NEW-ACCOUNT-C'}
    key2, selected = submit(lab, inputs=fresh)
    assert selected['selection']['selected'][0]['skill_id'] == draft['id']
    assert selected['steps'][0]['skill_snapshot']['version'] == 1
    run2 = approve(lab, key2, selected)
    assert run2['status'] == 'COMPLETED'
    content = lab.get(f'/api/missions/{key2}').json()['output']['content']
    assert 'Muscat' in content and 'NEW-ACCOUNT-C' in content
    assert 'CLASSROOM-OMAN-A' not in content
    assert lab.get(f'/api/missions/{key2}').json()['agents'] == []


def test_parallel_heritage_extraction_then_dependent_comparison(lab):
    extract = create_skill(lab, EXAMPLE_SKILLS[0]); compare = create_skill(lab, EXAMPLE_SKILLS[1])
    key, plan = submit(lab, prompt='Extract and compare two Omani heritage accounts.', inputs={'excerpts': EXCERPTS},
                       workflow_steps=heritage_steps(extract, compare), concurrency_limit=2)
    assert plan['steps'][2]['missing_inputs'] == []  # Its inputs will come from dependencies.
    done = approve(lab, key, plan)
    assert done['status'] == 'COMPLETED', done
    a, b, c = done['steps']
    assert a['started_at'] < b['completed_at'] and b['started_at'] < a['completed_at']
    assert c['started_at'] >= max(a['completed_at'], b['completed_at'])
    assert a['skill_snapshot']['skill_id'] == b['skill_snapshot']['skill_id'] == extract['id']
    assert a['inputs']['excerpt'] != b['inputs']['excerpt']
    assert all(s['executor'] == 'master' and s['attempts'] == 1 for s in done['steps'])
    result = lab.get(f'/api/missions/{key}').json()
    assert result['agents'] == [] and result['tasks'] == []
    assert '## Agreement' in result['output']['content'] and '## Differences' in result['output']['content']
    assert {r['reference'] for r in result['output']['source_references']} == {'CLASSROOM-OMAN-A', 'CLASSROOM-OMAN-B'}
    assert lab.get(f'/api/missions/{key}/answer/package').status_code == 200


def test_failed_step_retry_keeps_completed_results_and_pinned_skill_version(lab):
    extract = create_skill(lab, EXAMPLE_SKILLS[0]); compare = create_skill(lab, EXAMPLE_SKILLS[1])
    key, plan = submit(lab, prompt='Extract and compare heritage accounts with a one-time simulation failure.',
                       inputs={'excerpts': EXCERPTS}, workflow_steps=heritage_steps(extract, compare), fail_once_steps=[1])
    held = approve(lab, key, plan)
    assert held['status'] == 'FAILED'
    assert [s['status'] for s in held['steps']] == ['COMPLETED', 'FAILED', 'BLOCKED']
    original = held['steps'][0]['output']
    edit = lab.put(f'/api/skills/{extract["id"]}', json={**EXAMPLE_SKILLS[0], 'instructions': 'Updated instructions apply only to future plans.', 'expected_version': 1})
    assert edit.status_code == 200, edit.text
    assert lab.post(f'/api/skills/{extract["id"]}/activate', json={'version': 2}).status_code == 200
    assert lab.post(f'/api/missions/{key}/workflow/retry', json={'step_id': held['steps'][1]['id']}).status_code == 200
    done = wait(lab, key, ('COMPLETED',))
    assert [s['attempts'] for s in done['steps']] == [1, 2, 1]
    assert done['steps'][0]['output'] == original
    assert done['steps'][1]['skill_snapshot']['version'] == 1
    composite = lab.post(f'/api/missions/{key}/workflow/skill-draft', json={}).json()
    assert composite['id'] not in (extract['id'], compare['id'])
    assert composite['name'] == 'Extract and Compare Heritage Accounts'
    single, single_plan = submit(lab, skill_mode='manual', skill_id=extract['id'])
    assert approve(lab, single, single_plan)['status'] == 'COMPLETED'
    updated = lab.post(f'/api/missions/{single}/workflow/skill-draft', json={}).json()
    assert updated['id'] == extract['id'] and updated['latest_version'] == 3
    assert updated['active_version'] == 2 and updated['status'] == 'draft'
    history = lab.get(f'/api/skills/{extract["id"]}').json()
    assert [v['version'] for v in history['versions']] == [3, 2, 1]


def test_required_inputs_are_identified_before_step_runs_and_can_be_supplied(lab):
    extract = create_skill(lab, EXAMPLE_SKILLS[0])
    key, plan = submit(lab, skill_mode='manual', skill_id=extract['id'], inputs={'excerpt': 'Location: Dhofar.'})
    assert 'source_reference' in plan['steps'][0]['missing_inputs']
    held = approve(lab, key, plan)
    assert held['status'] == 'AWAITING_CLARIFICATION'
    assert held['steps'][0]['attempts'] == 0
    assert lab.patch(f'/api/missions/{key}/workflow/inputs', json={'inputs': {'source_reference': 'SUPPLIED-LATER'}}).status_code == 200
    assert lab.post(f'/api/missions/{key}/workflow/retry', json={}).status_code == 200
    done = wait(lab, key, ('COMPLETED',))
    assert done['steps'][0]['output']['source_references'][0]['reference'] == 'SUPPLIED-LATER'
    assert lab.patch(f'/api/missions/{key}/workflow/inputs', json={'inputs': {'excerpt': 'Change completed data'}}).status_code == 409


def test_skill_md_round_trip_drafts_and_workspace_access(lab):
    skill = create_skill(lab, EXAMPLE_SKILLS[0])
    exported = lab.get(f'/api/skills/{skill["id"]}/export').text
    assert exported.startswith('---\nname: Extract Account Details\n')
    imported = lab.post('/api/skills/import', json={'content': exported})
    assert imported.status_code == 201, imported.text
    assert imported.json()['instructions'] == EXAMPLE_SKILLS[0]['instructions']
    assert imported.json()['active_version'] is None
    assert imported.json()['id'] != skill['id']
    assert lab.post('/api/skills/import', json={'content': '---\nname: &x [a]\ndescription: *x\n---\nNo aliases.'}).status_code == 422
    assert lab.post(f'/api/skills/{skill["id"]}/deactivate').status_code == 200
    assert lab.post('/api/missions', json={'prompt': 'Use the inactive skill', 'mode': 'simulation', 'skill_mode': 'manual', 'skill_id': skill['id']}).status_code == 409
    student = lab.post('/api/admin/users', json={'username': 'student', 'password': TEST_PASSWORD}).json()
    with TestClient(lab.app) as other:
        assert other.post('/api/auth/login', json={'username': 'student', 'password': TEST_PASSWORD}).status_code == 200
        assert other.get('/api/skills').json() == []
        assert other.get(f'/api/skills/{skill["id"]}').status_code == 404
        assert other.post(f'/api/skills/{skill["id"]}/activate', json={'version': 1}).status_code == 404


def test_graph_validation_and_delegation_requires_real_boundary(lab):
    base = {'prompt': 'Check this graph', 'mode': 'simulation', 'execution_strategy': 'skills'}
    assert lab.post('/api/missions', json={**base, 'workflow_steps': [{'title': 'Cycle', 'instructions': 'Do the task', 'dependencies': [0]}]}).status_code == 422
    assert lab.post('/api/missions', json={**base, 'workflow_steps': [{'title': 'Unjustified agent', 'instructions': 'Do the task', 'executor': 'delegated'}]}).status_code == 422
    assert lab.post('/api/missions', json={**base, 'concurrency_limit': 9}).status_code == 422


def test_skill_draft_excludes_source_values_credentials_and_raw_corrections(lab):
    key, plan = submit(lab, inputs={**EXCERPTS[0], 'credential': 'sk-this-is-a-private-fixture-credential'}, fail_once_steps=[0])
    assert approve(lab, key, plan)['status'] == 'FAILED'
    step = lab.get(f'/api/missions/{key}/workflow').json()['steps'][0]
    assert lab.patch(f'/api/missions/{key}/workflow/steps/{step["id"]}', json={'instructions': 'Preserve references. PRIVATE-CASE-NAME must not become a reusable rule.'}).status_code == 200
    assert lab.post(f'/api/missions/{key}/workflow/retry', json={}).status_code == 200
    wait(lab, key, ('COMPLETED',))
    draft = lab.post(f'/api/missions/{key}/workflow/skill-draft', json={}).json()
    body = json.dumps(draft)
    for secret in ('PRIVATE-CASE-NAME', 'sk-this-is-a-private-fixture-credential', EXCERPTS[0]['excerpt'], 'CLASSROOM-OMAN-A'):
        assert secret not in body
    assert 'Preserve the exact supplied source references' in draft['instructions']


def test_live_master_selection_loads_descriptions_then_pinned_instructions(lab, monkeypatch):
    seen=[]
    overlap={'active':0,'peak':0}
    async def respond(request):
        body=json.loads(request.content); data=json.loads(body['input']); name=body['text']['format']['name']; seen.append((name,data))
        if name=='SkillSelection':
            assert 'instructions' not in json.dumps(data['active_skill_descriptions'])
            result={'skill_ids':[data['active_skill_descriptions'][0]['id']], 'reason':'The active description matches account extraction.'}
        elif name=='SkillMissionPlan':
            skill=data['selected_skills'][0]
            assert skill['instructions']==EXAMPLE_SKILLS[0]['instructions']
            result={'interpretation':'Extract current account details using the selected skill.', 'steps':[
                {'title':'Extract Account Details','instructions':'Use only current inputs.', 'skill_id':skill['skill_id'],
                 'bindings':[{'name':'excerpt','key':'excerpt'},{'name':'source_reference','key':'source_reference'}]}]}
        elif name=='WorkerProposal':
            overlap['active']+=1; overlap['peak']=max(overlap['peak'],overlap['active']); await asyncio.sleep(.02); overlap['active']-=1
            result={'observation_summary':'Current inputs are available.','public_plan':['Extract supplied details.'],
                    'action':'write_text','argument':data['current_inputs']['excerpt'],'action_summary':'Extract current account.', 'known_limitations':[]}
        elif name=='WorkerReview':
            result={'checks':[{'criterion':criterion,'passed':True,'evidence':'Matches supplied inputs.'} for criterion in data['criteria']], 'feedback':'Accepted.'}
        elif name=='WorkflowFinal':
            result={'title':'Accepted account','content':data['steps'][0]['output']['content'], 'limitations':[], 'suggest_skill':True,'suggestion_reason':'Reusable extraction.'}
        else:pytest.fail(name)
        return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':100,'output_tokens':100},'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps(result)}]}]})
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    lab.app.state.runner.provider.transport=httpx.MockTransport(respond)
    skill=create_skill(lab,EXAMPLE_SKILLS[0])
    key,plan=submit(lab,mode='live',open_ended=False,budget_usd=1)
    done=approve(lab,key,plan)
    assert done['status']=='COMPLETED',done
    assert [name for name,_ in seen]==['SkillSelection','SkillMissionPlan','WorkerProposal','WorkerReview','WorkflowFinal','WorkerReview']
    assert lab.get(f'/api/missions/{key}').json()['agents']==[]


def test_migration_preserves_original_agents_configs_and_history(tmp_path,monkeypatch):
    import sqlite3
    from alembic import command
    from alembic.config import Config
    backend=Path(__file__).resolve().parents[1]; path=tmp_path/'legacy.db'
    monkeypatch.chdir(backend);monkeypatch.setenv('DATABASE_URL','sqlite:///'+path.as_posix())
    config=Config(str(backend/'alembic.ini'));command.upgrade(config,'0006')
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO users VALUES ('administrator','nasser','fixture','super_admin',1,0,'original')")
        db.execute("INSERT INTO missions (id,prompt,scenario,mode,status,created_at,output,owner_id) VALUES ('legacy','Historical mission','concepts','simulation','COMPLETED','original','{}','administrator')")
        db.execute("INSERT INTO agents (id,mission_id,config,state) VALUES ('old-agent','legacy','{\"name\":\"Original configured agent\",\"tools\":[\"educational_fixture\"]}','COMPLETED')")
        db.execute("INSERT INTO tasks VALUES ('old-task','legacy','old-agent','Original task','[]','COMPLETED','{}')")
        db.execute("INSERT INTO events (id,mission_id,sequence,timestamp,type,payload) VALUES ('old-event','legacy',1,'original','mission.completed','{\"output\":{\"content\":\"Original answer\"}}')")
    command.upgrade(config,'head')
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT execution_strategy FROM missions').fetchone()[0]=='legacy'
        assert json.loads(db.execute('SELECT config FROM agents').fetchone()[0])['name']=='Original configured agent'
        assert db.execute('SELECT count(*) FROM events').fetchone()[0]==1
        assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
    app=create_app('sqlite:///'+path.as_posix(),delay=0)
    # Fixture authentication is replaced with a known test-only password, never production data.
    from app.accounts import hash_password
    with app.state.sessions() as db:
        from app.db import User
        db.get(User,'administrator').password_hash=hash_password(TEST_PASSWORD);db.commit()
    with TestClient(app) as client:
        sign_in_admin(client)
        result=client.get('/api/missions/legacy').json()
        assert result['agents'][0]['config']['name']=='Original configured agent'
        assert result['tasks'][0]['id']=='old-task'
        assert client.get('/api/missions/legacy/events').json()[0]['id']=='old-event'
        assert client.get('/api/missions/legacy/workflow').status_code==404
        draft=client.post('/api/missions/legacy/workflow/skill-draft',json={})
        assert draft.status_code==201,draft.text
        assert 'Original answer' not in draft.text and draft.json()['active_version'] is None


@pytest.mark.parametrize('delegated',[False,True])
def test_live_parallel_steps_and_run_scoped_delegation_use_existing_executor(lab,monkeypatch,delegated):
    active=0;peak=0;contexts=[]
    async def respond(request):
        nonlocal active,peak
        body=json.loads(request.content);data=json.loads(body['input']);name=body['text']['format']['name']
        if name=='WorkerProposal':
            contexts.append(data)
            active+=1;peak=max(peak,active);await asyncio.sleep(.04);active-=1
            current=data.get('current_inputs',{})
            content=current.get('excerpt') or 'Agreement and Differences using both supplied references.'
            result={'observation_summary':'Only assigned current inputs are available.','public_plan':['Produce the scoped deliverable.'],
                    'action':'write_text','argument':content,'action_summary':'Produce the current output.','known_limitations':[]}
        elif name=='WorkerReview':
            result={'checks':[{'criterion':c,'passed':True,'evidence':'Checks current inputs and scope.'} for c in data['criteria']],'feedback':'Accepted.'}
        elif name=='WorkflowFinal':
            result={'title':'Heritage comparison','content':'## Agreement\nBoth accounts name Dhofar.\n## Differences\nThe accounts describe different audiences.',
                    'limitations':['Supplied classroom material.'],'suggest_skill':True,'suggestion_reason':'This source-comparison workflow can recur.'}
        else:pytest.fail(name)
        return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':100,'output_tokens':100},'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps(result)}]}]})
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    lab.app.state.runner.provider.transport=httpx.MockTransport(respond)
    extract=create_skill(lab,EXAMPLE_SKILLS[0]);compare=create_skill(lab,EXAMPLE_SKILLS[1])
    key,plan=submit(lab,mode='live',inputs={'excerpts':EXCERPTS,'unrelated_private_note':'MUST-NOT-REACH-DELEGATE'},
                    workflow_steps=heritage_steps(extract,compare,delegated),concurrency_limit=2)
    result=approve(lab,key,plan)
    assert result['status']=='COMPLETED',result
    assert peak==2
    detail=lab.get(f'/api/missions/{key}').json()
    if delegated:
        assert len(detail['agents'])==2 and len(detail['tasks'])==2
        assert all(a['state']=='TERMINATED' and a['config']['persistent'] is False for a in detail['agents'])
        assert all(a['config']['delegation']['reason']=='isolated_context' for a in detail['agents'])
        for context in contexts[:2]:
            assert context['scoped_context']
            assert 'MUST-NOT-REACH-DELEGATE' not in json.dumps(context)
            assert len(context['current_inputs'])==2
    else:
        assert detail['agents']==[] and detail['tasks']==[]
    assert {r['reference'] for r in detail['output']['source_references']}=={'CLASSROOM-OMAN-A','CLASSROOM-OMAN-B'}


def test_concurrency_limit_one_serializes_independent_steps(lab):
    extract=create_skill(lab,EXAMPLE_SKILLS[0]);compare=create_skill(lab,EXAMPLE_SKILLS[1])
    key,plan=submit(lab,inputs={'excerpts':EXCERPTS},workflow_steps=heritage_steps(extract,compare),concurrency_limit=1)
    result=approve(lab,key,plan)
    assert result['steps'][1]['started_at']>=result['steps'][0]['completed_at']


def test_restart_keeps_completed_step_outputs_and_allows_explicit_retry(lab):
    from app.db import WorkflowStep
    extract=create_skill(lab,EXAMPLE_SKILLS[0]);compare=create_skill(lab,EXAMPLE_SKILLS[1])
    key,plan=submit(lab,inputs={'excerpts':EXCERPTS},workflow_steps=heritage_steps(extract,compare),fail_once_steps=[1])
    held=approve(lab,key,plan)
    with lab.app.state.sessions() as db:
        db.get(Mission,key).status='RUNNING'
        db.get(WorkflowStep,held['steps'][1]['id']).status='RUNNING'
        db.commit()
    restarted=create_app(str(lab.app.state.sessions.kw['bind'].url),delay=0)
    with TestClient(restarted) as client:
        sign_in_admin(client)
        report=client.get(f'/api/missions/{key}/workflow').json()
        assert report['status']=='FAILED'
        assert report['steps'][1]['failure']['kind']=='interrupted'
        assert client.post(f'/api/missions/{key}/workflow/retry',json={}).status_code==200
        result=wait(client,key,('COMPLETED',))
        assert result['steps'][0]['attempts']==1 and result['steps'][0]['output']==held['steps'][0]['output']


def test_concurrent_budget_reservations_cannot_overcommit_allowance():
    from app.provider import RequestBudget,LiveLimits,SpendingApprovalRequired
    budget=RequestBudget(LiveLimits(),.01)
    budget.reserve({},1000,.75,4.5)
    assert budget.reserved_cost>0
    with pytest.raises(SpendingApprovalRequired):budget.reserve({},1000,.75,4.5)


def test_fill_missing_nested_input_without_invalidating_accepted_results(lab):
    extract=create_skill(lab,EXAMPLE_SKILLS[0]);compare=create_skill(lab,EXAMPLE_SKILLS[1])
    excerpts=[dict(EXCERPTS[0]),{key:value for key,value in EXCERPTS[1].items() if key!='source_reference'}]
    key,plan=submit(lab,inputs={'excerpts':excerpts},workflow_steps=heritage_steps(extract,compare))
    held=approve(lab,key,plan)
    assert [s['status'] for s in held['steps']]==['COMPLETED','AWAITING_INPUT','BLOCKED']
    assert lab.patch(f'/api/missions/{key}/workflow/inputs',json={'inputs':{'excerpts':EXCERPTS}}).status_code==200
    assert lab.post(f'/api/missions/{key}/workflow/retry',json={}).status_code==200
    done=wait(lab,key,('COMPLETED',))
    assert done['steps'][0]['attempts']==1 and done['steps'][0]['output']==held['steps'][0]['output']


def test_saved_composite_skill_does_not_replace_atomic_extract_contracts(lab):
    extract=create_skill(lab,EXAMPLE_SKILLS[0]);compare=create_skill(lab,EXAMPLE_SKILLS[1])
    key,plan=submit(lab,inputs={'excerpts':EXCERPTS},workflow_steps=heritage_steps(extract,compare))
    assert approve(lab,key,plan)['status']=='COMPLETED'
    composite=lab.post(f'/api/missions/{key}/workflow/skill-draft',json={}).json()
    assert composite['instructions'].count('Extract only details')==1
    assert lab.post(f'/api/skills/{composite["id"]}/activate',json={'version':1}).status_code==200
    key2,plan2=submit(lab,prompt='Extract and compare heritage accounts.',inputs={'excerpts':EXCERPTS})
    assert len(plan2['steps'])==3
    assert plan2['steps'][0]['skill_snapshot']['skill_id']==extract['id']
    assert approve(lab,key2,plan2)['status']=='COMPLETED'
    key3,plan3=submit(lab,skill_mode='manual',skill_id=composite['id'],inputs={'excerpts':EXCERPTS})
    assert len(plan3['steps'])==1
    assert approve(lab,key3,plan3)['status']=='COMPLETED'
