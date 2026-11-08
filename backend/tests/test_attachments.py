import asyncio
import io
import json
from zipfile import ZipFile
import httpx
import pytest
from PIL import Image
from docx import Document
from fastapi.testclient import TestClient
from app.db import Base,Attachment,Event,Mission
from app.main import create_app
from app.provider import OpenAIProvider
from app.attachments import parse_source
from test_live import mock_transport,wait_for_report,finish

@pytest.fixture
def uploads(tmp_path,monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','local-test-key');monkeypatch.setenv('OPENAI_MODEL','gpt-5.4-mini')
    base,requests=mock_transport();visual_calls=[];wrong_labels=[False]
    async def respond(request):
        body=json.loads(request.content)
        if body['text']['format']['name']!='VisualReading':return await base.handle_async_request(request)
        visual_calls.append(body)
        data=json.loads(body['input'][0]['content'][0]['text'])
        result={'pages':[{'label':'Wrong label' if wrong_labels[0] else label,'text':'Deliver an accessible dashboard in Arabic and English.','visual_description':'A task diagram with review before approval.','uncertainties':['One small label is unclear.']} for label in data['labels']]}
        return httpx.Response(200,json={'status':'completed','usage':{'input_tokens':100,'output_tokens':100},'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':json.dumps(result)}]}]})
    app=create_app(f'sqlite:///{tmp_path / "uploads.db"}',delay=0,provider=OpenAIProvider(httpx.MockTransport(respond)))
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    with TestClient(app) as client:yield client,requests,visual_calls,wrong_labels

def upload(client,name,data):return client.post('/api/attachments',params={'filename':name},content=data,headers={'X-Attachment-Upload':'mission-composer','Content-Type':'application/octet-stream'})
def png():
    stream=io.BytesIO();Image.new('RGB',(80,50),'white').save(stream,format='PNG');return stream.getvalue()

def test_text_upload_is_local_complete_and_reviewable(uploads):
    client,requests,vision,_=uploads
    response=upload(client,'تعليمات.txt','متطلبات المهمة\nSENSOR_SOURCE_ABC\nUse the table as evidence.'.encode())
    assert response.status_code==201,response.text
    data=response.json();assert data['status']=='ready' and data['text'].startswith('متطلبات المهمة')
    assert len(data['sha256'])==64 and requests==[] and vision==[]
    assert client.get(f'/api/attachments/{data["id"]}').json()['text']==data['text']
    assert client.get(f'/api/attachments/{data["id"]}/original').content=='متطلبات المهمة\nSENSOR_SOURCE_ABC\nUse the table as evidence.'.encode()

def test_word_preserves_paragraph_and_table_order():
    doc=Document();doc.add_paragraph('First paragraph');table=doc.add_table(rows=1,cols=2);table.cell(0,0).text='Metric';table.cell(0,1).text='Value';doc.add_paragraph('Last paragraph');stream=io.BytesIO();doc.save(stream)
    result=parse_source(stream.getvalue(),'requirements.docx')
    assert result['text'].index('First paragraph')<result['text'].index('Metric | Value')<result['text'].index('Last paragraph')
    assert result['visuals']==[] and result['page_count']==0

def test_pdf_reads_every_page_and_marks_scanned_pages():
    import fitz
    doc=fitz.open();page=doc.new_page();page.insert_text((60,60),'First page requirements');page=doc.new_page();page.insert_image(fitz.Rect(0,0,500,700),stream=png());raw=doc.tobytes();doc.close()
    result=parse_source(raw,'source.pdf')
    assert result['page_count']==2 and '[Page 1]' in result['text'] and '[Page 2]' in result['text']
    assert 'First page requirements' in result['text'] and result['visuals'][0][0]=='Page 2'

def test_images_require_explicit_reading_and_keep_usage(uploads):
    client,requests,vision,_=uploads
    data=upload(client,'diagram.png',png()).json();identifier=data['id']
    assert data['status']=='needs_reading' and vision==[]
    assert client.get(f'/api/attachments/{identifier}/thumbnail').headers['content-type']=='image/png'
    assert client.post('/api/missions',json={'prompt':'Explain this diagram.','mode':'live','attachment_ids':[identifier]}).status_code==409
    assert client.post(f'/api/attachments/{identifier}/read',json={'comments':'   '}).status_code==422
    response=client.post(f'/api/attachments/{identifier}/read',json={'comments':'Explain the requirements and review process.'})
    assert response.status_code==200,response.text
    result=response.json();assert result['status']=='ready' and 'accessible dashboard' in result['text']
    assert any('unclear' in note for note in result['notices']) and result['reading_usage']['calls']==1
    assert 'base64,' in vision[0]['input'][0]['content'][2]['image_url']
    assert json.loads(vision[0]['input'][0]['content'][0]['text'])['user_comments']=='Explain the requirements and review process.'
    assert client.post(f'/api/attachments/{identifier}/read',json={'comments':'Explain the requirements and review process.'}).status_code==200
    assert len(vision)==1 and requests==[]

