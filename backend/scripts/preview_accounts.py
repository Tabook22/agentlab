"""Disposable, loopback-only account UI fixture. Never uses the real lab DB/key.

Run from backend: python scripts/preview_accounts.py
Open http://127.0.0.1:8026 and sign in as qa-teacher / preview-password-123.
These credentials belong only to a newly generated temporary fixture database.
"""
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
folder = Path(tempfile.mkdtemp(prefix='agent-lab-accounts-'))
os.environ['DATABASE_URL'] = 'sqlite:///' + (folder / 'preview.db').as_posix()
os.environ['OPENAI_API_KEY'] = ''
os.environ['AGENT_LAB_KEY_FILE'] = str(folder / 'no-provider-key')

import httpx
import uvicorn
from fastapi.staticfiles import StaticFiles
from app.main import create_app
from app.db import Base, User, Mission
from app.accounts import hash_password
from app.provider import OpenAIProvider


def no_provider(request):
    raise RuntimeError('This UI fixture cannot call an AI provider.')


app = create_app(delay=0, provider=OpenAIProvider(httpx.MockTransport(no_provider)))
Base.metadata.create_all(app.state.sessions.kw['bind'])
with app.state.sessions() as db:
    teacher = User(username='qa-teacher', password_hash=hash_password('preview-password-123'), role='admin')
    alice = User(username='qa-alice', password_hash=hash_password('preview-password-123'))
    bob = User(username='qa-bob', password_hash=hash_password('preview-password-123'))
    db.add_all([teacher, alice, bob]); db.flush()
    db.add(Mission(prompt='Alice’s private classroom exercise', scenario='concepts', status='COMPLETED', owner_id=alice.id))
    db.commit()
app.mount('/', StaticFiles(directory=Path(__file__).resolve().parents[2] / 'frontend' / 'dist', html=True), name='preview')

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8026)
