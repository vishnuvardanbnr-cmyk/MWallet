---
name: VPS PM2 restart pattern
description: How to reliably deploy and restart the app on the MChain VPS when interactive SSH times out
---

## The problem
Interactive SSH to `root@173.249.10.179` with key `/tmp/mvault_deploy_key` always times out (~25s) for commands that wait for app startup (e.g., `pm2 restart mvault`). The app takes 30+ seconds to start.

`nohup pm2 restart ... >/dev/null 2>&1 </dev/null &` fires (returns "fired") but the new process gets `EADDRINUSE` because the old process is still on port 5000 — PM2 considers it a crash, retries, same result. The OLD binary keeps serving.

## The working deployment sequence
1. Build: `VITE_BSC_NETWORK=mchain VITE_MVT_TOKEN_ADDRESS=... npm run build`
2. Upload binary: `scp -i /tmp/mvault_deploy_key dist/index.cjs root@173.249.10.179:/opt/mvault/dist/index.cjs`
3. Upload frontend: `scp -r -i /tmp/mvault_deploy_key dist/public/ root@173.249.10.179:/opt/mvault/dist/`
4. Kill port (triggers PM2 auto-restart with new binary on disk):
   `ssh -i /tmp/mvault_deploy_key -o StrictHostKeyChecking=no -o ConnectTimeout=6 root@173.249.10.179 "fuser -k 5000/tcp; echo port_killed"`
5. Wait ~12 seconds for PM2 to restart the app
6. Verify: `curl -s https://app.mvault.pro/api/rank/claim ...`

## Why fuser -k works
When the running process is killed on port 5000, PM2 detects the crash and restarts automatically. PM2 loads the binary fresh from disk (the NEW `dist/index.cjs` just uploaded). No need for PM2 to gracefully stop+start, which is what times out.

## SSH key location
`/tmp/mvault_deploy_key` — created by `update-vps.sh` script. If it doesn't exist, re-run the key extraction from `VPS_SSH_KEY` secret.

**Why:** SSH interactive sessions time out because the Node.js Express server takes 30+ seconds to initialize (Vite SSR, DB connection pool, etc.). SCP doesn't have this problem as it's a non-interactive transfer.
