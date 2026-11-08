import os
from app.config import load_backend_environment, provider_status


def test_load_key_without_overriding_deployment_environment(tmp_path, monkeypatch):
    path = tmp_path / '.env'
    path.write_text('OPENAI_API_KEY=local-test-value\n', encoding='utf-8')
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    load_backend_environment(path)
    assert os.environ['OPENAI_API_KEY'] == 'local-test-value'
    monkeypatch.setenv('OPENAI_API_KEY', 'deployment-test-value')
    load_backend_environment(path)
    assert os.environ['OPENAI_API_KEY'] == 'deployment-test-value'


def test_provider_status_never_exposes_key_or_claims_connectivity(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'private-test-value')
    status = provider_status()
    assert status['key_present'] is True
    assert status['connection_tested'] is False
    assert status['live_enabled'] is True
    assert 'private-test-value' not in str(status)
    monkeypatch.setenv('OPENAI_API_KEY', '   ')
    assert provider_status()['key_present'] is False
