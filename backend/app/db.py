import os
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import JSON, ForeignKey, String, Integer, Text, LargeBinary, UniqueConstraint, Boolean, CheckConstraint, Index, text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = 'users'
    __table_args__ = (
        CheckConstraint("role IN ('user', 'super_admin')", name='ck_user_role'),
        CheckConstraint("role != 'super_admin' OR username = 'nasser'", name='ck_super_admin_name'),
        Index('uq_single_super_admin', 'role', unique=True,
              sqlite_where=text("role = 'super_admin'"), postgresql_where=text("role = 'super_admin'")),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default='user')
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now)


class LoginSession(Base):
    __tablename__ = 'login_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    expires_at: Mapped[int] = mapped_column(Integer)


class Mission(Base):
    __tablename__ = 'missions'
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), index=True, nullable=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    prompt: Mapped[str] = mapped_column(String(2000))
    scenario: Mapped[str] = mapped_column(String(30))
    mode: Mapped[str] = mapped_column(String(20), default='simulation', server_default='simulation')
    execution_strategy: Mapped[str] = mapped_column(String(20), default='legacy', server_default='legacy')
    status: Mapped[str] = mapped_column(String(30), default='CREATED')
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    output: Mapped[dict] = mapped_column(JSON, default=dict)


class Agent(Base):
    __tablename__ = 'agents'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    mission_id: Mapped[str] = mapped_column(ForeignKey('missions.id'), index=True)
    config: Mapped[dict] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(30), default='CREATED')


class Task(Base):
    __tablename__ = 'tasks'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    mission_id: Mapped[str] = mapped_column(ForeignKey('missions.id'), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey('agents.id'))
    title: Mapped[str] = mapped_column(String(200))
    dependencies: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default='WAITING')
    output: Mapped[dict] = mapped_column(JSON, default=dict)


class Event(Base):
    __tablename__ = 'events'
    __table_args__ = (UniqueConstraint('mission_id', 'sequence'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    mission_id: Mapped[str] = mapped_column(ForeignKey('missions.id'), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[str] = mapped_column(String(40), default=now)
    type: Mapped[str] = mapped_column(String(60))
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    task_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON)


class StudioRun(Base):
    __tablename__ = 'studio_runs'
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), index=True, nullable=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(30), default='ASSIGNED')
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class Attachment(Base):
    __tablename__ = 'attachments'
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), index=True, nullable=True)
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=uid)
    filename: Mapped[str] = mapped_column(String(200))
    media_type: Mapped[str] = mapped_column(String(100))
    byte_size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    page_count: Mapped[int] = mapped_column(Integer,default=1)
    status: Mapped[str] = mapped_column(String(30))
    text: Mapped[str] = mapped_column(Text,default='')
    details: Mapped[dict] = mapped_column(JSON,default=dict)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[str] = mapped_column(String(40),default=now)


class Skill(Base):
    __tablename__ = 'skills'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    active_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latest_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String(40), default=now)


class SkillVersion(Base):
    __tablename__ = 'skill_versions'
    __table_args__ = (UniqueConstraint('skill_id', 'version'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    skill_id: Mapped[str] = mapped_column(ForeignKey('skills.id'), index=True)
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    instructions: Mapped[str] = mapped_column(Text)
    inputs: Mapped[list] = mapped_column(JSON, default=list)
    outputs: Mapped[list] = mapped_column(JSON, default=list)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(40), default=now)


class WorkflowRun(Base):
    __tablename__ = 'workflow_runs'
    mission_id: Mapped[str] = mapped_column(ForeignKey('missions.id'), primary_key=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    plan_revision: Mapped[int] = mapped_column(Integer, default=1)
    selection: Mapped[dict] = mapped_column(JSON, default=dict)
    suggestion: Mapped[dict] = mapped_column(JSON, default=dict)


class WorkflowStep(Base):
    __tablename__ = 'workflow_steps'
    __table_args__ = (UniqueConstraint('mission_id', 'position'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    mission_id: Mapped[str] = mapped_column(ForeignKey('missions.id'), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    instructions: Mapped[str] = mapped_column(Text)
    dependencies: Mapped[list] = mapped_column(JSON, default=list)
    bindings: Mapped[list] = mapped_column(JSON, default=list)
    skill_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    executor: Mapped[str] = mapped_column(String(20), default='master')
    delegation: Mapped[dict] = mapped_column(JSON, default=dict)
    tools: Mapped[list] = mapped_column(JSON, default=lambda: ['write_text'])
    expected_outputs: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default='WAITING')
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    inputs: Mapped[dict] = mapped_column(JSON, default=dict)
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    failure: Mapped[dict] = mapped_column(JSON, default=dict)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey('agents.id'), nullable=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey('tasks.id'), nullable=True)
    started_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    completed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


def database(url=None):
    url = url or os.getenv('DATABASE_URL', 'sqlite:///./agent_lab.db')
    engine = create_engine(url, connect_args={'check_same_thread': False} if url.startswith('sqlite') else {})
    if url.startswith('sqlite'):
        from sqlalchemy import event
        @event.listens_for(engine, 'connect')
        def foreign_keys(connection, _):
            connection.execute('PRAGMA foreign_keys=ON')
    return engine, sessionmaker(engine, expire_on_commit=False)
