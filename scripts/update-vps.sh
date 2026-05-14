#!/usr/bin/env bash
# update-vps.sh — Build the app and deploy to VPS
# Usage: bash scripts/update-vps.sh
# All contract addresses are hardcoded from the latest deployment

set -e

VPS_IP="173.249.10.179"
VPS_USER="root"
VPS_PATH="/opt/mvault"

MVT_TOKEN="0xD56629f4E39Bc23aB3c7262aeddC1bB3C9893c08"
MVAULT_CONTRACT="0x393eDB201A29A2d25673aAB8E57CCC5fd6Fe2866"
BOARD_HANDLER="0xdB45afa66c1BC434977a6956fBFD7f19869f4823"
MVAULT_VIEW="0x55ff5c62486EB7117dfc0e6988DA728ce87D1912"
DISTRIBUTOR="0x46B7A3a9f21bC0baf942869d0Ba332fA0C652089"
USDT="0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3"
BSC_NETWORK="testnet"

if [ -z "$VPS_PASSWORD" ]; then
  echo "❌ VPS_PASSWORD env var is not set"
  exit 1
fi

if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
  echo "❌ DEPLOYER_PRIVATE_KEY env var is not set"
  exit 1
fi

SSH="sshpass -p '$VPS_PASSWORD' ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP}"
SCP="sshpass -p '$VPS_PASSWORD' scp -o StrictHostKeyChecking=no -r"

echo ""
echo "══════════════════════════════════════════════════"
echo "  MVault VPS Deployment"
echo "  Target: ${VPS_USER}@${VPS_IP}:${VPS_PATH}"
echo "══════════════════════════════════════════════════"
echo "  MVT Token:       $MVT_TOKEN"
echo "  Mvault Contract: $MVAULT_CONTRACT"
echo "  Board Handler:   $BOARD_HANDLER"
echo "  MvaultView:      $MVAULT_VIEW"
echo "  Distributor:     $DISTRIBUTOR"
echo "  Network:         $BSC_NETWORK"
echo ""

# ── 1. Build frontend ──────────────────────────────────────────────────────
echo "[1/5] Building frontend..."
VITE_MVT_TOKEN_ADDRESS=$MVT_TOKEN \
VITE_MVAULT_CONTRACT_ADDRESS=$MVAULT_CONTRACT \
VITE_BOARD_HANDLER_ADDRESS=$BOARD_HANDLER \
VITE_MVAULT_VIEW_ADDRESS=$MVAULT_VIEW \
VITE_DISTRIBUTOR_ADDRESS=$DISTRIBUTOR \
VITE_PAYMENT_TOKEN_ADDRESS=$USDT \
VITE_BSC_NETWORK=$BSC_NETWORK \
npm run build 2>&1
echo "  ✓ Frontend built"

# ── 2. Ensure VPS app directory exists ────────────────────────────────────
echo ""
echo "[2/5] Preparing VPS directory..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "mkdir -p ${VPS_PATH}/dist"
echo "  ✓ Directory ready"

# ── 3. Sync built files to VPS ────────────────────────────────────────────
echo ""
echo "[3/5] Syncing files to VPS..."

sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} "rm -rf ${VPS_PATH}/dist && mkdir -p ${VPS_PATH}/dist"

sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r dist/public dist/index.cjs ${VPS_USER}@${VPS_IP}:${VPS_PATH}/dist/
echo "  ✓ dist/ synced"

sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r server/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/server/
echo "  ✓ server/ synced"

sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r shared/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/shared/
echo "  ✓ shared/ synced"

sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no package.json ${VPS_USER}@${VPS_IP}:${VPS_PATH}/package.json
echo "  ✓ package.json synced"

# ── 4. Update VPS .env ────────────────────────────────────────────────────
echo ""
echo "[4/5] Updating VPS .env..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} bash <<EOF
touch ${VPS_PATH}/.env

# Remove old values
sed -i '/^VITE_MVT_TOKEN_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_MVAULT_CONTRACT_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_BOARD_HANDLER_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_MVAULT_VIEW_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_DISTRIBUTOR_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_PAYMENT_TOKEN_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_BSC_NETWORK=/d' ${VPS_PATH}/.env

# Write new values
echo "VITE_MVT_TOKEN_ADDRESS=${MVT_TOKEN}" >> ${VPS_PATH}/.env
echo "VITE_MVAULT_CONTRACT_ADDRESS=${MVAULT_CONTRACT}" >> ${VPS_PATH}/.env
echo "VITE_BOARD_HANDLER_ADDRESS=${BOARD_HANDLER}" >> ${VPS_PATH}/.env
echo "VITE_MVAULT_VIEW_ADDRESS=${MVAULT_VIEW}" >> ${VPS_PATH}/.env
echo "VITE_DISTRIBUTOR_ADDRESS=${DISTRIBUTOR}" >> ${VPS_PATH}/.env
echo "VITE_PAYMENT_TOKEN_ADDRESS=${USDT}" >> ${VPS_PATH}/.env
echo "VITE_BSC_NETWORK=${BSC_NETWORK}" >> ${VPS_PATH}/.env
EOF
echo "  ✓ VPS .env updated"

# ── 5. Install deps and restart PM2 ───────────────────────────────────────
echo ""
echo "[5/5] Installing deps and restarting PM2..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} bash <<EOF
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
