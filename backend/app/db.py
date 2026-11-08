import os
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import JSON, ForeignKey, String, Integer, Text, LargeBinary, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Mission(Base):
    __tablename__ = 'missions'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    prompt: Mapped[str] = mapped_column(String(2000))
    scenario: Mapped[str] = mapped_column(String(30))
    mode: Mapped[str] = mapped_column(String(20), default='simulation', server_default='simulation')
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


class Attachment(Base):
    __tablename__ = 'attachments'
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


def database(url=None):
    url = url or os.getenv('DATABASE_URL', 'sqlite:///./agent_lab.db')
    engine = create_engine(url, connect_args={'check_same_thread': False} if url.startswith('sqlite') else {})
    if url.startswith('sqlite'):
        from sqlalchemy import event
        @event.listens_for(engine, 'connect')
        def foreign_keys(connection, _):
            connection.execute('PRAGMA foreign_keys=ON')
    return engine, sessionmaker(engine, expire_on_commit=False)
