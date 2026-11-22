"""Single-user access through loopback or the configured authenticated proxy."""
import os
from fastapi import HTTPException, Request


def admin_access_allowed(request: Request):
    if request.client and request.client.host in ('127.0.0.1', '::1', 'testclient'):
        return True
    # Nginx authenticates users, overwrites forwarded headers, and enforces
    # same-origin writes. The backend must stay bound to loopback. Uvicorn
    # replaces request.client with the forwarded public address in this setup.
    origin = os.getenv('AGENT_LAB_ADMIN_ORIGIN', '').rstrip('/')
    return bool(origin.startswith('https://') and
                request.headers.get('x-forwarded-proto') == 'https' and
                'https://' + request.headers.get('host', '') == origin and
                (request.method in ('GET', 'HEAD', 'OPTIONS') or
                 request.headers.get('origin') == origin))


def require_admin(request: Request):
    if not admin_access_allowed(request):
        raise HTTPException(403, 'Use this app locally or sign in through its configured HTTPS administrator proxy.')
