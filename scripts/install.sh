#!/usr/bin/env bash
# Installs dependencies, the CloakBrowser Chromium binary and the systemd user service.
# Safe to re-run: an existing config file is never overwritten.
set -euo pipefail
umask 077
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

command -v node >/dev/null || { echo 'Node.js 20.19+ is required (https://nodejs.org).' >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)' \
  || { echo "Node.js 20.19+ is required; found $(node -v)." >&2; exit 1; }

echo '==> Installing Node dependencies'
npm ci --no-audit --no-fund

echo '==> Installing the CloakBrowser Chromium binary'
npx cloakbrowser install
npx cloakbrowser info --quick || true

config_dir="$HOME/.config/oracle-gmail-listener"
state_dir="$HOME/.local/state/oracle-gmail-listener"
unit_dir="$HOME/.config/systemd/user"
mkdir -p "$config_dir" "$state_dir" "$unit_dir"
chmod 700 "$config_dir" "$state_dir"

new_config=0
if [[ ! -e "$config_dir/config.env" ]]; then
  install -m 600 .env.example "$config_dir/config.env"
  new_config=1
fi

echo '==> Installing the systemd user service'
sed -e "s#@REPO@#$repo#g" -e "s#@NODE@#$(command -v node)#g" \
  systemd/oracle-gmail-listener.service > "$unit_dir/oracle-gmail-listener.service"
chmod 644 "$unit_dir/oracle-gmail-listener.service"
systemctl --user daemon-reload

if [[ "$new_config" == 1 ]]; then
  cat <<MSG

Almost done. Fill in your Gmail address and app password:
  \$EDITOR $config_dir/config.env
Then start the service:
  systemctl --user enable --now oracle-gmail-listener.service
MSG
else
  systemctl --user enable oracle-gmail-listener.service
  systemctl --user restart oracle-gmail-listener.service
  echo 'Service restarted with the existing configuration.'
fi
echo "To keep it running after you log out: sudo loginctl enable-linger $USER"
echo 'If Chromium fails to start, install its system libraries: sudo npx playwright-core install-deps chromium'
