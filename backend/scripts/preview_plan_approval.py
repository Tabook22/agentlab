"""No-cost local browser test: all provider responses use the existing mock transport."""
import os,sys,runpy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
os.environ['OPENAI_API_KEY']='local-test-key'
os.environ['OPENAI_MODEL']='gpt-5.4-mini'
from app.main import create_app
from app.db import Base
from app.provider import OpenAIProvider
fixture=runpy.run_path(str(root/'tests'/'test_live.py'))
transport,_=fixture['mock_transport'](workers=2)
folder=root/'.pytest-tmp-plan-browser';folder.mkdir(exist_ok=True)
app=create_app('sqlite:///'+str(folder/'preview.db'),delay=.1,provider=OpenAIProvider(transport))
Base.metadata.create_all(app.state.sessions.kw['bind'])
if __name__=='__main__':
 import uvicorn
 uvicorn.run(app,host='127.0.0.1',port=8001)
