# Deploy Agent Lab

## Local development

Follow the [README](README.md) to run the Python API and the Vite frontend locally. You can also run `docker compose up --build` and open http://127.0.0.1:8080. Compose runs migrations before startup and stores SQLite in a named volume.

## Hostinger VPS

The VPS deployment uses Node 22, Python 3.12 with `venv`, user systemd services, and the existing HTTPS Nginx site. The app is available at https://nasserdiary.com/agentlab/ after Nginx activation. It uses a single shared HTTPS sign-in, a separate VPS database, and Simulation mode. The API listens on loopback and the production service starts with an empty OpenAI API key.

For a first deployment, sign in as `nasser` and run:

```bash
install -d -m 0755 ~/apps/agentlab ~/.config/systemd/user
git clone --no-checkout https://github.com/Tabook22/agentlab.git ~/apps/agentlab/repo
cd ~/apps/agentlab
git -C repo show origin/main:deploy/deploy.sh > deploy.sh
for unit in agentlab.service agentlab-deploy.service agentlab-deploy.timer; do
  git -C repo show "origin/main:deploy/$unit" > "$HOME/.config/systemd/user/$unit"
done
systemctl --user daemon-reload
systemctl --user start agentlab-deploy.service
systemctl --user enable agentlab.service
systemctl --user enable --now agentlab-deploy.timer
```

On a fresh VPS, enable user services at boot with `sudo loginctl enable-linger nasser`. To add the HTTPS route on this VPS, run the following command in an interactive SSH session. Save the browser password printed after the HTTPS checks pass.

```bash
sudo bash ~/apps/agentlab/current/deploy/enable-nginx.sh
```

## Administrator OpenAI key

Open **Lab settings → Admin settings → OpenAI API key** to add or replace the
server key. The password field is write-only; saving performs no paid request.
The key takes effect immediately for Live AI, image reading and transcription.
Validity is confirmed when a provider request succeeds.

The key is kept in `.secrets/openai-api-key` beside the SQLite database, or at
`AGENT_LAB_KEY_FILE` when explicitly configured. On Linux the credential file is
mode 0600 and its directory is mode 0700. It is excluded from Git, mission records,
exports and API responses. On the VPS this directory is under persistent `data/`,
so it survives releases and overrides the service's initial empty environment key.

The user service sets `AGENT_LAB_ADMIN_ORIGIN=https://nasserdiary.com` to allow
the existing authenticated HTTPS Nginx proxy to submit admin key updates, request
Commander plans, discuss and revise proposals, and approve Live AI execution. Only
enable this option behind that proxy, with the API bound to loopback. The current
shared HTTPS sign-in is the administrator sign-in; this app has no separate user roles.
Cross-origin and non-form submissions are rejected. Key changes are blocked while
a Live AI mission is active. After upgrading this service unit, install it into
`~/.config/systemd/user/`, run `systemctl --user daemon-reload`, and restart the app.

## Ship changes

Commit and push changes to `main` on GitHub. The VPS checks GitHub every two minutes, builds each new revision in a separate release directory, and verifies the API before retaining the release. The persistent database and its pre-migration backup are in `~/apps/agentlab/data/`.

```bash
systemctl --user start agentlab-deploy.service
journalctl --user -u agentlab-deploy.service -n 60 --no-pager
cat ~/apps/agentlab/current/.revision
```

If a build fails, the running release stays active. If the new API fails to start, the deploy script attempts to restart the previous release. Check the logs before manually restoring the database backup. Updates to the deployment script, service units, or Nginx routing require separately installing those files on the VPS.
