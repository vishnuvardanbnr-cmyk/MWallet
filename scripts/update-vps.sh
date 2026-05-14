#!/usr/bin/env bash
# update-vps.sh — Build the app and deploy to VPS via SSH key
# Usage: bash scripts/update-vps.sh
# Requires: VPS_SSH_KEY env secret

set -e

VPS_IP="173.249.10.179"
VPS_USER="root"
VPS_PATH="/opt/mvault"
SSH_KEY="/tmp/mvault_deploy_key"

MVT_TOKEN="0x248984989669c6e0D817221A934ca899583c3836"
MVAULT_CONTRACT="0xcF110A7D5D2D5e2Df14db910f137A9f6681247d2"
BOARD_HANDLER="0xAC6A29Fa016D7bcd0295b64524b007C81aB8E887"
MVAULT_VIEW="0x76C90Aab0FCF2a79c0A8Ea9aCae14Eb6305215b2"
MVAULT_STAKING="0x23168479Bda53409B0ed0CBe434665Fe9B157e91"
DISTRIBUTOR="0x46B7A3a9f21bC0baf942869d0Ba332fA0C652089"
USDT="0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3"
BSC_NETWORK="testnet"

if [ -z "$VPS_SSH_KEY" ]; then
  echo "❌ VPS_SSH_KEY env secret is not set"
  exit 1
fi

# Write SSH private key to temp file
printf '%s\n' "$VPS_SSH_KEY" > "$SSH_KEY"
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
EOF
echo "  ✓ VPS .env updated"

# ── 5. Install deps and restart PM2 ───────────────────────────────────────
echo ""
echo "[5/5] Installing deps and restarting PM2..."
$SSH bash <<EOF
cd ${VPS_PATH}
npm install --production --silent 2>/dev/null || true
pm2 restart mvault --update-env || pm2 start dist/index.cjs --name mvault
pm2 save
EOF
echo "  ✓ PM2 restarted"

echo ""
echo "══════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE ✓"
echo "══════════════════════════════════════════════════"
echo ""
echo "  App: https://app.mvault.pro"
echo "  VPS: http://${VPS_IP}:5000"
echo ""
