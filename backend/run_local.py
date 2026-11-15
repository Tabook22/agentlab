"""Local-only launcher: project .env takes precedence inside this process only."""
from pathlib import Path
import os
from dotenv import load_dotenv
import uvicorn

if __name__=='__main__':
    load_dotenv(Path(__file__).resolve().parent / '.env',override=True)
    uvicorn.run('app.main:app',host='127.0.0.1',port=int(os.getenv('AGENT_LAB_PORT','8010')))
