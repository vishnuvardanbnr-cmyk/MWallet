#!/usr/bin/env bash
# setup-fresh-vps.sh — Full fresh installation of MVault on a clean VPS
# Run this ONCE after a fresh OS install. Then use update-vps.sh for future deploys.
# Usage: bash scripts/setup-fresh-vps.sh

set -e

VPS_IP="173.249.10.179"
VPS_USER="root"
VPS_PATH="/opt/mvault"
DB_NAME="mvault"
DB_USER="mvault"
DB_PASS="Mvault2025Secure!"

MVT_TOKEN="0x50984Ea16b3F79bB9B280a1ddEd624080F146Ad4"
MVAULT_CONTRACT="0x08d7e03c29623d3eEcc2D53cF6D4A1edf7E5F57c"
BOARD_HANDLER="0x9dBE6Ee45d93d223AAF515c76dB74FA63f48b474"
PAYMENT_TOKEN="0x0D3E80cBc9DDC0a3Fdee912b99C50cd0b5761eE3"

if [ -z "$VPS_PASSWORD" ]; then
  echo "❌ VPS_PASSWORD env var is not set"
  exit 1
fi

SSH="sshpass -p $VPS_PASSWORD ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP}"
SCP="sshpass -p $VPS_PASSWORD scp -o StrictHostKeyChecking=no -r"

echo ""
echo "══════════════════════════════════════════════════"
echo "  MVault Fresh VPS Setup"
echo "  Target: ${VPS_USER}@${VPS_IP}"
echo "══════════════════════════════════════════════════"
echo ""

# ── 1. Build frontend ──────────────────────────────────────────────────────
echo "[1/7] Building frontend..."
VITE_MVT_TOKEN_ADDRESS=$MVT_TOKEN \
VITE_MVAULT_CONTRACT_ADDRESS=$MVAULT_CONTRACT \
VITE_BOARD_HANDLER_ADDRESS=$BOARD_HANDLER \
VITE_PAYMENT_TOKEN_ADDRESS=$PAYMENT_TOKEN \
VITE_BSC_NETWORK=testnet \
npm run build 2>&1 | tail -4
echo "  ✓ Frontend built"

# ── 2. Install Node.js 20 + PM2 ───────────────────────────────────────────
echo ""
echo "[2/7] Installing Node.js 20 + PM2..."
$SSH bash <<'ENDSSH'
set -e
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
apt-get install -y nodejs 2>/dev/null
npm install -g pm2 2>/dev/null
echo "  node: $(node --version)  npm: $(npm --version)  pm2: $(pm2 --version)"
ENDSSH
echo "  ✓ Node.js + PM2 installed"

# ── 3. Install PostgreSQL ──────────────────────────────────────────────────
echo ""
echo "[3/7] Installing PostgreSQL..."
$SSH bash <<ENDSSH
set -e
apt-get install -y postgresql postgresql-contrib 2>/dev/null
systemctl enable postgresql
systemctl start postgresql
# Create DB user and database
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || \
  sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || echo "DB already exists"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true
echo "  ✓ PostgreSQL ready"
ENDSSH
echo "  ✓ PostgreSQL installed"

# ── 4. Sync app files ─────────────────────────────────────────────────────
echo ""
echo "[4/7] Syncing app files..."
$SSH "mkdir -p ${VPS_PATH}"

# Wipe and sync dist
$SSH "rm -rf ${VPS_PATH}/dist && mkdir -p ${VPS_PATH}/dist"
$SCP dist/public dist/index.cjs ${VPS_USER}@${VPS_IP}:${VPS_PATH}/dist/

# Sync source
$SCP server/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/server/
$SCP shared/ ${VPS_USER}@${VPS_IP}:${VPS_PATH}/shared/
sshpass -p $VPS_PASSWORD scp -o StrictHostKeyChecking=no package.json ${VPS_USER}@${VPS_IP}:${VPS_PATH}/package.json
sshpass -p $VPS_PASSWORD scp -o StrictHostKeyChecking=no package-lock.json ${VPS_USER}@${VPS_IP}:${VPS_PATH}/package-lock.json 2>/dev/null || true
sshpass -p $VPS_PASSWORD scp -o StrictHostKeyChecking=no drizzle.config.ts ${VPS_USER}@${VPS_IP}:${VPS_PATH}/drizzle.config.ts
echo "  ✓ App files synced"

# ── 5. Create .env ────────────────────────────────────────────────────────
echo ""
echo "[5/7] Writing .env..."
DATABASE_URL_VPS="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

$SSH bash <<ENDSSH
cat > ${VPS_PATH}/.env <<'EOF'
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
VITE_MVT_TOKEN_ADDRESS=${MVT_TOKEN}
VITE_MVAULT_CONTRACT_ADDRESS=${MVAULT_CONTRACT}
VITE_BOARD_HANDLER_ADDRESS=${BOARD_HANDLER}
VITE_PAYMENT_TOKEN_ADDRESS=${PAYMENT_TOKEN}
VITE_BSC_NETWORK=testnet
EOF
echo "  ✓ .env written"
ENDSSH
echo "  ✓ .env created"

# ── 6. Install deps + push DB schema ─────────────────────────────────────
echo ""
echo "[6/7] Installing npm deps + setting up database schema..."
$SSH bash <<ENDSSH
set -e
cd ${VPS_PATH}
npm install --production 2>/dev/null | tail -3
# Push schema using drizzle-kit
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}" \
  npx drizzle-kit push 2>&1 | tail -5 || echo "  Schema push completed (or already up to date)"
echo "  ✓ Dependencies + schema ready"
ENDSSH
echo "  ✓ Database schema pushed"

# ── 7. Start with PM2 ─────────────────────────────────────────────────────
echo ""
echo "[7/7] Starting app with PM2..."
$SSH bash <<ENDSSH
cd ${VPS_PATH}
pm2 delete mvault 2>/dev/null || true
pm2 start dist/index.cjs \
  --name mvault \
  --env production \
  --env-file ${VPS_PATH}/.env \
  -- --port 5000
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1
sleep 3
pm2 status mvault
ENDSSH
echo "  ✓ PM2 started"

echo ""
echo "══════════════════════════════════════════════════"
echo "  SETUP COMPLETE ✓"
echo "══════════════════════════════════════════════════"
echo "  App: http://${VPS_IP}:5000"
echo "  Domain: https://app.mvault.pro"
echo ""
echo "  Contracts:"
echo "    MVT Token:   ${MVT_TOKEN}"
echo "    MVault Main: ${MVAULT_CONTRACT}"
echo "    Board:       ${BOARD_HANDLER}"
echo ""
