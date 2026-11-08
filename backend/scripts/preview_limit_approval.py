"""No-cost browser fixture: first and third cycles pause; fourth cycle passes."""
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
transport,_=fixture['mock_transport'](workers=1)
provider=OpenAIProvider(transport);original=provider.generate
async def generate(schema,instructions,data,budget,**kwargs):
    result=await original(schema,instructions,data,budget,**kwargs)
    if schema.__name__=='WorkerReview' and data['task']!='Verify the whole mission':
        for check in result[0].checks:check.passed=data['context']['cycle']>=4
    return result
provider.generate=generate
folder=root/'.pytest-tmp-limit-browser';folder.mkdir(exist_ok=True)
app=create_app('sqlite:///'+str(folder/'preview.db'),delay=.1,provider=provider)
Base.metadata.create_all(app.state.sessions.kw['bind'])
if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=8001)
