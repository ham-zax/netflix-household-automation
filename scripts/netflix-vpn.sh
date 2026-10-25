#!/usr/bin/env bash
# Manage the optional German VPN without touching the Gmail listener.
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
state="$repo/private/netflix-vpn"
config="$state/wg-netflix.conf"
unit=netflix-vpn.service

usage() {
  echo 'Usage: scripts/netflix-vpn.sh install PUBLIC_IPV4_OR_HOSTNAME'
  echo '       scripts/netflix-vpn.sh on|off|status|add-client NAME'
}

action=${1:-}
case "$action" in
  install|on|off|status|add-client) ;;
  *) usage; exit 2 ;;
esac
if [[ $EUID != 0 ]]; then
  exec sudo -n -- "$repo/scripts/netflix-vpn.sh" "$@"
fi

add_client() {
  local name=${1:-} private_key public_key preshared_key server_key endpoint address
  [[ $name =~ ^[a-z][a-z0-9-]{0,31}$ ]] || { echo 'Use a short lowercase client name.' >&2; exit 2; }
  [[ -f $config ]] || { echo 'Install the VPN first.' >&2; exit 1; }
  [[ ! -e $state/clients/$name.conf ]] || { echo 'Client already exists.' >&2; exit 1; }
  shopt -s nullglob
  local profiles=("$state"/clients/*.conf)
  address=$((${#profiles[@]} + 2))
  ((address <= 254)) || { echo 'No client addresses remain.' >&2; exit 1; }
  private_key=$(wg genkey)
  public_key=$(printf '%s\n' "$private_key" | wg pubkey)
  preshared_key=$(wg genpsk)
  server_key=$(wg pubkey < "$state/server.key")
  endpoint=$(< "$state/endpoint")
  cat > "$state/clients/$name.conf" <<EOF
[Interface]
PrivateKey = $private_key
Address = 10.77.0.$address/32
DNS = 1.1.1.1, 1.0.0.1
MTU = 1380

[Peer]
PublicKey = $server_key
PresharedKey = $preshared_key
Endpoint = $endpoint:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
  cat >> "$config" <<EOF

# $name
[Peer]
PublicKey = $public_key
PresharedKey = $preshared_key
AllowedIPs = 10.77.0.$address/32
EOF
  chmod 600 "$state/clients/$name.conf" "$config"
  if [[ -n ${SUDO_UID:-} && -n ${SUDO_GID:-} ]]; then
    chown "$SUDO_UID:$SUDO_GID" "$state/clients/$name.conf"
  fi
  if systemctl is-active --quiet "$unit"; then
    wg syncconf wg-netflix <(wg-quick strip "$config")
  fi
  echo "Client profile: $state/clients/$name.conf"
}

case "$action" in
  install)
    endpoint=${2:-}
    [[ $endpoint =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { usage; exit 2; }
    [[ ! -e $config ]] || { echo 'VPN already configured. Use on, off, status or add-client.' >&2; exit 1; }
    [[ ! -e /etc/systemd/system/$unit ]] || { echo 'Service name already exists.' >&2; exit 1; }
    if ip -4 route show | grep -q '10\.77\.'; then
      echo 'Tunnel subnet overlaps an existing route.' >&2
      exit 1
    fi
    if ! command -v wg >/dev/null; then
      apt-get update -qq
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends wireguard-tools
    fi
    install -d -m 700 "$state" "$state/clients"
    if [[ -n ${SUDO_UID:-} && -n ${SUDO_GID:-} ]]; then
      chown "$SUDO_UID:$SUDO_GID" "$state" "$state/clients"
    fi
    printf '%s\n' "$endpoint" > "$state/endpoint"
    wg genkey > "$state/server.key"
    private_key=$(< "$state/server.key")
    cat > "$config" <<EOF
[Interface]
PrivateKey = $private_key
Address = 10.77.0.1/24
ListenPort = 51820
MTU = 1380
PostUp = "$repo/scripts/netflix-vpn-firewall.sh" up %i
PostDown = "$repo/scripts/netflix-vpn-firewall.sh" down %i
EOF
    cat > "$state/$unit" <<EOF
[Unit]
Description=Netflix automation WireGuard exit
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStartPre=/usr/sbin/sysctl -w net.ipv4.ip_forward=1
ExecStart=/usr/bin/wg-quick up $config
ExecStop=/usr/bin/wg-quick down $config
ExecStopPost=$repo/scripts/netflix-vpn-firewall.sh down wg-netflix

[Install]
WantedBy=multi-user.target
EOF
    chmod 600 "$config" "$state/server.key" "$state/endpoint"
    chmod 644 "$state/$unit"
    ln -s "$state/$unit" "/etc/systemd/system/$unit"
    systemctl daemon-reload
    for name in home friend1 friend2; do add_client "$name"; done
    systemctl enable --now "$unit"
    echo 'Server started. Oracle ingress must allow UDP 51820.'
    ;;
  on)
    [[ -f $config ]] || { echo 'Install the VPN first.' >&2; exit 1; }
    # disable removes linked unit files, so enable by absolute path restores it.
    systemctl enable --now "$state/$unit"
    echo 'Netflix VPN on. Startup at boot enabled.'
    ;;
  off)
    [[ -f $config ]] || { echo 'Install the VPN first.' >&2; exit 1; }
    # Stop before disable unlinks the unit and makes ExecStop unavailable.
    systemctl stop "$unit"
    systemctl disable "$unit"
    echo 'Netflix VPN off. Startup at boot disabled. Email listener unchanged.'
    ;;
  status)
    if [[ ! -f $config ]]; then echo 'Netflix VPN is not installed.'; exit 0; fi
    echo "Service: $(systemctl is-active "$unit" || true)"
    echo "Boot: $(systemctl is-enabled "$unit" || true)"
    if ip link show wg-netflix >/dev/null 2>&1; then wg show wg-netflix; fi
    ;;
  add-client) add_client "${2:-}" ;;
esac
