#!/usr/bin/env bash
# Manage an optional WireGuard exit without touching the Gmail listener.
# Portable: interface, subnet, port, unit name and initial clients are options.
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
self="$repo/scripts/netflix-vpn.sh"
state="$repo/private/netflix-vpn"

# Defaults match the first installation on this host.
interface=wg-netflix
subnet=10.77.0.0/24
port=51820
unit=netflix-vpn.service
clients='home friend1 friend2'

usage() {
  cat <<'EOF'
Usage: scripts/netflix-vpn.sh install ENDPOINT [options]
       scripts/netflix-vpn.sh on|off|status
       scripts/netflix-vpn.sh add-client NAME
       scripts/netflix-vpn.sh uninstall [--purge]

install options:
  --interface NAME   WireGuard interface, 15 chars max (default wg-netflix)
  --subnet CIDR      Tunnel subnet, /24 only (default 10.77.0.0/24)
  --port PORT        UDP listen port (default 51820)
  --unit NAME        systemd unit file name (default netflix-vpn.service)
  --clients "A B"    Profiles to create at install (default "home friend1 friend2")

uninstall keeps the private keys and profiles unless you add --purge.
EOF
}

setting() {
  sed -n "s/^$1=//p" "$state/settings" 2>/dev/null | head -1
}

load_settings() {
  local value
  if [[ -f $state/settings ]]; then
    value=$(setting interface)
    if [[ -n $value ]]; then interface=$value; fi
    value=$(setting subnet)
    if [[ -n $value ]]; then subnet=$value; fi
    value=$(setting port)
    if [[ -n $value ]]; then port=$value; fi
    value=$(setting unit)
    if [[ -n $value ]]; then unit=$value; fi
    value=$(setting clients)
    if [[ -n $value ]]; then clients=$value; fi
  fi
  config="$state/$interface.conf"
  prefix=${subnet%.*}.
}

next_address() {
  local used=1 octet
  while read -r octet; do
    if (( octet > used )); then used=$octet; fi
  done < <(awk '$1 == "AllowedIPs" {print $3}' "$config" |
    sed -nE 's#^[0-9]+\.[0-9]+\.[0-9]+\.([0-9]+)/32$#\1#p')
  echo $((used + 1))
}

add_client() {
  local name=${1:-} private_key public_key preshared_key server_key endpoint address
  [[ $name =~ ^[a-z][a-z0-9-]{0,31}$ ]] || { echo 'Use a short lowercase client name.' >&2; exit 2; }
  [[ -f $config ]] || { echo 'Install the VPN first.' >&2; exit 1; }
  [[ ! -e $state/clients/$name.conf ]] || { echo 'Client already exists.' >&2; exit 1; }
  address=$(next_address)
  ((address <= 254)) || { echo 'No client addresses remain.' >&2; exit 1; }
  private_key=$(wg genkey)
  public_key=$(printf '%s\n' "$private_key" | wg pubkey)
  preshared_key=$(wg genpsk)
  server_key=$(wg pubkey < "$state/server.key")
  endpoint=$(< "$state/endpoint")
  cat > "$state/clients/$name.conf" <<EOF
[Interface]
PrivateKey = $private_key
Address = $prefix$address/32
DNS = 1.1.1.1, 1.0.0.1
MTU = 1380

[Peer]
PublicKey = $server_key
PresharedKey = $preshared_key
Endpoint = $endpoint:$port
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
  cat >> "$config" <<EOF

# $name
[Peer]
PublicKey = $public_key
PresharedKey = $preshared_key
AllowedIPs = $prefix$address/32
EOF
  chmod 600 "$state/clients/$name.conf" "$config"
  if [[ -n ${SUDO_UID:-} && -n ${SUDO_GID:-} ]]; then
    chown "$SUDO_UID:$SUDO_GID" "$state/clients/$name.conf"
  fi
  if systemctl is-active --quiet "$unit"; then
    wg syncconf "$interface" <(wg-quick strip "$config")
  fi
  echo "Client profile: $state/clients/$name.conf"
}

