"""Phase 1 schema."""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None


def upgrade():
    op.create_table('missions', sa.Column('id', sa.String(36), primary_key=True), sa.Column('prompt', sa.String(2000), nullable=False), sa.Column('scenario', sa.String(30), nullable=False), sa.Column('status', sa.String(30), nullable=False), sa.Column('created_at', sa.String(40), nullable=False), sa.Column('output', sa.JSON(), nullable=False))
    op.create_table('agents', sa.Column('id', sa.String(36), primary_key=True), sa.Column('mission_id', sa.String(36), sa.ForeignKey('missions.id'), nullable=False), sa.Column('config', sa.JSON(), nullable=False), sa.Column('state', sa.String(30), nullable=False))
    op.create_table('tasks', sa.Column('id', sa.String(36), primary_key=True), sa.Column('mission_id', sa.String(36), sa.ForeignKey('missions.id'), nullable=False), sa.Column('agent_id', sa.String(36), sa.ForeignKey('agents.id'), nullable=False), sa.Column('title', sa.String(200), nullable=False), sa.Column('dependencies', sa.JSON(), nullable=False), sa.Column('status', sa.String(30), nullable=False), sa.Column('output', sa.JSON(), nullable=False))
    op.create_table('events', sa.Column('id', sa.String(36), primary_key=True), sa.Column('mission_id', sa.String(36), sa.ForeignKey('missions.id'), nullable=False), sa.Column('sequence', sa.Integer(), nullable=False), sa.Column('timestamp', sa.String(40), nullable=False), sa.Column('type', sa.String(60), nullable=False), sa.Column('agent_id', sa.String(36)), sa.Column('task_id', sa.String(36)), sa.Column('payload', sa.JSON(), nullable=False), sa.UniqueConstraint('mission_id', 'sequence'))
    for table in ('agents', 'tasks', 'events'):
        op.create_index(f'ix_{table}_mission_id', table, ['mission_id'])


def downgrade():
    for table in ('events', 'tasks', 'agents', 'missions'):
        op.drop_table(table)
