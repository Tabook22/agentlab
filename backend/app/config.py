"""Load local backend settings without returning credentials to clients."""
import os
from pathlib import Path
from dotenv import load_dotenv
from dataclasses import asdict
from .provider import LiveLimits


def load_backend_environment(path=None):
    # Explicit path avoids picking up unrelated parent-directory .env files.
    # Deployment-provided process variables take precedence over the local file.
    load_dotenv(path or Path(__file__).resolve().parents[1] / '.env', override=False)


def provider_status():
    return {
        'provider': 'openai',
        'key_present': bool(os.getenv('OPENAI_API_KEY', '').strip()),
        'connection_tested': False,
        'live_enabled': bool(os.getenv('OPENAI_API_KEY', '').strip()),
        'model': os.getenv('OPENAI_MODEL','gpt-5.4-mini'),
        'limits': asdict(LiveLimits()),
        'tools': ['write_text','calculate','inspect_context','web_research'],
        'access': 'loopback-only',
    }
