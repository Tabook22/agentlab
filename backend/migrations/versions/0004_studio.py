"""Persist hands-on learning, experiment and project records."""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('studio_runs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('kind', sa.String(30), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('status', sa.String(30), nullable=False),
        sa.Column('revision', sa.Integer, nullable=False),
        sa.Column('created_at', sa.String(40), nullable=False),
        sa.Column('data', sa.JSON, nullable=False))
    op.create_index('ix_studio_runs_kind', 'studio_runs', ['kind'])


def downgrade():
    op.drop_index('ix_studio_runs_kind', table_name='studio_runs')
    op.drop_table('studio_runs')
