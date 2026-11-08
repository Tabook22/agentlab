"""Persist live/simulation mode without changing old recordings."""
from alembic import op
import sqlalchemy as sa
revision='0002'
down_revision='0001'


def upgrade():
    op.add_column('missions',sa.Column('mode',sa.String(20),nullable=False,server_default='simulation'))


def downgrade():
    with op.batch_alter_table('missions') as batch:
        batch.drop_column('mode')
