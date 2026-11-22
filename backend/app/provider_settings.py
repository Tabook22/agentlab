"""Write-only administrator credentials; never store keys in mission records."""
import asyncio
import json
import os
from pathlib import Path
import re
import tempfile
from fastapi import APIRouter, HTTPException, Request
from .config import provider_status
from .access import require_admin


def key_file_for(engine):
    configured=os.getenv('AGENT_LAB_KEY_FILE')
    if configured:return Path(configured).expanduser().resolve()
    database=engine.url.database if engine.url.drivername.startswith('sqlite') else None
    parent=Path(database).resolve().parent if database and database!=':memory:' else Path(__file__).resolve().parents[1]
    return parent/'.secrets'/'openai-api-key'


def load_saved_key(path):
    if path.is_file():
        value=path.read_text(encoding='utf-8').strip()
        if not re.fullmatch(r'sk-[A-Za-z0-9_-]{17,509}',value):
            raise RuntimeError('The saved OpenAI credential file is invalid.')
        os.environ['OPENAI_API_KEY']=value


def save_key(path,value):
    path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    temporary=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=path.parent,delete=False) as stream:
            temporary=Path(stream.name)
            os.chmod(temporary,0o600)
            stream.write(value+'\n');stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,path)
    finally:
        if temporary and temporary.exists():temporary.unlink()


def provider_settings_router(runner,path):
    router=APIRouter()

    @router.put('/api/settings/provider/key')
    async def update_key(request:Request):
        # On the VPS, Nginx enforces HTTPS Basic authentication and same-origin
        # writes. Opt in explicitly; the backend must remain loopback-only.
        origin=request.headers.get('origin','')
        local_origin=str(request.base_url).rstrip('/')
        proxy_origin=os.getenv('AGENT_LAB_ADMIN_ORIGIN','').rstrip('/')
        require_admin(request)
        if request.headers.get('x-admin-action')!='update-provider-key' or origin not in {local_origin,proxy_origin} or not origin:
            raise HTTPException(403,'Save the key from this app’s admin settings.')
        if request.headers.get('content-type','').split(';')[0]!='application/json':
            raise HTTPException(415,'Use the admin key form.')
        if runner.live_jobs:raise HTTPException(409,'Finish or cancel the active Live AI mission before changing the key.')
        raw=bytearray()
        try:
            async with asyncio.timeout(10):
                async for chunk in request.stream():
                    if len(raw)+len(chunk)>2048:raise HTTPException(413,'The submitted key is too long.')
                    raw.extend(chunk)
            body=json.loads(raw)
            value=body.get('api_key') if isinstance(body,dict) and set(body)=={'api_key'} else None
            if not isinstance(value,str) or not re.fullmatch(r'sk-[A-Za-z0-9_-]{17,509}',value.strip()):
                raise HTTPException(422,'Enter a complete OpenAI API key beginning with sk-.')
            value=value.strip()
            try:save_key(path,value)
            except OSError:raise HTTPException(500,'Could not save the key securely. Check server storage permissions.') from None
            os.environ['OPENAI_API_KEY']=value
            runner.provider.connected=False
            return provider_status()
        except (ValueError,UnicodeError):raise HTTPException(422,'Enter a valid key using the admin form.') from None
        except TimeoutError:raise HTTPException(408,'The key upload timed out. Try saving again.') from None
        finally:raw.clear()

    return router
