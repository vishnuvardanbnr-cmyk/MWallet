---
name: VPS restart pattern
description: How to deploy and restart the mvault server on the VPS (173.249.10.179)
---

## Rule
The VPS server runs as a **systemd service** (`mvault.service`). Always use `systemctl restart mvault.service` to restart after a deploy.

**Why:** cron watchdog + nohup approaches all set `process.cwd()` to `/root`, causing the Node.js server to crash immediately with "Could not find the build directory: /root/dist/public". Systemd's `WorkingDirectory=/opt/mvault` directive enforces the correct cwd.

## Service file location
`/etc/systemd/system/mvault.service` — already installed, enabled, and starts on boot.

## How to apply
- Deploy: `scp dist/public dist/index.cjs root@173.249.10.179:/opt/mvault/dist/`
- Restart: `ssh root@173.249.10.179 "systemctl restart mvault.service"`
- The service reads env from `EnvironmentFile=/opt/mvault/.env` (handles special chars like `!` safely)
- `update-vps.sh` step 5 already uses `systemctl restart mvault.service`
- **Do NOT** use `pkill` + `nohup`, cron watchdog, or `systemd-run` — they all set cwd=/root
