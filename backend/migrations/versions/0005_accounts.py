"""Administrator-managed accounts and private workspace ownership."""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('username', sa.String(80), nullable=False, unique=True),
        sa.Column('password_hash', sa.Text, nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('active', sa.Boolean, nullable=False),
        sa.Column('deleted', sa.Boolean, nullable=False),
        sa.Column('created_at', sa.String(40), nullable=False))
    op.create_table('login_sessions',
        sa.Column('token_hash', sa.String(64), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('workspace_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('expires_at', sa.Integer, nullable=False))
    op.create_index('ix_login_sessions_user_id', 'login_sessions', ['user_id'])
    for table in ('missions', 'attachments', 'studio_runs'):
        # SQLite supports adding a nullable foreign key without copying the
        # existing mission/event/attachment data.
        op.add_column(table, sa.Column('owner_id', sa.String(36), nullable=True))
        with op.batch_alter_table(table) as batch:
            batch.create_foreign_key(f'fk_{table}_owner', 'users', ['owner_id'], ['id'])
            batch.create_index(f'ix_{table}_owner_id', ['owner_id'])


def downgrade():
    for table in ('studio_runs', 'attachments', 'missions'):
        with op.batch_alter_table(table) as batch:
            batch.drop_index(f'ix_{table}_owner_id')
            batch.drop_constraint(f'fk_{table}_owner', type_='foreignkey')
            batch.drop_column('owner_id')
    op.drop_table('login_sessions')
    op.drop_table('users')
