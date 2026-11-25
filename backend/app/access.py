"""Account-based access with one named super admin."""
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
    user = getattr(request.state, 'user', None)
    if user is not None:
        if user.role != 'super_admin':
            raise HTTPException(403, 'Only the super admin can manage accounts and workspaces.')
        return
    raise HTTPException(401, 'Sign in with an administrator-issued account.')


def require_user(request: Request):
    if getattr(request.state, 'user', None) is not None:
        return
    require_admin(request)
