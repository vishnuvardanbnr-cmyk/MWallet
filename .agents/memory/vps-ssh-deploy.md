---
name: VPS SSH deploy pattern
description: How to SSH/SCP into the VPS — password auth is disabled; key must be constructed from VPS_SSH_KEY secret
---

## Rule
`VPS_SSH_KEY` secret holds the **base64 encoding of the raw OpenSSH Ed25519 binary key** (not a PEM file directly).
To use it with ssh/scp:
1. `base64.b64decode(key_b64)` → raw bytes
2. `base64.b64encode(raw_bytes).decode()` → re-encode (same content)
3. Wrap in OpenSSH PEM envelope:
   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   <base64 wrapped at 70 chars>
   -----END OPENSSH PRIVATE KEY-----
   ```
4. Write to `/tmp/vps_id`, `chmod 600`
5. Use: `ssh -i /tmp/vps_id -o StrictHostKeyChecking=no -o BatchMode=yes root@173.249.10.179`

## Why
Password auth (`VPS_PASSWORD`) is disabled on the VPS. Only public-key auth works.
The stored secret is the raw binary, not the PEM text — it needs the header/footer wrapping.

## How to apply
Any time you need to SSH or SCP to the VPS (deploy, restart, check logs).
The `sshpass` approach with `VPS_PASSWORD` will always fail with "Permission denied".
