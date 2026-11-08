import asyncio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.voice import MAX_AUDIO_BYTES, voice_router

AUDIO=b'\x1aE\xdf\xa3'+b'example recorded audio '*10
HEADERS={'content-type':'audio/webm;codecs=opus','x-voice-input':'mission-composer'}


def make_client(monkeypatch,body=None,status=200):
    monkeypatch.setenv('OPENAI_API_KEY','voice-test-secret')
    requests=[]
    def respond(request):
        requests.append(request)
        assert request.url==httpx.URL('https://api.openai.com/v1/audio/transcriptions')
        assert request.headers['authorization']=='Bearer voice-test-secret'
        return httpx.Response(status,json={'text':'صمم دراسة للرعي في ظفار.'} if body is None else body)
    app=FastAPI();app.include_router(voice_router(httpx.MockTransport(respond)))
    return TestClient(app),requests


@pytest.mark.parametrize('language',['ar','en','auto'])
def test_transcription_uses_original_language_and_returns_editable_text(monkeypatch,language):
    client,requests=make_client(monkeypatch)
    result=client.post('/api/voice/transcribe?language='+language,content=AUDIO,headers=HEADERS)
    assert result.status_code==200,result.text
    assert result.json()['text']=='صمم دراسة للرعي في ظفار.'
    assert result.json()['model']=='gpt-transcribe'
    payload=requests[0].content
    assert b'gpt-transcribe' in payload and b'mission-voice.webm' in payload
    assert b'name="languages[]"' in payload
    assert (b'\r\n\r\n'+language.encode()+b'\r\n') in payload if language!='auto' else payload.count(b'name="languages[]"')==2
    assert 'voice-test-secret' not in result.text


@pytest.mark.parametrize('language',['fr','invalid'])
def test_unsupported_language_does_not_call_provider(monkeypatch,language):
    client,requests=make_client(monkeypatch)
    assert client.post('/api/voice/transcribe?language='+language,content=AUDIO,headers=HEADERS).status_code==422
    assert not requests


def test_invalid_empty_and_oversized_audio_never_calls_provider(monkeypatch):
    client,requests=make_client(monkeypatch)
    assert client.post('/api/voice/transcribe',content=b'',headers=HEADERS).status_code==422
    assert client.post('/api/voice/transcribe',content=b'not audio'*50,headers=HEADERS).status_code==422
    assert client.post('/api/voice/transcribe',content=AUDIO,headers={**HEADERS,'content-type':'text/plain'}).status_code==415
    assert client.post('/api/voice/transcribe',content=AUDIO,headers={**HEADERS,'content-length':str(MAX_AUDIO_BYTES+1)}).status_code==413
    assert not requests


def test_missing_key_and_unintended_submission_make_no_provider_call(monkeypatch):
    client,requests=make_client(monkeypatch)
    assert client.post('/api/voice/transcribe',content=AUDIO,headers={'content-type':'audio/webm'}).status_code==403
    monkeypatch.delenv('OPENAI_API_KEY')
    assert client.post('/api/voice/transcribe',content=AUDIO,headers=HEADERS).status_code==503
    assert not requests


@pytest.mark.parametrize('status',[400,401,403,429,500])
def test_provider_errors_are_sanitized_and_not_retried(monkeypatch,status):
    client,requests=make_client(monkeypatch,{'error':'PRIVATE_PROVIDER_MESSAGE'},status)
    response=client.post('/api/voice/transcribe',content=AUDIO,headers=HEADERS)
    assert response.status_code==502
    assert 'PRIVATE_PROVIDER_MESSAGE' not in response.text
    assert 'voice-test-secret' not in response.text
    assert len(requests)==1


@pytest.mark.parametrize('body',[{'text':''},{'text':'   '},{'text':None},{'text':[]},{}])
def test_empty_or_malformed_transcripts_are_not_inserted(monkeypatch,body):
    client,_=make_client(monkeypatch,body)
    response=client.post('/api/voice/transcribe',content=AUDIO,headers=HEADERS)
    assert response.status_code==422


def test_only_one_transcription_can_run_at_a_time(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','voice-test-secret')
    async def run():
        entered=asyncio.Event();release=asyncio.Event();calls=[]
        async def respond(request):
            calls.append(request);entered.set();await release.wait()
            return httpx.Response(200,json={'text':'A mission'})
        app=FastAPI();app.include_router(voice_router(httpx.MockTransport(respond)))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app),base_url='http://test') as client:
            first=asyncio.create_task(client.post('/api/voice/transcribe',content=AUDIO,headers=HEADERS))
            await entered.wait()
            second=await client.post('/api/voice/transcribe',content=AUDIO,headers=HEADERS)
            assert second.status_code==429 and len(calls)==1
            release.set();assert (await first).status_code==200
    asyncio.run(run())
