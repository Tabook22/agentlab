"""Add versioned workspace skills and resumable workflow steps; retain old runs."""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('missions', sa.Column('execution_strategy', sa.String(20), server_default='legacy', nullable=False))
    # These are new tables only. Existing agents, tasks, events and configurations
    # are deliberately never rebuilt or rewritten by this migration.
    op.create_table('skills',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('owner_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('active_version', sa.Integer, nullable=True),
        sa.Column('latest_version', sa.Integer, nullable=False),
        sa.Column('created_at', sa.String(40), nullable=False))
    op.create_index('ix_skills_owner_id', 'skills', ['owner_id'])
    op.create_table('skill_versions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('skill_id', sa.String(36), sa.ForeignKey('skills.id'), nullable=False),
        sa.Column('version', sa.Integer, nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('instructions', sa.Text, nullable=False),
        sa.Column('inputs', sa.JSON, nullable=False),
        sa.Column('outputs', sa.JSON, nullable=False),
        sa.Column('provenance', sa.JSON, nullable=False),
        sa.Column('created_at', sa.String(40), nullable=False),
        sa.UniqueConstraint('skill_id', 'version'))
    op.create_index('ix_skill_versions_skill_id', 'skill_versions', ['skill_id'])
    op.create_table('workflow_runs',
        sa.Column('mission_id', sa.String(36), sa.ForeignKey('missions.id'), primary_key=True),
        sa.Column('config', sa.JSON, nullable=False),
        sa.Column('plan_revision', sa.Integer, nullable=False),
        sa.Column('selection', sa.JSON, nullable=False),
        sa.Column('suggestion', sa.JSON, nullable=False))
    op.create_table('workflow_steps',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('mission_id', sa.String(36), sa.ForeignKey('missions.id'), nullable=False),
        sa.Column('position', sa.Integer, nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('instructions', sa.Text, nullable=False),
        sa.Column('dependencies', sa.JSON, nullable=False),
        sa.Column('bindings', sa.JSON, nullable=False),
        sa.Column('skill_snapshot', sa.JSON, nullable=False),
        sa.Column('executor', sa.String(20), nullable=False),
        sa.Column('delegation', sa.JSON, nullable=False),
        sa.Column('tools', sa.JSON, nullable=False),
        sa.Column('expected_outputs', sa.JSON, nullable=False),
        sa.Column('status', sa.String(30), nullable=False),
        sa.Column('attempts', sa.Integer, nullable=False),
        sa.Column('inputs', sa.JSON, nullable=False),
        sa.Column('output', sa.JSON, nullable=False),
        sa.Column('failure', sa.JSON, nullable=False),
        sa.Column('agent_id', sa.String(36), sa.ForeignKey('agents.id'), nullable=True),
        sa.Column('task_id', sa.String(36), sa.ForeignKey('tasks.id'), nullable=True),
        sa.Column('started_at', sa.String(40), nullable=True),
        sa.Column('completed_at', sa.String(40), nullable=True),
        sa.UniqueConstraint('mission_id', 'position'))
    op.create_index('ix_workflow_steps_mission_id', 'workflow_steps', ['mission_id'])


def downgrade():
    for name in ('workflow_steps', 'workflow_runs', 'skill_versions', 'skills'):
        op.drop_table(name)
    op.drop_column('missions', 'execution_strategy')
