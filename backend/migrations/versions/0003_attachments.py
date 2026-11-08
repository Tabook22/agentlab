"""Persist uploaded source files and their extraction evidence."""
from alembic import op
import sqlalchemy as sa
revision='0003'
down_revision='0002'

def upgrade():
    op.create_table('attachments',sa.Column('id',sa.String(36),primary_key=True),
        sa.Column('filename',sa.String(200),nullable=False),sa.Column('media_type',sa.String(100),nullable=False),
        sa.Column('byte_size',sa.Integer,nullable=False),sa.Column('sha256',sa.String(64),nullable=False),
        sa.Column('page_count',sa.Integer,nullable=False),sa.Column('status',sa.String(30),nullable=False),
        sa.Column('text',sa.Text,nullable=False),sa.Column('details',sa.JSON,nullable=False),
        sa.Column('data',sa.LargeBinary,nullable=False),sa.Column('created_at',sa.String(40),nullable=False))

def downgrade():op.drop_table('attachments')
