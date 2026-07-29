#!/bin/bash
set -euo pipefail


if ! tailscale status >/dev/null 2>&1; then
    echo "Tailscale is not running. Starting Tailscale..."
    sudo systemctl start tailscaled
    sudo tailscale up --accept-routes
fi

ssh root@100.109.88.26 "pct exec 121 -- bash -c '
cd /root/JVLink && 
git pull origin main && 
docker compose up -d --build && 
docker image prune -f && 
docker compose logs --tail 20 app'"

echo "Deployment completed successfully."
sleep 5
curl  https://jvlink.app/

