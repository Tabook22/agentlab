"""Reproduce the skill lifecycle and heritage workflow through normal app APIs.

Runs only Simulation against a new disposable database. No production database,
credentials, external AI requests or live billing are used. From backend:
    python scripts/verify_skill_workflows.py
"""
import json
import os
from pathlib import Path
import sys
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tmp' / 'skill-verification'
OUT.mkdir(parents=True, exist_ok=True)
DATABASE = OUT / f'normal-flow-{uuid4().hex[:10]}.db'
os.environ['OPENAI_API_KEY'] = ''
os.environ['AGENT_LAB_KEY_FILE'] = str(OUT / 'no-provider-key')
os.environ['DATABASE_URL'] = 'sqlite:///' + DATABASE.as_posix()
sys.path.insert(0, str(ROOT / 'backend'))

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.accounts import hash_password
from app.db import Base, User, Agent, Mission
from app.main import create_app
from app.provider import OpenAIProvider
from app.heritage_demo import EXCERPTS

FIXTURE_PASSWORD = 'fixture-only-password'


def forbid_provider(request):
    raise AssertionError('Simulation verification must never call an external provider.')


app = create_app(delay=0, provider=OpenAIProvider(httpx.MockTransport(forbid_provider)))
Base.metadata.create_all(app.state.sessions.kw['bind'])
with app.state.sessions() as db:
    db.add(User(id='administrator', username='nasser', role='super_admin', password_hash=hash_password(FIXTURE_PASSWORD)))
    db.commit()


def checked(client, method, path, body=None):
    response = client.request(method, '/api' + path, json=body)
    if response.status_code >= 400:
        raise AssertionError(f'{method} {path}: {response.status_code} {response.text}')
    return response.json()


def wait(client, key, wanted):
    for _ in range(500):
        run = checked(client, 'GET', f'/missions/{key}/workflow')
        if run['status'] in wanted and key not in app.state.runner.jobs:
            return run
        time.sleep(.01)
    raise AssertionError(f'Workflow did not reach {wanted}: {run}')


def mission(client, prompt, inputs, **options):
    created = checked(client, 'POST', '/missions', {'prompt': prompt, 'mode': 'simulation',
        'execution_strategy': 'skills', 'inputs': inputs, 'concurrency_limit': 2, **options})
    key = created['id']; plan = wait(client, key, ['AWAITING_APPROVAL'])
    checked(client, 'POST', f'/missions/{key}/workflow/approve', {'plan_revision': plan['plan_revision']})
    return key, plan, wait(client, key, ['COMPLETED', 'FAILED', 'AWAITING_CLARIFICATION'])


