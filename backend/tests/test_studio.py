from account_helpers import sign_in_admin
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.db import Base


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', '')
    monkeypatch.setenv('AGENT_LAB_ADMIN_ORIGIN', '')
    app = create_app(f'sqlite:///{tmp_path / "studio.db"}')
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    async def forbidden(*args, **kwargs):
        pytest.fail('Free studio activities must never call an AI provider')
    monkeypatch.setattr(app.state.runner.provider, 'generate', forbidden)
    monkeypatch.setattr(app.state.runner.provider, 'research', forbidden)
    with TestClient(app) as opened:
        sign_in_admin(opened)
        yield opened


def contract(**changes):
    return {'submission_id': str(uuid4()), 'expected_revision': 0,
            'borrowing_rule': 'available_only', 'after_borrow': 'borrowed',
            'after_return': 'available', 'loan_days': 14,
            'explanation': 'Block double loans and make returned books available.', **changes}


def test_learner_repairs_contract_and_downstream_handoff_uses_exact_submission(client):
    identity = str(uuid4())
    run = client.post('/api/studio/participation', json={'request_id': identity}).json()
    assert run['status'] == 'ASSIGNED' and run['data']['attempts'] == []
    assert client.post('/api/studio/participation', json={'request_id': identity}).json() == run
    failed = client.post(f'/api/studio/participation/{identity}/submit',
                         json=contract(after_return='borrowed', loan_days=20)).json()
    assert failed['status'] == 'REVISION_NEEDED'
    assert [c['id'] for c in failed['data']['attempts'][0]['checks'] if not c['passed']] == ['return', 'duration']
    assert failed['data']['handoff'] is None
    body = contract(expected_revision=1, loan_days=7)
    accepted = client.post(f'/api/studio/participation/{identity}/submit', json=body).json()
    assert accepted['status'] == 'COMPLETED' and accepted['revision'] == 2
    handoff = accepted['data']['handoff']
    assert handoff['contract']['loan_days'] == 7
    assert handoff['contract']['explanation'] == body['explanation']
    assert handoff['source_submission_id'] == body['submission_id']
    assert all(check['passed'] for check in handoff['verification'])
    assert client.post(f'/api/studio/participation/{identity}/submit', json=body).json() == accepted
    assert client.post(f'/api/studio/participation/{identity}/submit', json=contract(expected_revision=2)).status_code == 409
    assert client.get(f'/api/studio/runs/{identity}').json() == accepted
    assert client.get('/api/studio/runs?kind=participation').json()[0]['id'] == identity
    assert client.get('/api/missions').json() == []


def test_stale_invalid_and_remote_submissions_do_not_change_work(client):
    key = client.post('/api/studio/participation', json={'request_id': str(uuid4())}).json()['id']
    path = f'/api/studio/participation/{key}/submit'
    assert client.post(path, json=contract(expected_revision=4)).status_code == 409
    assert client.post(path, json=contract(explanation=' ' * 12)).status_code == 422
    assert client.post(path, json=contract(after_borrow='invented')).status_code == 422
    with TestClient(client.app, client=('203.0.113.7', 5000)) as remote:
        assert remote.get('/api/studio/runs?kind=participation').status_code == 401
        assert remote.post(path, json=contract()).status_code == 401
    assert client.get(f'/api/studio/runs/{key}').json()['revision'] == 0


def test_acceptance_requires_the_resulting_behavior_not_just_a_rule_name(client):
    key = client.post('/api/studio/participation', json={'request_id': str(uuid4())}).json()['id']
    result = client.post(f'/api/studio/participation/{key}/submit',
                         json=contract(after_borrow='available')).json()
    checks = result['data']['attempts'][0]['checks']
    assert not checks[0]['passed'] and not checks[1]['passed']
    assert result['status'] == 'REVISION_NEEDED'