def test_incomplete_visual_coverage_does_not_become_ready(uploads):
    client,_,vision,wrong=uploads;wrong[0]=True
    identifier=upload(client,'diagram.png',png()).json()['id']
    response=client.post(f'/api/attachments/{identifier}/read',json={'comments':'Explain the diagram.'})
    assert response.status_code==502
    data=client.get(f'/api/attachments/{identifier}').json();assert data['status']=='needs_reading' and data['reading_usage']['calls']==1
    assert len(vision)==1

def test_sources_reach_planning_workers_and_final_review_without_bypassing_approval(uploads):
    client,requests,vision,_=uploads
    source=upload(client,'requirements.txt',b'SENSOR_SOURCE_ABC: include a comparison table and explicit validation.').json()
    created=client.post('/api/missions',json={'prompt':'Prepare a solution using the supplied requirements.','mode':'live','attachment_ids':[source['id']]})
    assert created.status_code==201,created.text
    key=created.json()['id'];mission,report=wait_for_report(client,key)
    assert mission['status']=='AWAITING_APPROVAL' and mission['agents']==[]
    first=json.loads(requests[0]['input']);assert first['mission']=='Prepare a solution using the supplied requirements.'
    assert first['attachments'][0]['text'].startswith('SENSOR_SOURCE_ABC')
    assert 'untrusted supporting evidence' in requests[0]['instructions']
    recorded=client.get(f'/api/missions/{key}/events').json();assert recorded[0]['payload']['attachment_ids']==[source['id']]
    assert client.delete(f'/api/attachments/{source["id"]}').status_code==409
    assert client.post(f'/api/missions/{key}/plan/approve',json={'plan_id':report['id'],'total_budget_usd':.2}).status_code==200
    assert finish(client,key)['status']=='COMPLETED'
    for request in requests:
        data=json.loads(request['input']);assert data.get('attachments') or data.get('context',{}).get('attachments')
    assert vision==[]

@pytest.mark.parametrize('name,data',[('bad.exe',b'abc'),('empty.txt',b''),('binary.txt',b'abc\x00def'),('bad.pdf',b'not a pdf'),('bad.docx',b'not a word file'),('bad.png',b'not an image')])
def test_invalid_files_are_rejected_without_provider_calls(uploads,name,data):
    client,requests,vision,_=uploads
    assert upload(client,name,data).status_code in (415,422)
    assert requests==[] and vision==[]

def test_unused_upload_can_be_removed_and_simulation_cannot_claim_file_analysis(uploads):
    client,_,_,_=uploads
    identifier=upload(client,'notes.txt',b'Important source text').json()['id']
    assert client.post('/api/missions',json={'prompt':'Use my source file.','mode':'simulation','attachment_ids':[identifier]}).status_code==422
    assert client.delete(f'/api/attachments/{identifier}').status_code==204
    assert client.get(f'/api/attachments/{identifier}').status_code==404


def illustrated_word(count=12):
    doc=Document();doc.add_paragraph('Complete student guide text must survive upload.')
    for i in range(count):
        stream=io.BytesIO();Image.new('RGB',(30,30),(i,20,80)).save(stream,format='PNG');stream.seek(0);doc.add_picture(stream)
    stream=io.BytesIO();doc.save(stream);return stream.getvalue()


def test_twelve_image_word_reads_every_image_in_three_batches(uploads):
    client,_,vision,_=uploads
    uploaded=upload(client,'illustrated-guide.docx',illustrated_word())
    assert uploaded.status_code==201,uploaded.text
    data=uploaded.json();assert len(data['visual_labels'])==12 and 'Complete student guide' in data['text']
    response=client.post(f"/api/attachments/{data['id']}/read",json={'comments':'Read all illustrations carefully.'})
    assert response.status_code==200,response.text
    result=response.json();assert result['status']=='ready' and result['reading_progress']['completed']==12
    assert result['reading_usage']['calls']==3 and len(vision)==3
    assert [len(json.loads(v['input'][0]['content'][0]['text'])['labels']) for v in vision]==[4,4,4]
    assert result['text'].count('[AI visual reading:')==12


def test_batch_failure_retains_evidence_and_retry_skips_completed_batch(uploads):
    client,_,vision,wrong=uploads
    # First read one batch successfully, then fail coverage in the second.
    original=client.app.state.runner.provider.generate
    calls=0
    async def fail_second(*args,**kwargs):
        nonlocal calls
        calls+=1
        wrong[0]=calls==2
        return await original(*args,**kwargs)
    client.app.state.runner.provider.generate=fail_second
    data=upload(client,'illustrated-guide.docx',illustrated_word()).json()
    url=f"/api/attachments/{data['id']}/read";body={'comments':'Read all illustrations carefully.'}
    response=client.post(url,json=body);assert response.status_code==502,response.text
    partial=client.get(f"/api/attachments/{data['id']}").json()
    assert partial['status']=='needs_reading' and partial['reading_progress']['completed']==4
    assert partial['reading_usage']['calls']==2 and partial['text'].count('[AI visual reading:')==4
    response=client.post(url,json=body);assert response.status_code==200,response.text
    result=response.json();assert result['reading_usage']['calls']==4 and result['reading_progress']['completed']==12
    labels=[json.loads(v['input'][0]['content'][0]['text'])['labels'] for v in vision]
    assert labels[1]==labels[2] and labels[0]!=labels[2]
