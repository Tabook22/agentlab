"""Explicit fixture provisioning; application endpoints never create admins."""
from sqlalchemy import select, update
from app.accounts import hash_password
from app.db import User, Mission, Attachment, StudioRun

TEST_PASSWORD = 'classroom-password-123'


def provision_super_admin(app):
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == 'nasser'))
        if user is None:
            user = User(id='administrator', username='nasser', role='super_admin',
                        password_hash=hash_password(TEST_PASSWORD))
            db.add(user); db.flush()
        for model in (Mission, Attachment, StudioRun):
            db.execute(update(model).where(model.owner_id.is_(None)).values(owner_id=user.id))
        db.commit()
        return {'id': user.id, 'username': user.username, 'role': user.role}


def sign_in_admin(client):
    provision_super_admin(client.app)
    response = client.post('/api/auth/login', json={'username': 'nasser', 'password': TEST_PASSWORD})
    assert response.status_code == 200, response.text
