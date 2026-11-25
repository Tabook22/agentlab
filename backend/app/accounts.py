"""Account authentication and request-scoped workspace ownership."""
import asyncio
import hashlib
import hmac
import secrets
import time
import unicodedata
from contextvars import ContextVar
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import delete, event, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import with_loader_criteria

from .access import require_admin as check_admin
from .db import User, LoginSession, Mission, Attachment, StudioRun, Agent, Task, Event

workspace = ContextVar('workspace', default=None)
COOKIE = 'agent_lab_session'
OWNED = (Mission, Attachment, StudioRun)


def require_admin(request):
    if getattr(request.state, 'user', None) is None:
        raise HTTPException(401, 'Sign in as Nasser, the super admin, first.')
    check_admin(request)


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f'scrypt${salt}${digest}'


def verify_password(password, encoded):
    try:
        _, salt, expected = encoded.split('$')
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def username(value):
    value = unicodedata.normalize('NFKC', value).strip().casefold()
    if not 3 <= len(value) <= 80 or any(not (c.isalnum() or c in '._-') for c in value):
        raise HTTPException(422, 'Use 3–80 letters, numbers, dots, underscores or hyphens for the username.')
    return value


def public_user(row):
    return {name: getattr(row, name) for name in ('id', 'username', 'role', 'active', 'created_at')}


class Credentials(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=10, max_length=256)


class Login(BaseModel):
    username: str = Field(max_length=80)
    password: str = Field(max_length=256)