@pytest.mark.parametrize('variable', ['team_size', 'criteria', 'input'])
def test_experiments_change_one_factor_preserve_sources_and_measure_actual_work(client, variable):
    body = {'request_id': str(uuid4()), 'variable': variable,
            'prediction': 'More workers may add coordination without changing arithmetic.'}
    response = client.post('/api/studio/experiments', json=body)
    assert response.status_code == 201, response.text
    run = response.json(); data = run['data']; a = data['baseline']; b = data['alternative']
    assert data['source_snapshot'] == [68, 75, None, 81, 92, 84]
    assert sum(a['config'][key] != b['config'][key] for key in a['config']) == 1
    assert data['prediction'] == body['prediction']
    assert a['api_calls'] == b['api_calls'] == 0 and a['cost_usd'] == b['cost_usd'] == 0
    assert a['output']['mean'] == 80
    if variable == 'team_size':
        assert a['output'] == b['output']
        assert len(a['handoffs']) == 0 and len(b['handoffs']) == 2
        assert b['handoffs'][0]['data'] == [68, 75, 81, 92, 84]
        assert all(check['passed'] for check in b['checks'])
    elif variable == 'criteria':
        assert len(a['checks']) == 1 and len(b['checks']) == 4
        assert a['output'] == {'mean': 80}
    else:
        assert b['status'] == 'NEEDS_INPUT' and b['output'] is None and b['checks'] == []
        assert b['trace'][-1]['operation'] == 'request_clarification'
    assert client.post('/api/studio/experiments', json=body).json() == run
    reflection = {'expected_revision': 0, 'reflection': 'The evidence shows that handoffs add coordination.'}
    saved = client.post(f'/api/studio/experiments/{run["id"]}/reflect', json=reflection).json()
    assert saved['data']['reflection'] == reflection['reflection']
    assert saved['data']['baseline'] == a
    assert client.post(f'/api/studio/experiments/{run["id"]}/reflect', json=reflection).status_code == 409
    assert client.get('/api/missions').json() == []


def test_project_sample_has_verified_totals_and_reproducible_exports(client):
    body = {'request_id': str(uuid4()), 'sample': True}
    result = client.post('/api/studio/projects', json=body)
    assert result.status_code == 201, result.text
    run = result.json(); data = run['data']
    assert data['source_kind'] == 'synthetic_sample' and data['total_kwh'] == '8100'
    assert data['row_count'] == 6 and data['building_count'] == 3
    assert data['totals'][0] == {'building': 'Science', 'kwh': '4200', 'observations': 2}
    assert all(check['passed'] for check in data['checks']) and not data['uneven_coverage']
    assert client.post('/api/studio/projects', json=body).json() == run
    import hashlib
    assert hashlib.sha256(data['source_csv'].encode()).hexdigest() == data['source_sha256']
    for format, expected in [('cleaned.csv', 'Library,2026-01,1200'), ('summary.csv', 'Science,4200,2'),
                             ('chart.svg', '<svg'), ('report.txt', 'Recorded total: 8100 kWh')]:
        exported = client.get(f'/api/studio/projects/{run["id"]}/export/{format}')
        assert exported.status_code == 200 and expected in exported.text
        assert 'attachment;' in exported.headers['content-disposition']
        assert exported.headers['cache-control'] == 'no-store'
    assert client.get('/api/missions').json() == []


def test_project_handles_decimal_precision_uneven_coverage_and_untrusted_names(client):
    text = 'building,month,kwh\n"=SUM(1+1)",2026-01,0.1\n"=SUM(1+1)",2026-02,0.2\n<script>alert(1)</script>,2026-01,0\n'
    response = client.post('/api/studio/projects', json={'request_id': str(uuid4()), 'csv_text': text,
                                                      'filename': '../../energy.csv'})
    assert response.status_code == 201, response.text
    run = response.json(); data = run['data']
    assert data['total_kwh'] == '0.3' and data['uneven_coverage']
    assert data['filename'] == 'energy.csv'
    cleaned = client.get(f'/api/studio/projects/{run["id"]}/export/cleaned.csv').text
    assert "'=SUM(1+1)" in cleaned
    svg = client.get(f'/api/studio/projects/{run["id"]}/export/chart.svg').text
    assert '<script>' not in svg and '&lt;script&gt;' in svg
    assert client.get(f'/api/studio/runs/{run["id"]}').json() == run


