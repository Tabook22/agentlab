"""Serve the disposable verification database with the real built app.

Run verify_skill_workflows.py first, then this script. Open 127.0.0.1:8028.
Fixture-only sign-in: nasser / fixture-only-password. No production credentials
or data are used, and this server cannot make external AI calls.
"""
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'tmp' / 'skill-verification' / 'report.json'
database = Path(json.loads(REPORT.read_text(encoding='utf-8'))['database']).resolve()
if database.parent != REPORT.parent.resolve():
    raise RuntimeError('The preview can open only its own disposable verification database.')
os.environ['DATABASE_URL'] = 'sqlite:///' + database.as_posix()
os.environ['OPENAI_API_KEY'] = ''
os.environ['AGENT_LAB_KEY_FILE'] = str(REPORT.parent / 'no-provider-key')
sys.path.insert(0, str(ROOT / 'backend'))

import httpx
import uvicorn
from fastapi.staticfiles import StaticFiles
from app.main import create_app
from app.provider import OpenAIProvider


def forbidden(request):
    raise RuntimeError('This disposable UI preview cannot call an external provider.')


app = create_app(delay=0, provider=OpenAIProvider(httpx.MockTransport(forbidden)))
app.mount('/', StaticFiles(directory=ROOT / 'frontend' / 'dist', html=True), name='preview')
if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8028)