def main():
    report = {'mode': 'simulation through normal authenticated application APIs',
              'database': str(DATABASE), 'checks': {}, 'source_material_note': 'Fictional Omani heritage classroom excerpts; not historical evidence.'}
    with TestClient(app) as client:
        checked(client, 'POST', '/auth/login', {'username': 'nasser', 'password': FIXTURE_PASSWORD})
        first, plan, completed = mission(client, 'Extract Account Details from the supplied heritage excerpt.', EXCERPTS[0])
        assert not plan['selection']['selected'] and completed['status'] == 'COMPLETED'
        draft = checked(client, 'POST', f'/missions/{first}/workflow/skill-draft', {})
        assert draft['active_version'] is None
        assert EXCERPTS[0]['excerpt'] not in json.dumps(draft)
        checked(client, 'POST', f'/skills/{draft["id"]}/activate', {'version': 1})
        report['checks']['No matching skill, save draft, review and activate'] = {'passed': True, 'mission_id': first, 'skill_id': draft['id'], 'version': 1}

        second, selected, fresh = mission(client, 'Extract Account Details from a different supplied heritage excerpt.', EXCERPTS[1])
        assert selected['selection']['selected'][0]['skill_id'] == draft['id']
        assert fresh['steps'][0]['inputs']['excerpt'] == EXCERPTS[1]['excerpt']
        assert 'CLASSROOM-OMAN-B' in checked(client, 'GET', f'/missions/{second}')['output']['content']
        report['checks']['Auto selection with different current inputs'] = {'passed': True, 'mission_id': second, 'pinned_version': fresh['steps'][0]['skill_snapshot']['version']}

        file = ROOT / 'examples' / 'skills' / 'compare-heritage-accounts' / 'SKILL.md'
        compare = checked(client, 'POST', '/skills/import', {'content': file.read_text(encoding='utf-8')})
        assert compare['active_version'] is None
        checked(client, 'POST', f'/skills/{compare["id"]}/activate', {'version': 1})
        prompt = 'Run Extract Account Details on both Omani heritage excerpts in parallel, then Compare Heritage Accounts using both accepted results. Distinguish agreement from differences and preserve source references.'
        third, plan, done = mission(client, prompt, {'excerpts': EXCERPTS})
        assert done['status'] == 'COMPLETED'
        a, b, c = done['steps']
        assert a['started_at'] < b['completed_at'] and b['started_at'] < a['completed_at']
        assert c['started_at'] >= max(a['completed_at'], b['completed_at'])
        assert a['skill_snapshot']['skill_id'] == b['skill_snapshot']['skill_id'] == draft['id']
        output = checked(client, 'GET', f'/missions/{third}')['output']
        assert '## Agreement' in output['content'] and '## Differences' in output['content']
        assert {r['reference'] for r in output['source_references']} == {'CLASSROOM-OMAN-A', 'CLASSROOM-OMAN-B'}
        report['checks']['Parallel extraction followed by dependent comparison'] = {'passed': True, 'mission_id': third,
            'steps': [{k: s[k] for k in ('title', 'status', 'started_at', 'completed_at', 'attempts')} for s in done['steps']], 'output': output}

        fourth, plan, held = mission(client, prompt, {'excerpts': EXCERPTS}, fail_once_steps=[1])
        assert [s['status'] for s in held['steps']] == ['COMPLETED', 'FAILED', 'BLOCKED']
        retained = held['steps'][0]['output']
        checked(client, 'POST', f'/missions/{fourth}/workflow/retry', {'step_id': held['steps'][1]['id']})
        retried = wait(client, fourth, ['COMPLETED'])
        assert [s['attempts'] for s in retried['steps']] == [1, 2, 1]
        assert retried['steps'][0]['output'] == retained
        report['checks']['Failed step retry reuses accepted results'] = {'passed': True, 'mission_id': fourth, 'attempts': [s['attempts'] for s in retried['steps']]}

        # An original classroom run is still created, listed, inspected and replayed.
        legacy = checked(client, 'POST', '/missions', {'prompt': 'Explain an AI agent with the original classroom scenario.', 'mode': 'simulation', 'scenario': 'concepts', 'execution_strategy': 'legacy'})
        for _ in range(500):
            original = checked(client, 'GET', f'/missions/{legacy["id"]}')
            if original['status'] in ('COMPLETED', 'FAILED'): break
            time.sleep(.01)
        assert original['status'] == 'COMPLETED' and original['agents'] and original['tasks']
        assert checked(client, 'GET', f'/missions/{legacy["id"]}/events')
        assert any(m['id'] == legacy['id'] for m in checked(client, 'GET', '/missions'))
        report['checks']['Original agents, configurations and history remain accessible'] = {'passed': True, 'mission_id': legacy['id'],
            'agent_names': [a['config']['name'] for a in original['agents']]}
        assert checked(client, 'GET', f'/missions/{third}')['agents'] == []
        checked(client, 'POST', '/auth/logout')
    (OUT / 'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    (OUT / 'heritage-comparison.md').write_text(output['content'] + '\n\n' + '\n'.join(output['limitations']), encoding='utf-8')
    print(f'PASS: {len(report["checks"])} normal-flow verification checks.')
    print('Report:', OUT / 'report.json')
    print('Comparison:', OUT / 'heritage-comparison.md')
    print('Disposable preview database:', DATABASE)


if __name__ == '__main__':
    main()
