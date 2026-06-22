#!/usr/bin/env bash
# update-vps.sh — Build the app and deploy to VPS via SSH key
# Usage: bash scripts/update-vps.sh
# Requires: VPS_SSH_KEY env secret

set -e

VPS_IP="173.249.10.179"
VPS_USER="root"
VPS_PATH="/opt/mvault"
SSH_KEY="/tmp/mvault_deploy_key"

MVT_TOKEN="0xc7d9029a92998b1386365229f603a7aecb5fecdc"
MVAULT_CONTRACT="0x431cc3c846efd494061a3bddd84e6fb60f5204e3"
BOARD_HANDLER="0x5b3b5780758f6b6667e349b7c10a5d70b0c75a9d"
MVAULT_VIEW="0x28c05ea401426f42067ab04bcd2411144679fe82"
MVAULT_STAKING="0x9f0b122f26599db85ef1a5e97dcd25e0a02a8cda"
DISTRIBUTOR=""
USDT="0x7b2ed1be97fa240dbd0328dd307e35e588bcb917"
BSC_NETWORK="mchain"

if [ -z "$VPS_SSH_KEY" ]; then
  echo "❌ VPS_SSH_KEY env secret is not set"
  exit 1
fi

# Write SSH private key to temp file (reconstruct PEM with proper newlines)
{
  echo "-----BEGIN OPENSSH PRIVATE KEY-----"
  echo "$VPS_SSH_KEY" | tr ' ' '\n'
  echo "-----END OPENSSH PRIVATE KEY-----"
} > "$SSH_KEY"
chmod 600 "$SSH_KEY"
trap "rm -f $SSH_KEY" EXIT

SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes ${VPS_USER}@${VPS_IP}"
SCP="scp -i $SSH_KEY -o StrictHostKeyChecking=no -r"

echo ""
echo "══════════════════════════════════════════════════"
echo "  MVault VPS Deployment"
echo "  Target: ${VPS_USER}@${VPS_IP}:${VPS_PATH}"
echo "══════════════════════════════════════════════════"
echo "  MVT Token:       $MVT_TOKEN"
echo "  Mvault Contract: $MVAULT_CONTRACT"
echo "  Board Handler:   $BOARD_HANDLER"
echo "  MvaultView:      $MVAULT_VIEW"
echo "  Staking:         $MVAULT_STAKING"
echo "  Distributor:     $DISTRIBUTOR"
echo "  Network:         $BSC_NETWORK"
echo ""

# ── 1. Build frontend ──────────────────────────────────────────────────────
echo "[1/5] Building frontend..."
VITE_MVT_TOKEN_ADDRESS=$MVT_TOKEN \
VITE_MVAULT_CONTRACT_ADDRESS=$MVAULT_CONTRACT \
VITE_BOARD_HANDLER_ADDRESS=$BOARD_HANDLER \
VITE_MVAULT_VIEW_ADDRESS=$MVAULT_VIEW \
VITE_MVAULT_STAKING_ADDRESS=$MVAULT_STAKING \
VITE_DISTRIBUTOR_ADDRESS=$DISTRIBUTOR \
VITE_PAYMENT_TOKEN_ADDRESS=$USDT \
VITE_BSC_NETWORK=$BSC_NETWORK \
npm run build 2>&1
echo "  ✓ Frontend built"

# ── 2. Ensure VPS app directory exists ────────────────────────────────────
echo ""
echo "[2/5] Preparing VPS directory..."
$SSH "mkdir -p ${VPS_PATH}/dist"
echo "  ✓ Directory ready"

# ── 3. Sync built files to VPS ────────────────────────────────────────────
echo ""
echo "[3/5] Syncing files to VPS..."

$SSH "rm -rf ${VPS_PATH}/dist && mkdir -p ${VPS_PATH}/dist"
$SCP dist/public dist/index.cjs ${VPS_USER}@${VPS_IP}:${VPS_PATH}/dist/
echo "  ✓ dist/ synced"

$SCP server/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/server/
echo "  ✓ server/ synced"

$SCP shared/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/shared/
echo "  ✓ shared/ synced"

scp -i $SSH_KEY -o StrictHostKeyChecking=no package.json ${VPS_USER}@${VPS_IP}:${VPS_PATH}/package.json
echo "  ✓ package.json synced"

# ── 4. Update VPS .env ────────────────────────────────────────────────────
echo ""
echo "[4/5] Updating VPS .env..."
$SSH bash <<EOF
touch ${VPS_PATH}/.env

sed -i '/^VITE_MVT_TOKEN_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_MVAULT_CONTRACT_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_BOARD_HANDLER_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_MVAULT_VIEW_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_MVAULT_STAKING_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_DISTRIBUTOR_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_PAYMENT_TOKEN_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_BSC_NETWORK=/d' ${VPS_PATH}/.env

echo "VITE_MVT_TOKEN_ADDRESS=${MVT_TOKEN}" >> ${VPS_PATH}/.env
echo "VITE_MVAULT_CONTRACT_ADDRESS=${MVAULT_CONTRACT}" >> ${VPS_PATH}/.env
echo "VITE_BOARD_HANDLER_ADDRESS=${BOARD_HANDLER}" >> ${VPS_PATH}/.env
echo "VITE_MVAULT_VIEW_ADDRESS=${MVAULT_VIEW}" >> ${VPS_PATH}/.env
echo "VITE_MVAULT_STAKING_ADDRESS=${MVAULT_STAKING}" >> ${VPS_PATH}/.env
echo "VITE_DISTRIBUTOR_ADDRESS=${DISTRIBUTOR}" >> ${VPS_PATH}/.env
echo "VITE_PAYMENT_TOKEN_ADDRESS=${USDT}" >> ${VPS_PATH}/.env
echo "VITE_BSC_NETWORK=${BSC_NETWORK}" >> ${VPS_PATH}/.env

# Ensure NODE_ENV=production is always set
sed -i '/^NODE_ENV=/d' ${VPS_PATH}/.env
echo "NODE_ENV=production" >> ${VPS_PATH}/.env

# Ensure DATABASE_URL is always present (never overwrite if already set with creds)
if ! grep -q '^DATABASE_URL=' ${VPS_PATH}/.env; then
  echo "DATABASE_URL=postgresql://mvault:mvault_secure_2026!@localhost:5432/mvault_db" >> ${VPS_PATH}/.env
fi
EOF
echo "  ✓ VPS .env updated"

# ── 5. Restart server via systemd service ─────────────────────────────────
echo ""
echo "[5/5] Restarting mvault.service via systemd..."
$SSH "systemctl restart mvault.service && sleep 2 && systemctl is-active mvault.service"
echo "  ✓ Server restarted (systemd mvault.service)"

echo ""
echo "══════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE ✓"
echo "══════════════════════════════════════════════════"
echo ""
echo "  App: https://app.mvault.pro"
echo "  VPS: http://${VPS_IP}:5000"
echo ""
