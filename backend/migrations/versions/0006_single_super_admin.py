"""Preserve Nasser's existing account as the only super admin."""
from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE users SET role = CASE WHEN username = 'nasser' THEN 'super_admin' ELSE 'user' END WHERE role = 'admin'")
    for table in ('missions', 'attachments', 'studio_runs'):
        op.execute(f"UPDATE {table} SET owner_id = (SELECT id FROM users WHERE role = 'super_admin') WHERE owner_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE role = 'super_admin')")
    with op.batch_alter_table('users') as batch:
        batch.create_check_constraint('ck_user_role', "role IN ('user', 'super_admin')")
        batch.create_check_constraint('ck_super_admin_name', "role != 'super_admin' OR username = 'nasser'")
        batch.create_index('uq_single_super_admin', ['role'], unique=True,
                           sqlite_where=sa.text("role = 'super_admin'"),
                           postgresql_where=sa.text("role = 'super_admin'"))


def downgrade():
    with op.batch_alter_table('users') as batch:
        batch.drop_index('uq_single_super_admin')
        batch.drop_constraint('ck_super_admin_name', type_='check')
        batch.drop_constraint('ck_user_role', type_='check')
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'super_admin'")
