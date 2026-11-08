#!/usr/bin/env bash
set -euo pipefail

site=/etc/nginx/sites-available/nasserdiary.conf
snippet=/etc/nginx/snippets/agentlab.conf
password_file=/etc/nginx/agentlab.htpasswd
anchor='    include /etc/nginx/snippets/ainews.conf;'
app_dir=/home/nasser/apps/agentlab

if [[ $EUID != 0 || ! -t 1 ]]; then
    echo 'Run this script with sudo from an interactive VPS terminal.' >&2
    exit 1
fi
if [[ -e "$snippet" || -e "$password_file" ]] || grep -q 'agentlab' "$site"; then
    echo 'Agent Lab already has Nginx configuration.' >&2
    exit 1
fi
if [[ $(grep -Fxc "$anchor" "$site") != 1 ]]; then
    echo 'The expected include in the HTTPS server configuration has changed.' >&2
    exit 1
fi
test -s "$app_dir/current/frontend/dist/index.html"
curl -fsS http://127.0.0.1:8147/api/health >/dev/null

backup=$(mktemp /etc/nginx/nasserdiary.before-agentlab.XXXXXX)
cp -p -- "$site" "$backup"
rollback() {
    cp -p -- "$backup" "$site"
    rm -f -- "$snippet" "$password_file"
    nginx -t && systemctl reload nginx
}
trap rollback EXIT

password=$(openssl rand -hex 24)
hash=$(printf '%s\n' "$password" | openssl passwd -6 -stdin)
install -o root -g www-data -m 0640 /dev/null "$password_file"
printf 'nasser:%s\n' "$hash" > "$password_file"
install -m 0644 "$app_dir/current/deploy/agentlab.nginx.conf" "$snippet"
sed -i '\#^    include /etc/nginx/snippets/ainews\.conf;$#a\    include /etc/nginx/snippets/agentlab.conf;' "$site"
nginx -t
systemctl reload nginx

base=https://nasserdiary.com/agentlab
curl_local() {
    curl -sS --max-time 10 --resolve nasserdiary.com:443:127.0.0.1 "$@"
}
authenticated() {
    printf 'user = "nasser:%s"\n' "$password" | curl_local -K - --fail "$@"
}
verified=false
for attempt in {1..10}; do
    if [[ $(curl_local -o /dev/null -w '%{http_code}' "$base/") == 401 ]] &&
       [[ $(curl_local -o /dev/null -w '%{http_code}' "$base/api/health") == 401 ]] &&
       page=$(authenticated "$base/") &&
       asset=$(printf '%s\n' "$page" | grep -oE 'src="/agentlab/assets/[^"]+\.js"' | cut -d '"' -f2) &&
       [[ -n "$asset" ]] &&
       authenticated -o /dev/null "https://nasserdiary.com$asset" &&
       authenticated -o /dev/null "$base/api/health"; then
        verified=true
        break
    fi
    sleep 1
done
if [[ "$verified" != true ]]; then
    echo 'Agent Lab HTTPS checks failed. Restoring the original Nginx configuration.' >&2
    exit 1
fi
trap - EXIT

printf '\nAgent Lab is available at %s/\nUsername: nasser\nPassword: %s\n' "$base" "$password"
printf 'Save this password now. The server stores only its hash.\n'