@pytest.mark.parametrize('text,explanation', [
    ('name,month,kwh\nA,2026-01,1', 'columns'),
    ('building,month,kwh\nA,2026-01,', 'number'),
    ('building,month,kwh\nA,2026-01,-1', 'between'),
    ('building,month,kwh\nA,2026-01,NaN', 'between'),
    ('building,month,kwh\nA,2026-01,Infinity', 'between'),
    ('building,month,kwh\nA,2026-13,1', 'YYYY-MM'),
    ('building,month,kwh\nA,2026-01,1\nA,2026-01,2', 'duplicate'),
    ('building,month,kwh\nA,2026-01,1\na,2026-02,2', 'capitalization'),
    ('building,month,kwh\nA,2026-01,0.0001', 'decimal places'),
    ('building,month,kwh\nA,2026-01,1,extra', 'three values'),
    ('building,month,kwh', 'at least one'),
    ('building,month,kwh\n"unterminated,2026-01,1', 'quoting'),
])
def test_invalid_project_data_is_rejected_without_saving_partial_results(client, text, explanation):
    response = client.post('/api/studio/projects', json={'request_id': str(uuid4()), 'csv_text': text})
    assert response.status_code == 422, response.text
    assert explanation in response.json()['detail']
    assert client.get('/api/studio/runs?kind=project').json() == []


def test_zero_scientific_notation_is_normalized_and_oversized_sources_are_rejected(client):
    response = client.post('/api/studio/projects', json={'request_id': str(uuid4()),
        'csv_text': 'building,month,kwh\nA,2026-01,0e-99999999\n'})
    assert response.status_code == 201 and response.json()['data']['total_kwh'] == '0'
    assert response.json()['data']['rows'][0]['kwh'] == '0'
    response = client.post('/api/studio/projects', json={'request_id': str(uuid4()), 'csv_text': 'x' * 524289})
    assert response.status_code == 422
    response = client.post('/api/studio/projects', json={'request_id': str(uuid4()), 'sample': True, 'csv_text': 'anything'})
    assert response.status_code == 422


def test_saved_activities_survive_server_restart_and_all_routes_use_proxy_access(client, monkeypatch):
    body = {'request_id': str(uuid4()), 'sample': True}
    run = client.post('/api/studio/projects', json=body).json()
    restarted = create_app(str(client.app.state.sessions.kw['bind'].url))
    monkeypatch.setenv('AGENT_LAB_ADMIN_ORIGIN', 'https://admin.example')
    with TestClient(restarted, client=('203.0.113.7', 5000), headers={
        'host': 'admin.example', 'x-forwarded-proto': 'https', 'origin': 'https://admin.example',
    }) as remote:
        remote.base_url="https://admin.example"
        sign_in_admin(remote)
        assert remote.get(f'/api/studio/runs/{run["id"]}').json() == run
        assert remote.get(f'/api/studio/projects/{run["id"]}/export/summary.csv').status_code == 200
        assert remote.post('/api/studio/projects', json=body).json() == run
        remote.headers['origin'] = 'https://other.example'
        assert remote.post('/api/studio/projects', json=body).status_code == 403


def test_studio_migration_preserves_existing_missions(tmp_path, monkeypatch):
    from pathlib import Path
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import create_engine, inspect, text
    backend = Path(__file__).resolve().parents[1]
    url = f'sqlite:///{tmp_path / "upgrade.db"}'
    monkeypatch.setenv('DATABASE_URL', url)
    config = Config(str(backend / 'alembic.ini'))
    config.set_main_option('script_location', str(backend / 'migrations'))
    command.upgrade(config, '0003')
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO missions (id,prompt,scenario,status,created_at,output,mode) VALUES ('retained','Retain existing work','data','COMPLETED','2026-11-22','{}','simulation')"))
    command.upgrade(config, 'head')
    assert 'studio_runs' in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert connection.execute(text("SELECT prompt FROM missions WHERE id='retained'")).scalar() == 'Retain existing work'
    engine.dispose()


def test_studio_snapshots_and_exports_are_not_cached(client):
    created = client.post('/api/studio/projects', json={'request_id': str(uuid4()), 'sample': True})
    assert created.headers['cache-control'] == 'no-store'
    key = created.json()['id']
    for path in [f'/api/studio/runs/{key}', '/api/studio/runs?kind=project',
                 f'/api/studio/projects/{key}/export/chart.svg']:
        result = client.get(path)
        assert result.headers['cache-control'] == 'no-store'
