"""Authentication and isolation checks use only local simulation/mock data."""
import time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import Base, User, LoginSession, Mission, Attachment, StudioRun
from app.main import create_app

PASSWORD = 'classroom-password-123'


@pytest.fixture
def lab(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', '')
    monkeypatch.setenv('AGENT_LAB_ADMIN_ORIGIN', '')
    app = create_app(f'sqlite:///{tmp_path / "accounts.db"}', delay=0)
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    with TestClient(app) as admin:
        yield app, admin


def setup_admin(admin):
    response = admin.post('/api/auth/setup', json={'username': 'Teacher', 'password': PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()['user']


def add_user(admin, name):
    response = admin.post('/api/admin/users', json={'username': name, 'password': PASSWORD})
    assert response.status_code == 201, response.text
    return response.json()


def sign_in(client, name):
    response = client.post('/api/auth/login', json={'username': name, 'password': PASSWORD})
    assert response.status_code == 200, response.text


def test_first_admin_claims_legacy_records_and_setup_cannot_be_repeated(lab):
    app, admin = lab
    with app.state.sessions() as db:
        old = Mission(prompt='Existing teacher mission', scenario='concepts', status='COMPLETED')
        db.add(old); db.commit(); key = old.id
    assert admin.get('/api/auth/session').json()['configured'] is False
    assert admin.post('/api/admin/users', json={'username':'bypass', 'password':PASSWORD}).status_code == 401
    teacher = setup_admin(admin)
    assert teacher['username'] == 'teacher'
    assert admin.get(f'/api/missions/{key}').json()['owner_id'] == teacher['id']
    assert admin.post('/api/auth/setup', json={'username':'another', 'password':PASSWORD}).status_code == 409
    cookie = admin.cookies.get('agent_lab_session')
    with app.state.sessions() as db:
        user = db.get(User, teacher['id'])
        assert PASSWORD not in user.password_hash
        saved = db.scalar(select(LoginSession))
        assert saved.token_hash != cookie
    assert 'HttpOnly' in admin.post('/api/auth/login', json={'username':'teacher', 'password':PASSWORD}).headers['set-cookie']


def test_students_cannot_read_or_modify_other_work_or_admin_settings(lab):
    app, admin = lab
    teacher = setup_admin(admin)
    alice = add_user(admin, 'alice'); bob = add_user(admin, 'bob')
    with TestClient(app) as a, TestClient(app) as b, TestClient(app) as anonymous:
        sign_in(a, 'ALICE'); sign_in(b, 'bob')
        assert anonymous.get('/api/missions').status_code == 401
        assert a.get('/api/admin/users').status_code == 403
        assert a.post(f'/api/admin/workspace/{bob["id"]}').status_code == 403
        assert a.put('/api/settings/provider/key', json={'api_key':'sk-'+'x'*30}).status_code == 403
        assert a.post('/api/admin/users', json={'username':'mallory','password':PASSWORD}).status_code == 403
        mission = a.post('/api/missions', json={'prompt':'Explain agents for my class','scenario':'concepts'}).json()
        assert mission['owner_id'] == alice['id']
        key = mission['id']
        assert [m['id'] for m in a.get('/api/missions').json()] == [key]
        assert b.get('/api/missions').json() == []
        for path in (f'/api/missions/{key}', f'/api/missions/{key}/events', f'/api/missions/{key}/stream', f'/api/missions/{key}/answer/package'):
            assert b.get(path).status_code == 404, path
        assert b.post(f'/api/missions/{key}/cancel').status_code == 404
        assert b.post(f'/api/missions/{key}/answer/export',json={'format':'pdf'}).status_code == 404
        run = a.post('/api/studio/participation', json={'request_id':str(uuid4())}).json()
        assert a.get('/api/studio/runs?kind=participation').json()[0]['id'] == run['id']
        assert b.get('/api/studio/runs?kind=participation').json() == []
        assert b.get(f'/api/studio/runs/{run["id"]}').status_code == 404
        upload = a.post('/api/attachments?filename=alice.txt', content=b'Alice private source text.', headers={'x-attachment-upload':'mission-composer','content-type':'application/octet-stream'})
        assert upload.status_code == 201, upload.text
        source = upload.json()['id']
        for suffix in ('', '/original', '/thumbnail'):
            assert b.get(f'/api/attachments/{source}{suffix}').status_code == 404
        assert b.delete(f'/api/attachments/{source}').status_code == 404
        assert b.post('/api/missions',json={'mode':'simulation','prompt':'Use the other source','attachment_ids':[source]}).status_code == 422
        # Admin access is explicit, and new work remains in the selected user's workspace.
        assert admin.get('/api/missions').json() == []
        assert admin.post(f'/api/admin/workspace/{alice["id"]}').status_code == 200
        assert admin.get(f'/api/missions/{key}').status_code == 200
        assert admin.get('/api/studio/runs?kind=participation').json()[0]['id'] == run['id']
        helped = admin.post('/api/studio/participation',json={'request_id':str(uuid4())}).json()
        assert len(a.get('/api/studio/runs?kind=participation').json()) == 2
        with app.state.sessions() as db:
            assert db.get(StudioRun, helped['id']).owner_id == alice['id']
            assert db.get(Attachment, source).owner_id == alice['id']
        assert admin.post(f'/api/admin/workspace/{teacher["id"]}').status_code == 200
        assert admin.get('/api/studio/runs?kind=participation').json() == []


def test_credentials_disable_delete_expiry_and_logout_revoke_access(lab):
    app, admin = lab
    teacher = setup_admin(admin); alice = add_user(admin, 'alice')
    with TestClient(app) as student:
        sign_in(student, 'alice')
        assert admin.patch(f'/api/admin/users/{alice["id"]}', json={'username':'alice-new','password':'replacement-password'}).status_code == 200
        assert student.get('/api/missions').status_code == 401
        assert student.post('/api/auth/login',json={'username':'alice','password':PASSWORD}).status_code == 401
        assert student.post('/api/auth/login',json={'username':'alice-new','password':'replacement-password'}).status_code == 200
        assert admin.patch(f'/api/admin/users/{alice["id"]}',json={'active':False}).status_code == 200
        assert student.get('/api/missions').status_code == 401
        assert student.post('/api/auth/login',json={'username':'alice-new','password':'replacement-password'}).status_code == 401
        assert admin.patch(f'/api/admin/users/{alice["id"]}',json={'active':True}).status_code == 200
        assert student.post('/api/auth/login',json={'username':'alice-new','password':'replacement-password'}).status_code == 200
        assert student.post('/api/auth/logout').status_code == 200
        assert student.get('/api/missions').status_code == 401
        assert admin.delete(f'/api/admin/users/{teacher["id"]}').status_code == 409
        assert admin.patch(f'/api/admin/users/{teacher["id"]}',json={'active':False}).status_code == 409
        assert admin.post(f'/api/admin/workspace/{alice["id"]}').status_code == 200
        assert admin.delete(f'/api/admin/users/{alice["id"]}').status_code == 200
        assert len(admin.get('/api/admin/users').json()) == 1
        assert admin.get('/api/auth/session').json()['workspace']['id'] == teacher['id']
        assert student.post('/api/auth/login',json={'username':'alice-new','password':'replacement-password'}).status_code == 401
    with app.state.sessions() as db:
        for saved in db.scalars(select(LoginSession)):
            saved.expires_at = int(time.time()) - 1
        db.commit()
    assert admin.get('/api/admin/users').status_code == 401


def test_password_rules_duplicate_names_csrf_and_remote_login(lab):
    app, admin = lab
    assert admin.post('/api/auth/setup',json={'username':'teacher','password':'short'}).status_code == 422
    with TestClient(app,client=('203.0.113.1',1234)) as remote:
        assert remote.post('/api/auth/setup',json={'username':'teacher','password':PASSWORD}).status_code == 403
    setup_admin(admin); add_user(admin,'alice')
    assert admin.post('/api/admin/users',json={'username':'ALICE','password':PASSWORD}).status_code == 409
    assert admin.post('/api/admin/users',json={'username':'a b','password':PASSWORD}).status_code == 422
    assert admin.post('/api/admin/users',json={'username':'blocked','password':PASSWORD},headers={'Origin':'https://evil.example'}).status_code == 403
    with TestClient(app,client=('203.0.113.1',1234)) as remote:
        sign_in(remote,'alice')
        assert remote.get('/api/missions').status_code == 200
        assert remote.get('/api/admin/users').status_code == 403
    with TestClient(app) as attacker:
        for _ in range(10):
            assert attacker.post('/api/auth/login',json={'username':'unknown','password':'incorrect'}).status_code == 401
        assert attacker.post('/api/auth/login',json={'username':'teacher','password':PASSWORD}).status_code == 429


def test_stale_workspace_tabs_cannot_create_or_read_in_new_workspace(lab):
    _, admin = lab
    teacher = setup_admin(admin); alice = add_user(admin, 'alice')
    assert admin.post(f'/api/admin/workspace/{alice["id"]}').status_code == 200
    response = admin.post('/api/missions', json={'prompt':'Stale teacher tab must not create this mission'},
                          headers={'X-Workspace-Id':teacher['id']})
    assert response.status_code == 409
    assert response.headers['X-Workspace-Changed'] == 'true'
    assert admin.get('/api/missions').json() == []
    assert admin.get('/api/missions',headers={'X-Workspace-Id':teacher['id']}).status_code == 409
    assert admin.get('/api/missions',headers={'X-Workspace-Id':alice['id']}).status_code == 200


def test_student_live_work_and_admin_help_keep_original_owner(lab, monkeypatch):
    from test_live import mock_transport, start, finish
    app, admin = lab
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key')
    monkeypatch.setenv('OPENAI_MODEL','gpt-5.4-mini')
    transport, requests = mock_transport(delay=.01)
    app.state.runner.provider.transport = transport
    teacher = setup_admin(admin); alice = add_user(admin,'alice')
    # Use an independent cookie jar without entering a second app lifespan.
    student = TestClient(app)
    student.__enter__()
    try:
        sign_in(student,'alice')
        key = start(student)
        assert admin.post(f'/api/admin/workspace/{alice["id"]}').status_code == 200
        assert admin.get(f'/api/missions/{key}').status_code == 200
        # Switching the admin away must not change a running student's job.
        assert admin.post(f'/api/admin/workspace/{teacher["id"]}').status_code == 200
        result = finish(student,key)
        assert result['status'] == 'COMPLETED', result
        assert result['owner_id'] == alice['id']
        assert requests
        assert student.get(f'/api/missions/{key}/answer/package').status_code == 200
        assert admin.get(f'/api/missions/{key}').status_code == 404
        assert student.post(f'/api/missions/{key}/limits/approve',json={'request_id':'x','new_limit':2}).status_code == 403
        assert student.post(f'/api/missions/{key}/budget/approve',json={'request_id':'x','new_limit_usd':2}).status_code == 403
        assert student.post(f'/api/missions/{key}/execution/open').status_code == 403
        assert student.post(f'/api/missions/{key}/retry?extend_cycles=true').status_code == 403
    finally:
        student.__exit__(None,None,None)
