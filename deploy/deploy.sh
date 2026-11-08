#!/usr/bin/env bash
set -euo pipefail
umask 022

app_dir="$HOME/apps/agentlab"
repository="$app_dir/repo"
mkdir -p "$app_dir/releases"
install -d -m 0700 "$app_dir/data"
exec 9>"$app_dir/deploy.lock"
flock 9

git -C "$repository" fetch --no-tags origin refs/heads/main
revision=$(git -C "$repository" rev-parse FETCH_HEAD)
current=$(readlink "$app_dir/current" || true)
if [[ -n "$current" && $(cat "$current/.revision") == "$revision" ]]; then
    exit 0
fi

release=$(mktemp -d "$app_dir/releases/${revision:0:12}.XXXXXX")
trap 'rm -rf -- "$release"' EXIT
chmod 0755 "$release"
git -C "$repository" archive "$revision" | tar -x -C "$release"
(
    cd "$release/frontend"
    npm ci --no-audit --no-fund
    npm run build -- --base=/agentlab/
    # Compiled assets are sufficient at runtime.
    rm -rf -- node_modules
)
python3 -m venv "$release/.venv"
"$release/.venv/bin/python" -m pip install --disable-pip-version-check -r "$release/backend/requirements.txt"
printf '%s\n' "$revision" > "$release/.revision"

database="$app_dir/data/agent_lab.db"
if [[ -f "$database" ]]; then
    python3 - "$database" <<'PY'
import os
import sqlite3
import sys
from contextlib import closing

path = sys.argv[1]
with closing(sqlite3.connect(path)) as source, closing(sqlite3.connect(path + ".backup.tmp")) as backup:
    source.backup(backup)
os.replace(path + ".backup.tmp", path + ".backup")
PY
fi

set_current() {
    ln -sfn -- "$1" "$app_dir/current.next"
    mv -Tf -- "$app_dir/current.next" "$app_dir/current"
}

wait_for_api() {
    for attempt in {1..20}; do
        if curl --silent --fail --max-time 2 http://127.0.0.1:8147/api/health >/dev/null; then
            return 0
        fi
        sleep 1
    done
    return 1
}

set_current "$release"
if ! systemctl --user restart agentlab.service || ! wait_for_api; then
    journalctl --user -u agentlab.service -n 25 --no-pager >&2 || true
    if [[ -n "$current" ]]; then
        set_current "$current"
        systemctl --user restart agentlab.service
    else
        systemctl --user stop agentlab.service
        rm -- "$app_dir/current"
    fi
    exit 1
fi
trap - EXIT

# Retain the active and immediately preceding releases.
for old_release in "$app_dir"/releases/*; do
    if [[ "$old_release" != "$release" && "$old_release" != "$current" ]]; then
        rm -rf -- "$old_release"
    fi
done
printf 'Deployed %s\n' "$revision"
