import io
from zipfile import ZipFile
import pytest
from fastapi.testclient import TestClient
from docx import Document
from sqlalchemy import select
from app.db import Base,Mission,Event
from app.main import create_app

@pytest.fixture
def exports(tmp_path):
    app=create_app(f'sqlite:///{tmp_path / "exports.db"}',delay=0)
    Base.metadata.create_all(app.state.sessions.kw['bind'])
    with TestClient(app) as client:
        with app.state.sessions() as db:
            mission=Mission(prompt='Design a useful sensor system',scenario='data',mode='live',status='COMPLETED');db.add(mission);db.commit();key=mission.id
            app.state.runner.emit(db,key,'master.final_approved',{'summary':'All mission checks passed.'})
            app.state.runner.emit(db,key,'mission.completed',{'output':{'title':'Sensor study plan','content':'## Solution\nUse **two sensors**. [Study](https://example.org/study)\n\n| Item | Cost |\n| --- | --- |\n| Sensor | 20 |\n\n1. Pilot\n2. Validate','limitations':['Indicative costs need local quotes.'],'sources':[{'title':'Unsafe','url':'javascript:alert(1)'}]}})
        yield client,key

def test_package_keeps_goal_sources_and_limitations_without_new_events(exports):
    client,key=exports
    before=client.get(f'/api/missions/{key}/events').json()
    data=client.get(f'/api/missions/{key}/answer/package').json()
    assert data['master_approved'] is True and data['goal']=='Design a useful sensor system'
    assert data['sources']==[{'title':'Study','url':'https://example.org/study'}]
    assert data['limitations']==['Indicative costs need local quotes.']
    assert client.get(f'/api/missions/{key}/events').json()==before

def test_docx_download_is_a_real_editable_document(exports):
    client,key=exports
    response=client.post(f'/api/missions/{key}/answer/export',json={'format':'docx'})
    assert response.status_code==200,response.text
    assert response.headers['content-type'].startswith('application/vnd.openxmlformats-officedocument')
    assert '.docx' in response.headers['content-disposition']
    doc=Document(io.BytesIO(response.content));text='\n'.join(p.text for p in doc.paragraphs)
    for value in ['Sensor study plan','Original goal','Design a useful sensor system','Limitations and verification needs','Indicative costs need local quotes.','Sources']:assert value in text
    assert len(doc.tables)==1 and doc.tables[0].cell(1,0).text=='Sensor'
    assert any(p.style.name.startswith('Heading') and p.text=='Solution' for p in doc.paragraphs)
    with ZipFile(io.BytesIO(response.content)) as archive:
        relationships=archive.read('word/_rels/document.xml.rels').decode()
        assert 'https://example.org/study' in relationships and 'javascript:' not in relationships

def test_pdf_has_multiple_pages_for_long_answers_and_keeps_sources(exports):
    fitz=pytest.importorskip('fitz')
    client,key=exports
    with client.app.state.sessions() as db:
        event=db.scalar(select(Event).where(Event.mission_id==key,Event.type=='mission.completed'))
        event.payload={'output':{**event.payload['output'],'content':event.payload['output']['content']+'\n\n'+('\n\nDetailed validation and practical implementation steps. '*250)}};db.commit()
    response=client.post(f'/api/missions/{key}/answer/export',json={'format':'pdf'})
    assert response.status_code==200,response.text
    assert response.content.startswith(b'%PDF') and response.headers['content-type']=='application/pdf'
    pdf=fitz.open(stream=response.content,filetype='pdf');assert len(pdf)>1
    text='\n'.join(p.get_text() for p in pdf)
    assert 'Sensor study plan' in text and 'Limitations and verification needs' in text and 'https://example.org/study' in text

def test_prompt_export_uses_edited_text_and_labels_it_as_a_draft(exports):
    client,key=exports
    response=client.post(f'/api/missions/{key}/answer/export',json={'format':'docx','variant':'prompt','prompt_text':'# Task\nBuild an accessible prototype.\n\n# Acceptance\nTest with three users.'})
    doc=Document(io.BytesIO(response.content));text='\n'.join(p.text for p in doc.paragraphs)
    assert 'Build an accessible prototype.' in text and 'Test with three users.' in text
    assert 'review before use' in text and 'Master-approved mission answer' not in text
    assert client.post(f'/api/missions/{key}/answer/export',json={'format':'pdf','variant':'prompt'}).status_code==422

def test_unapproved_and_unfinished_missions_cannot_export_final_answers(exports):
    client,key=exports
    with client.app.state.sessions() as db:
        mission=db.get(Mission,key);mission.status='RUNNING';db.commit()
    assert client.get(f'/api/missions/{key}/answer/package').status_code==409
    with client.app.state.sessions() as db:
        mission=db.get(Mission,key);mission.status='COMPLETED'
        event=db.scalar(select(Event).where(Event.mission_id==key,Event.type=='master.final_approved'));db.delete(event);db.commit()
    assert client.post(f'/api/missions/{key}/answer/export',json={'format':'pdf'}).status_code==409

def test_exports_support_arabic_without_losing_logical_word_text(exports):
    client,key=exports
    with client.app.state.sessions() as db:
        event=db.scalar(select(Event).where(Event.mission_id==key,Event.type=='mission.completed'))
        event.payload={'output':{'title':'خطة تحسين الجودة','content':'## الحل المقترح\nنظام واضح يساعد المستخدم على فهم العمل ومتابعة تنفيذ المهام.\n\n| المهمة | الحالة |\n| --- | --- |\n| المراجعة | مكتملة |','limitations':['تحتاج البيانات إلى مراجعة محلية.']}};db.commit()
    response=client.post(f'/api/missions/{key}/answer/export',json={'format':'docx'})
    doc=Document(io.BytesIO(response.content));assert 'خطة تحسين الجودة' in '\n'.join(p.text for p in doc.paragraphs)
    with ZipFile(io.BytesIO(response.content)) as archive:assert b'w:bidi' in archive.read('word/document.xml')
    response=client.post(f'/api/missions/{key}/answer/export',json={'format':'pdf'})
    assert response.status_code==200 and response.content.startswith(b'%PDF')
