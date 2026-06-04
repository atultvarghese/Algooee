#!/usr/bin/env bash

# Algooee EC2 Automated Deployment Script
# This script should be run with sudo inside the cloned repository on the EC2 instance.
# Example: sudo ./deploy.sh

set -e

# --- 1. Root & Directory Detection ---
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run this script with sudo (e.g., sudo ./deploy.sh)"
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="${SUDO_USER:-ubuntu}"
HOME_DIR="/home/${APP_USER}"

echo "[+] Starting deployment setup..."
echo "[+] App directory: ${APP_DIR}"
echo "[+] Running as user: ${APP_USER}"

# --- 2. System Update & Dependencies ---
echo "[+] Updating system packages and installing dependencies..."
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev build-essential nginx curl

# --- 3. Swap Space Configuration ---
# 2GB of swap space is highly recommended for t3.micro/small instances to avoid out-of-memory errors
if free | grep -i swap | awk '{print $2}' | grep -q '^0$'; then
  echo "[+] Configuring 2GB swap space..."
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "[+] Swap space configured successfully."
  else
    echo "[!] /swapfile already exists but swap is not enabled. Enabling swap..."
    swapon /swapfile
  fi
else
  echo "[+] Swap space is already enabled."
fi

# --- 4. Python Virtual Environment Setup ---
echo "[+] Setting up Python virtual environment..."
cd "${APP_DIR}"
if [ ! -d ".venv" ]; then
  python3.11 -m venv .venv
fi
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# --- 5. Install Node.js v25.6.1 using NVM ---
echo "[+] Installing Node Version Manager (NVM)..."
export NVM_DIR="/home/${APP_USER}/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  # Run installation script as the app user
  sudo -u "${APP_USER}" -i sh -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash'
fi

# Install and alias Node 25.6.1 as default for the user
echo "[+] Installing Node.js v25.6.1..."
sudo -u "${APP_USER}" -i sh -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm install 25.6.1 && nvm alias default 25.6.1'

# --- 6. Frontend Setup & Build ---
echo "[+] Installing frontend dependencies & building production bundle using Node.js v25.6.1..."
sudo -u "${APP_USER}" -i sh -c "cd ${APP_DIR} && export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && nvm use 25.6.1 && npm install && npm run build"

# --- 7. Set Up Environment File ---
if [ ! -f ".env" ]; then
  echo "[+] Creating .env file from .env.example..."
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    touch .env
  fi
  chown "${APP_USER}:${APP_USER}" .env
  echo "[!] Created a template .env. Make sure to fill in your Upstox credentials."
fi

# --- 8. Configure Systemd Service ---
echo "[+] Creating systemd service file..."
cat <<EOF > /etc/systemd/system/algooee.service
[Unit]
Description=Algooee FastAPI Application
After=network.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${APP_DIR}/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000
Restart=always
Environment=PATH=${APP_DIR}/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
EOF

# Ensure database directory and files are owned by the application user
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "[+] Starting and enabling algooee service..."
systemctl daemon-reload
systemctl start algooee
systemctl enable algooee

# --- 9. Configure Nginx Reverse Proxy ---
echo "[+] Fetching public IP..."
PUBLIC_IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me || echo "localhost")
echo "[+] Detected Public IP: ${PUBLIC_IP}"

echo "[+] Creating Nginx site configuration..."
cat <<EOF > /etc/nginx/sites-available/algooee
server {
    listen 80;
    server_name ${PUBLIC_IP};

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Link Nginx site and test config
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm /etc/nginx/sites-enabled/default
fi

if [ ! -f /etc/nginx/sites-enabled/algooee ]; then
  ln -s /etc/nginx/sites-available/algooee /etc/nginx/sites-enabled/
fi

nginx -t
systemctl restart nginx

# --- 10. Summary & Domain Info ---
echo ""
echo "========================================================================="
echo "                        DEPLOYMENT SUCCESSFUL                            "
echo "========================================================================="
echo "1. Public IP address: ${PUBLIC_IP}"
echo "   -> Point your domain's A-record to: ${PUBLIC_IP}"
echo ""
echo "2. Backend Service Status:"
systemctl is-active algooee
echo ""
echo "3. Action Items:"
echo "   - Edit the .env file to insert your Upstox API keys:"
echo "     nano ${APP_DIR}/.env"
echo "   - After updating .env, restart the service with:"
echo "     sudo systemctl restart algooee"
echo "   - View real-time logs with:"
echo "     sudo journalctl -u algooee -f"
echo "   - Secure your domain with SSL/HTTPS by running:"
echo "     sudo apt install certbot python3-certbot-nginx -y"
echo "     sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com"
echo "========================================================================="
