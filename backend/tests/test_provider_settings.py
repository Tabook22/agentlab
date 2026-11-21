import os
import stat
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.db import Base
from app.provider import OpenAIProvider
from app.provider_settings import load_saved_key

KEY='sk-proj-'+('test_only_not_real_'*4)
HEADERS={'origin':'http://testserver','x-admin-action':'update-provider-key'}

@pytest.fixture
def configured_app(tmp_path,monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','')
    monkeypatch.delenv('AGENT_LAB_ADMIN_ORIGIN',raising=False)
    path=tmp_path/'private'/'openai-api-key'
    monkeypatch.setenv('AGENT_LAB_KEY_FILE',str(path))
    calls=[]
    def respond(request):
        calls.append(request)
        assert request.headers['authorization']=='Bearer '+KEY
        return httpx.Response(200,json={'text':'Test transcript'})
    app=create_app(f'sqlite:///{tmp_path / "settings.db"}',provider=OpenAIProvider(httpx.MockTransport(respond)))
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    return app,path,calls

def test_save_is_write_only_persistent_and_enables_voice_without_restart(configured_app,monkeypatch):
    app,path,calls=configured_app
    with TestClient(app) as client:
        app.state.runner.provider.connected=True
        response=client.put('/api/settings/provider/key',json={'api_key':KEY},headers=HEADERS)
        assert response.status_code==200,response.text
        assert response.json()['key_present'] and not response.json()['connection_tested']
        assert not calls
        assert KEY not in response.text and response.headers['cache-control']=='no-store'
        status=client.get('/api/settings/provider')
        assert KEY not in status.text and status.json()['live_enabled']
        assert path.read_text().strip()==KEY
        if os.name!='nt':assert stat.S_IMODE(path.stat().st_mode)==0o600
        audio=b'\x1aE\xdf\xa3'+b'test recording'*20
        result=client.post('/api/voice/transcribe',content=audio,headers={'content-type':'audio/webm','x-voice-input':'mission-composer'})
        assert result.status_code==200 and result.json()['text']=='Test transcript'
        assert len(calls)==1
        monkeypatch.setenv('OPENAI_API_KEY','')
        load_saved_key(path)
        assert os.getenv('OPENAI_API_KEY')==KEY

def test_replacement_survives_app_restart_and_empty_service_environment(configured_app,monkeypatch):
    app,path,_=configured_app
    replacement='sk-'+('replacement_only_'*4)
    with TestClient(app) as client:
        for value in [KEY,replacement]:
            assert client.put('/api/settings/provider/key',json={'api_key':value},headers=HEADERS).status_code==200
    monkeypatch.setenv('OPENAI_API_KEY','')
    restarted=create_app(str(app.state.sessions.kw['bind'].url))
    with TestClient(restarted) as client:
        assert client.get('/api/settings/provider').json()['key_present']
        assert os.getenv('OPENAI_API_KEY')==replacement
        assert path.read_text().strip()==replacement

@pytest.mark.parametrize('payload',[{'api_key':'bad'}, {'api_key':KEY+'\nsecret'}, {'api_key':['secret']},{'other':KEY},{'api_key':KEY,'other':1}])
def test_bad_inputs_never_echo_or_persist_credentials(configured_app,payload):
    app,path,_=configured_app
    with TestClient(app) as client:
        result=client.put('/api/settings/provider/key',json=payload,headers=HEADERS)
        assert result.status_code==422 and KEY not in result.text and not path.exists()

def test_cross_origin_oversized_and_malformed_submissions_are_rejected(configured_app):
    app,path,_=configured_app
    with TestClient(app) as client:
        for headers in [{},{**HEADERS,'origin':'https://unrelated.example'}]:
            assert client.put('/api/settings/provider/key',json={'api_key':KEY},headers=headers).status_code==403
        assert client.put('/api/settings/provider/key',content='x'*2049,headers={**HEADERS,'content-type':'application/json'}).status_code==413
        assert client.put('/api/settings/provider/key',content='{"api_key":'+KEY,headers={**HEADERS,'content-type':'application/json'}).status_code==422
        assert not path.exists()

def test_remote_access_requires_explicit_authenticated_proxy_configuration(configured_app,monkeypatch):
    app,path,_=configured_app
    proxy_headers={**HEADERS,'origin':'https://admin.example','host':'admin.example','x-forwarded-proto':'https'}
    with TestClient(app,client=('203.0.113.7',4000)) as client:
        assert client.put('/api/settings/provider/key',json={'api_key':KEY},headers=proxy_headers).status_code==403
        monkeypatch.setenv('AGENT_LAB_ADMIN_ORIGIN','https://admin.example')
        assert client.put('/api/settings/provider/key',json={'api_key':KEY},headers=proxy_headers).status_code==200

def test_replacement_resets_verification_and_failed_write_keeps_previous_key(configured_app,monkeypatch):
    app,path,_=configured_app
    with TestClient(app) as client:
        assert client.put('/api/settings/provider/key',json={'api_key':KEY},headers=HEADERS).status_code==200
        def fail(*args):raise OSError('internal failure '+KEY)
        monkeypatch.setattr('app.provider_settings.save_key',fail)
        replacement='sk-'+('replacement_'*5)
        result=client.put('/api/settings/provider/key',json={'api_key':replacement},headers=HEADERS)
        assert result.status_code==500 and KEY not in result.text and replacement not in result.text
        assert os.getenv('OPENAI_API_KEY')==KEY and path.read_text().strip()==KEY
        app.state.runner.live_jobs.add('active')
        assert client.put('/api/settings/provider/key',json={'api_key':replacement},headers=HEADERS).status_code==409
        app.state.runner.live_jobs.clear()
