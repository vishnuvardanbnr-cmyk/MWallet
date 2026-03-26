#!/usr/bin/env bash
# update-vps.sh — Build the app with new contract addresses and deploy to VPS
# Usage: bash scripts/update-vps.sh <MVT_TOKEN> <MVAULT_CONTRACT> <BOARD_HANDLER>
#
# Example:
#   bash scripts/update-vps.sh \
#     0xa986C2aa3FC2A799856CdC8CC08d0bB1CfE523b1 \
#     0x39479f495c83E9FC0FB6206ADe884b3eCAEFAFf3 \
#     <BOARD_MATRIX_ADDR>

set -e

VPS_IP="173.249.10.179"
VPS_USER="root"
VPS_PATH="/opt/mvault"

MVT_TOKEN=$1
MVAULT_CONTRACT=$2
BOARD_HANDLER=$3

if [ -z "$MVT_TOKEN" ] || [ -z "$MVAULT_CONTRACT" ] || [ -z "$BOARD_HANDLER" ]; then
  echo "❌ Usage: bash scripts/update-vps.sh <MVT_TOKEN> <MVAULT_CONTRACT> <BOARD_HANDLER>"
  exit 1
fi

if [ -z "$VPS_PASSWORD" ]; then
  echo "❌ VPS_PASSWORD env var is not set"
  exit 1
fi

SSH="sshpass -p $VPS_PASSWORD ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP}"
SCP="sshpass -p $VPS_PASSWORD scp -o StrictHostKeyChecking=no -r"

echo ""
echo "══════════════════════════════════════════════════"
echo "  MVault VPS Update"
echo "  Target: ${VPS_USER}@${VPS_IP}:${VPS_PATH}"
echo "══════════════════════════════════════════════════"
echo "  MVT Token:       $MVT_TOKEN"
echo "  Mvault Contract: $MVAULT_CONTRACT"
echo "  Board Handler:   $BOARD_HANDLER"
echo ""

# ── 1. Build frontend with new contract addresses ─────────────────────────
echo "[1/4] Building frontend with new contract addresses..."
VITE_MVT_TOKEN_ADDRESS=$MVT_TOKEN \
VITE_MVAULT_CONTRACT_ADDRESS=$MVAULT_CONTRACT \
VITE_BOARD_HANDLER_ADDRESS=$BOARD_HANDLER \
VITE_PAYMENT_TOKEN_ADDRESS=0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3 \
VITE_BSC_NETWORK=testnet \
npm run build 2>&1
echo "  ✓ Frontend built"

# ── 2. Sync built files to VPS ────────────────────────────────────────────
echo ""
echo "[2/4] Syncing built files to VPS..."

# Sync dist/ (built server+frontend)
$SCP dist/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/dist/
echo "  ✓ dist/ synced"

# Sync server source (for any server-side changes)
$SCP server/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/server/
echo "  ✓ server/ synced"

# Sync shared schema
$SCP shared/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/shared/
echo "  ✓ shared/ synced"

# Sync package.json (in case dependencies changed)
sshpass -p $VPS_PASSWORD scp -o StrictHostKeyChecking=no package.json ${VPS_USER}@${VPS_IP}:${VPS_PATH}/package.json
echo "  ✓ package.json synced"

# ── 3. Update VPS .env with new contract addresses ────────────────────────
echo ""
echo "[3/4] Updating contract addresses in VPS .env..."
$SSH bash <<EOF
# Remove old contract address lines and re-append new ones
sed -i '/^VITE_MVT_TOKEN_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_MVAULT_CONTRACT_ADDRESS=/d' ${VPS_PATH}/.env
sed -i '/^VITE_BOARD_HANDLER_ADDRESS=/d' ${VPS_PATH}/.env

echo "VITE_MVT_TOKEN_ADDRESS=${MVT_TOKEN}"         >> ${VPS_PATH}/.env
echo "VITE_MVAULT_CONTRACT_ADDRESS=${MVAULT_CONTRACT}" >> ${VPS_PATH}/.env
echo "VITE_BOARD_HANDLER_ADDRESS=${BOARD_HANDLER}" >> ${VPS_PATH}/.env
echo "  .env updated"
EOF
echo "  ✓ VPS .env updated"

# ── 4. Install deps (if any changed) and restart PM2 ─────────────────────
echo ""
echo "[4/4] Installing dependencies and restarting PM2..."
$SSH bash <<EOF
cd ${VPS_PATH}
npm install --production --silent 2>/dev/null || true
pm2 restart mvault --update-env
pm2 save
EOF
echo "  ✓ PM2 restarted"

echo ""
echo "══════════════════════════════════════════════════"
echo "  VPS UPDATE COMPLETE ✓"
echo "══════════════════════════════════════════════════"
echo ""
echo "  App: http://${VPS_IP}:5000"
echo "  BSCScan:"
echo "    Token:   https://testnet.bscscan.com/address/${MVT_TOKEN}"
echo "    Main:    https://testnet.bscscan.com/address/${MVAULT_CONTRACT}"
echo "    Board:   https://testnet.bscscan.com/address/${BOARD_HANDLER}"
echo ""