install_vpn() {
  local endpoint=${1:-} name
  shift || true
  while (( $# )); do
    case "$1" in
      --interface) interface=${2:?}; shift 2 ;;
      --subnet) subnet=${2:?}; shift 2 ;;
      --port) port=${2:?}; shift 2 ;;
      --unit) unit=${2:?}; shift 2 ;;
      --clients) clients=${2:?}; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
    esac
  done
  [[ $endpoint =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { usage; exit 2; }
  [[ $interface =~ ^[a-zA-Z0-9_=+.-]{1,15}$ ]] || { echo 'Invalid interface name.' >&2; exit 2; }
  if [[ ! $port =~ ^[0-9]{1,5}$ ]] || ((port < 1 || port > 65535)); then
    echo 'Invalid port.' >&2
    exit 2
  fi
  [[ $subnet =~ ^([0-9]{1,3}\.){3}0/24$ ]] ||
    { echo 'Subnet must be a /24 network address, for example 10.77.0.0/24.' >&2; exit 2; }
  [[ $unit =~ ^[a-zA-Z0-9_.@-]+\.service$ ]] || { echo 'Invalid unit name.' >&2; exit 2; }
  config="$state/$interface.conf"
  prefix=${subnet%.*}.
  [[ ! -e $config ]] || { echo 'VPN already configured. Use on, off, status or add-client.' >&2; exit 1; }
  [[ ! -e /etc/systemd/system/$unit ]] || { echo 'Service name already exists.' >&2; exit 1; }
  if ip -4 route show | grep -qF "$prefix"; then
    echo 'Tunnel subnet overlaps an existing route.' >&2
    exit 1
  fi
  local missing=()
  command -v wg >/dev/null || missing+=(wireguard-tools)
  command -v iptables >/dev/null || missing+=(iptables)
  if (( ${#missing[@]} )); then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
  fi
  install -d -m 700 "$state" "$state/clients"
  if [[ -n ${SUDO_UID:-} && -n ${SUDO_GID:-} ]]; then
    chown "$SUDO_UID:$SUDO_GID" "$state" "$state/clients"
  fi
  cat > "$state/settings" <<EOF
interface=$interface
subnet=$subnet
port=$port
unit=$unit
clients="$clients"
EOF
  printf '%s\n' "$endpoint" > "$state/endpoint"
  wg genkey > "$state/server.key"
  local private_key
  private_key=$(< "$state/server.key")
  cat > "$config" <<EOF
[Interface]
PrivateKey = $private_key
Address = ${prefix}1/24
ListenPort = $port
MTU = 1380
PostUp = "$repo/scripts/netflix-vpn-firewall.sh" up %i
PostDown = "$repo/scripts/netflix-vpn-firewall.sh" down %i
EOF
  cat > "$state/$unit" <<EOF
[Unit]
Description=WireGuard exit for selected streaming devices
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStartPre=/usr/sbin/sysctl -w net.ipv4.ip_forward=1
ExecStart=/usr/bin/wg-quick up $config
ExecStop=/usr/bin/wg-quick down $config
ExecStopPost=$repo/scripts/netflix-vpn-firewall.sh down $interface

[Install]
WantedBy=multi-user.target
EOF
  chmod 600 "$config" "$state/server.key" "$state/endpoint" "$state/settings"
  chmod 644 "$state/$unit"
  ln -s "$state/$unit" "/etc/systemd/system/$unit"
  systemctl daemon-reload
  read -ra names <<< "$clients"
  for name in "${names[@]}"; do add_client "$name"; done
  systemctl enable --now "$unit"
  echo "Server started on UDP $port, subnet $subnet, interface $interface."
  echo "The cloud firewall must allow inbound UDP $port from 0.0.0.0/0."
}

uninstall_vpn() {
  local purge=${1:-}
  if [[ -e /etc/systemd/system/$unit || -e $state/$unit ]]; then
    systemctl stop "$unit" 2>/dev/null || true
    systemctl disable "$unit" 2>/dev/null || true
  fi
  if ip link show "$interface" >/dev/null 2>&1; then
    "$repo/scripts/netflix-vpn-firewall.sh" down "$interface" || true
  fi
  rm -f "/etc/systemd/system/$unit" "$state/$unit"
  systemctl daemon-reload 2>/dev/null || true
  rm -f "$state/settings"
  echo "Service and firewall rules removed."
  if [[ $purge == --purge ]]; then
    rm -rf "$state"
    echo "Private keys and profiles deleted."
  else
    echo "Private keys and profiles kept in $state. Add --purge to delete them."
  fi
}

action=${1:-}
case "$action" in
  install|on|off|status|add-client|uninstall) ;;
  *) usage; exit 2 ;;
esac
if [[ $EUID != 0 ]]; then
  exec sudo -n -- "$self" "$@"
fi

if [[ $action == install ]]; then
  shift
  install_vpn "$@"
  exit 0
fi

load_settings

case "$action" in
  on)
    [[ -f $config ]] || { echo 'Install the VPN first.' >&2; exit 1; }
    # disable removes linked unit files, so enable by absolute path restores it.
    systemctl enable --now "$state/$unit"
    echo 'VPN on. Startup at boot enabled.'
    ;;
  off)
    [[ -f $config ]] || { echo 'Install the VPN first.' >&2; exit 1; }
    # Stop before disable unlinks the unit and makes ExecStop unavailable.
    systemctl stop "$unit"
    systemctl disable "$unit"
    echo 'VPN off. Startup at boot disabled. Email listener unchanged.'
    ;;
  status)
    if [[ ! -f $config ]]; then echo 'VPN is not installed.'; exit 0; fi
    echo "Unit: $(systemctl is-active "$unit" || true) / boot $(systemctl is-enabled "$unit" || true)"
    echo "Interface: $interface  Subnet: $subnet  Port: $port"
    echo "Endpoint: $(< "$state/endpoint")"
    if ip link show "$interface" >/dev/null 2>&1; then wg show "$interface"; fi
    ;;
  add-client) add_client "${2:-}" ;;
  uninstall) uninstall_vpn "${2:-}" ;;
esac
