# Local containers and future Hostinger deployment

> Current implementation (27 October 2026): live mission-based orchestration is now available locally. See [LIVE_ORCHESTRATION.md](LIVE_ORCHESTRATION.md) for the current loop, schema, limits and scope. Earlier simulation descriptions below apply to Simulation mode. Public deployment/authentication remain pending.

Run `docker compose up --build`. Open http://127.0.0.1:8080. The API runs migrations
before startup and stores SQLite in a named volume. Nginx serves React and proxies
REST/SSE with buffering disabled. Use one API process. Docker validation requires a
running Docker daemon and has not been assumed by the implementation.

This is a deployment scaffold, not a public production release. Before an Ubuntu VPS
release, finish authentication, ownership, instructor authorization and admission
controls in Phase 6. Then install Docker/Compose, configure a domain's DNS to the VPS,
deploy through an HTTPS reverse proxy with trusted certificates, restrict firewall
ports to SSH/HTTPS, keep secrets server-side, and test restore from a database backup.
Never expose backend port 8000 directly. Configure hostname/certificates on the
server; no domain or server address is hardcoded here. Run migrations and tests
before deployment. Use PostgreSQL and distributed ownership before multiple workers.