class UserEdit(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str | None = Field(default=None, min_length=3, max_length=80)
    password: str | None = Field(default=None, min_length=10, max_length=256)
    active: bool | None = None


def install_accounts(app, sessions, runner):
    # Apply ownership to all ORM reads, including get(), exports and retries.
    # Background jobs inherit the workspace context when started, so their work
    # stays with the original owner even if the admin switches workspaces.
    @event.listens_for(sessions, 'do_orm_execute')
    def scoped_queries(state):
        owner = workspace.get()
        if owner is None:
            return
        statement = state.statement
        for model in OWNED:
            statement = statement.options(with_loader_criteria(model, model.owner_id == owner, include_aliases=True))
        mission_ids = select(Mission.id).where(Mission.owner_id == owner)
        for model in (Agent, Task, Event):
            statement = statement.options(with_loader_criteria(model, model.mission_id.in_(mission_ids), include_aliases=True))
        state.statement = statement

    @event.listens_for(sessions, 'before_flush')
    def assign_owner(db, *_):
        owner = workspace.get()
        if owner is not None:
            for row in db.new:
                if isinstance(row, OWNED):
                    row.owner_id = owner

    def identify(request, db):
        token = request.cookies.get(COOKIE, '')
        saved = db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest()) if token else None
        user = db.get(User, saved.user_id) if saved and saved.expires_at > time.time() else None
        if not user or not user.active or user.deleted:
            return None, None
        target = db.get(User, saved.workspace_id)
        if not target or target.deleted or (user.role != 'super_admin' and target.id != user.id):
            return None, None
        return user, saved

    def session_active(request, owner):
        with sessions() as db:
            user, saved = identify(request, db)
            return bool(user and saved and saved.workspace_id == owner)

    app.state.account_session_active = session_active

    def issue(db, user, request):
        raw = secrets.token_urlsafe(32)
        db.add(LoginSession(token_hash=hashlib.sha256(raw.encode()).hexdigest(), user_id=user.id,
                            workspace_id=user.id, expires_at=int(time.time()) + 12 * 3600))
        db.execute(delete(LoginSession).where(LoginSession.expires_at < int(time.time())))
        db.commit()
        response = JSONResponse({'user': public_user(user), 'workspace': public_user(user)})
        response.set_cookie(COOKIE, raw, httponly=True, samesite='strict', max_age=12 * 3600,
                            secure=request.url.scheme == 'https' or request.headers.get('x-forwarded-proto') == 'https')
        return response

    @app.middleware('http')
    async def authenticate(request, call_next):
        if not request.url.path.startswith('/api/') or request.url.path == '/api/health':
            return await call_next(request)
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('origin')
            if request.headers.get('x-forwarded-proto') == 'https' and not origin:
                return JSONResponse({'detail': 'Use the application from its HTTPS page.'}, status_code=403)
            # SameSite cookies plus origin validation also protect login/setup.
            if origin and urlsplit(origin).netloc != request.headers.get('host'):
                return JSONResponse({'detail': 'Use this application from the same origin.'}, status_code=403)
        with sessions() as db:
            user, saved = identify(request, db)
            request.state.user = user
            request.state.login_session = saved
            scope = saved.workspace_id if saved else None
        if not user and not request.url.path.startswith('/api/auth/'):
            return JSONResponse({'detail': 'Sign in to your workspace.'}, status_code=401)
        claimed_scope = request.headers.get('x-workspace-id') or request.query_params.get('workspace_id')
        if scope is not None and claimed_scope and claimed_scope != scope:
            return JSONResponse({'detail': 'Your workspace changed in another tab. Refresh before continuing.'},
                                status_code=409, headers={'X-Workspace-Changed': 'true'})
        token = workspace.set(scope)
        try:
            response = await call_next(request)
            response.headers['Cache-Control'] = 'no-store'
            return response
        finally:
            workspace.reset(token)

    router = APIRouter()
    attempts = {}
    dummy_hash = hash_password(secrets.token_urlsafe(24))

    @router.get('/api/auth/session')
    def session(request: Request):
        with sessions() as db:
            configured = db.scalar(select(User.id).limit(1)) is not None
            user, saved = identify(request, db)
            return {'configured': configured, 'can_setup': False,
                    'user': public_user(user) if user else None,
                    'workspace': public_user(db.get(User, saved.workspace_id)) if saved else None}

    @router.post('/api/auth/setup')
    def setup():
        raise HTTPException(403, 'Self-registration is disabled. Only Nasser, the super admin, can create user accounts and workspaces.')

    @router.post('/api/auth/login')
    def login(body: Login, request: Request):
        address = request.client.host if request.client else 'unknown'
        current = time.monotonic()
        # Bounded per-address attempt windows; successful logins clear failures.
        for key in list(attempts):
            if attempts[key][0] < current - 300:
                del attempts[key]
        start, count = attempts.get(address, (current, 0))
        if count >= 10:
            raise HTTPException(429, 'Too many sign-in attempts. Try again in five minutes.')
        attempts[address] = (start, count + 1)
        with sessions() as db:
            normalized = unicodedata.normalize('NFKC', body.username).strip().casefold()
            user = db.scalar(select(User).where(User.username == normalized))
            valid = verify_password(body.password, user.password_hash if user else dummy_hash)
            if not valid or not user or not user.active or user.deleted:
                raise HTTPException(401, 'Username or password is incorrect, or this account is disabled.')
            attempts.pop(address, None)
            # Replace this browser's old login rather than leaving it usable.
            if request.state.login_session:
                db.execute(delete(LoginSession).where(LoginSession.token_hash == request.state.login_session.token_hash))
            return issue(db, user, request)

    @router.post('/api/auth/logout')
    def logout(request: Request):
        with sessions() as db:
            raw = request.cookies.get(COOKIE, '')
            db.execute(delete(LoginSession).where(LoginSession.token_hash == hashlib.sha256(raw.encode()).hexdigest()))
            db.commit()
        response = JSONResponse({'signed_out': True})
        response.delete_cookie(COOKIE)
        return response

    @router.get('/api/admin/users')
    def users(request: Request):
        require_admin(request)
        with sessions() as db:
            return [public_user(user) for user in db.scalars(select(User).where(User.deleted == False).order_by(User.created_at))]

    @router.post('/api/admin/users', status_code=201)
    def create_user(body: Credentials, request: Request):
        require_admin(request)
        if username(body.username) == 'nasser':
            raise HTTPException(409, 'Nasser is the reserved super-admin account.')
        with sessions() as db:
            user = User(username=username(body.username), password_hash=hash_password(body.password))
            db.add(user)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                raise HTTPException(409, 'That username is already in use.') from None
            return public_user(user)

    async def stop_work(user_id):
        # Cancellation uses an explicit temporary scope, not the admin's current
        # workspace. Await cleanup before access is withdrawn.
        token = workspace.set(user_id)
        try:
            with sessions() as db:
                keys = list(db.scalars(select(Mission.id)))
            jobs = [runner.jobs[key] for key in keys if key in runner.jobs]
            for job in jobs:
                job.cancel()
            if jobs:
                await asyncio.gather(*jobs, return_exceptions=True)
        finally:
            workspace.reset(token)

    @router.patch('/api/admin/users/{key}')
    async def edit_user(key: str, body: UserEdit, request: Request):
        require_admin(request)
        if body.active is False and key == request.state.user.id:
            raise HTTPException(409, 'You cannot disable your administrator account.')
        if body.active is False:
            await stop_work(key)
        with sessions() as db:
            user = db.get(User, key)
            if not user or user.deleted:
                raise HTTPException(404, 'User not found.')
            if body.username is not None:
                value = username(body.username)
                if user.role == 'super_admin' and value != 'nasser':
                    raise HTTPException(409, 'The single super-admin username is nasser.')
                if user.role != 'super_admin' and value == 'nasser':
                    raise HTTPException(409, 'Nasser is reserved for the super admin.')
                user.username = value
            if body.password is not None:
                user.password_hash = hash_password(body.password)
            if body.active is not None:
                user.active = body.active
            db.execute(delete(LoginSession).where(LoginSession.user_id == key))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                raise HTTPException(409, 'That username is already in use.') from None
            return public_user(user)

    @router.delete('/api/admin/users/{key}')
    async def delete_user(key: str, request: Request):
        require_admin(request)
        if key == request.state.user.id:
            raise HTTPException(409, 'You cannot delete your administrator account.')
        await stop_work(key)
        with sessions() as db:
            user = db.get(User, key)
            if not user or user.deleted:
                raise HTTPException(404, 'User not found.')
            user.active = False
            user.deleted = True
            user.password_hash = ''
            user.username = 'deleted-' + user.id
            db.execute(delete(LoginSession).where(LoginSession.user_id == key))
            db.execute(update(LoginSession).where(LoginSession.workspace_id == key)
                       .values(workspace_id=LoginSession.user_id))
            db.commit()
        return {'deleted': True}

    @router.post('/api/admin/workspace/{key}')
    def switch_workspace(key: str, request: Request):
        require_admin(request)
        with sessions() as db:
            target = db.get(User, key)
            if not target or target.deleted:
                raise HTTPException(404, 'User not found.')
            saved = db.get(LoginSession, request.state.login_session.token_hash)
            saved.workspace_id = target.id
            db.commit()
            return {'workspace': public_user(target)}

    app.include_router(router)
