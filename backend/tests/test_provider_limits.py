import asyncio
import json
import httpx
import pytest
from app.provider import OpenAIProvider, RequestBudget, ProviderAccessError, ProviderRateLimit, provider_429
from app.live_schemas import FinalReport

@pytest.mark.parametrize('code',['insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded'])
def test_account_limits_do_not_retry_or_charge_rejected_request(monkeypatch,code):
    monkeypatch.setenv('OPENAI_API_KEY','test-secret')
    monkeypatch.setenv('OPENAI_MODEL','gpt-5.4-mini')
    provider=OpenAIProvider(transport=httpx.MockTransport(lambda request:httpx.Response(429,headers={'retry-after':'2'},json={'error':{'code':code,'type':'rate_limit_error','message':'PRIVATE_SECRET'}})))
    budget=RequestBudget(provider.limits,open_ended=True)
    with pytest.raises(ProviderAccessError) as error:
        asyncio.run(provider.generate(FinalReport,'Public',{},budget))
    assert error.value.provider_issue==code
    assert 'PRIVATE_SECRET' not in str(error.value)
    assert budget.calls==1 and budget.tokens==0 and budget.cost==0 and budget.uncertain_requests==0

def test_temporary_rate_limit_waits_for_provider_then_recovers(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','test-secret')
    monkeypatch.setenv('OPENAI_MODEL','gpt-5.4-mini')
    monkeypatch.setattr('app.provider.random.uniform',lambda a,b:0)
    delays=[];notices=[];calls=[]
    async def sleep(delay):delays.append(delay)
    monkeypatch.setattr('app.provider.asyncio.sleep',sleep)
    def respond(request):
        calls.append(request)
        if len(calls)==1:return httpx.Response(429,headers={'retry-after':'125'},json={'error':{'code':'rate_limit_exceeded'}})
        return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':100,'output_tokens':100},'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps({'title':'Recovered','content':'Saved work continues.','limitations':[]})}]}]})
    provider=OpenAIProvider(transport=httpx.MockTransport(respond))
    budget=RequestBudget(provider.limits,open_ended=True)
    budget.on_retry=lambda delay,attempt:notices.append((delay,attempt))
    result,usage=asyncio.run(provider.generate(FinalReport,'Public',{},budget))
    assert result.title=='Recovered'
    assert delays==[60,60,5] and notices==[(125,1)]
    assert budget.calls==2 and budget.tokens==200 and budget.uncertain_requests==0

@pytest.mark.parametrize('body',[{}, {'error':{'code':['bad'],'type':{}}}, {'error':{'message':'PRIVATE_SECRET'}}, []])
def test_unknown_429_is_sanitized_and_requires_manual_check(body):
    error=provider_429(httpx.Response(429,json=body))
    assert isinstance(error,ProviderAccessError) and error.provider_issue=='unknown_429'
    assert 'PRIVATE_SECRET' not in str(error)

def test_http_date_retry_after_is_supported():
    from datetime import datetime,timedelta,timezone
    from email.utils import format_datetime
    hint=format_datetime(datetime.now(timezone.utc)+timedelta(minutes=3))
    error=provider_429(httpx.Response(429,headers={'retry-after':hint},json={'error':{'type':'rate_limit_error'}}))
    assert isinstance(error,ProviderRateLimit) and 175<error.retry_after<=180
