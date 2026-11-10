#!/usr/bin/env bash
# Own only the NFVPN chains and their jumps. Preserve the host's existing rules.
# The subnet and port are read from the live interface, so any tunnel name works.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 ]] || { echo 'Run through netflix-vpn.sh as root.' >&2; exit 1; }
action=${1:-}
interface=${2:-}
case "$action" in
  up|down) ;;
  *) echo "Usage: $(basename "$0") up|down INTERFACE" >&2; exit 2 ;;
esac
[[ $interface =~ ^[a-zA-Z0-9_=+.-]{1,15}$ ]] || { echo 'Unexpected VPN interface.' >&2; exit 1; }

remove_chain() {
  local table=$1 parent=$2 chain=$3
  if iptables -w -t "$table" -C "$parent" -j "$chain" 2>/dev/null; then
    iptables -w -t "$table" -D "$parent" -j "$chain"
  fi
  if iptables -w -t "$table" -nL "$chain" >/dev/null 2>&1; then
    iptables -w -t "$table" -F "$chain"
    iptables -w -t "$table" -X "$chain"
  fi
}

cleanup() {
  remove_chain filter INPUT NFVPN_INPUT
  remove_chain filter FORWARD NFVPN_FORWARD
  remove_chain nat POSTROUTING NFVPN_NAT
}

if [[ $action == down ]]; then
  cleanup
  exit 0
fi

subnet=$(ip -4 route show dev "$interface" scope link 2>/dev/null |
  awk '/proto kernel/ {print $1; exit}')
port=$(wg show "$interface" listen-port 2>/dev/null || true)
[[ $subnet =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] ||
  { echo 'Cannot read the tunnel subnet.' >&2; exit 1; }
[[ $port =~ ^[0-9]{1,5}$ ]] || { echo 'Cannot read the tunnel port.' >&2; exit 1; }

uplink=$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="dev") {print $(i+1); exit}}')
[[ -n $uplink && $uplink != "$interface" ]] || { echo 'No usable uplink.' >&2; exit 1; }
cleanup
trap cleanup ERR

iptables -w -N NFVPN_INPUT
iptables -w -A NFVPN_INPUT -i "$interface" -j DROP
iptables -w -A NFVPN_INPUT -i "$uplink" -p udp --dport "$port" -j ACCEPT
iptables -w -I INPUT 1 -j NFVPN_INPUT

iptables -w -N NFVPN_FORWARD
for destination in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 \
  169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 \
  192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 \
  224.0.0.0/4 240.0.0.0/4; do
  iptables -w -A NFVPN_FORWARD -i "$interface" -d "$destination" -j REJECT
done
iptables -w -A NFVPN_FORWARD -i "$interface" -s "$subnet" -o "$uplink" -j ACCEPT
iptables -w -A NFVPN_FORWARD -i "$uplink" -o "$interface" -d "$subnet" \
  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -w -A NFVPN_FORWARD -i "$interface" -j REJECT
iptables -w -A NFVPN_FORWARD -o "$interface" -j REJECT
iptables -w -I FORWARD 1 -j NFVPN_FORWARD

iptables -w -t nat -N NFVPN_NAT
iptables -w -t nat -A NFVPN_NAT -s "$subnet" -o "$uplink" -j MASQUERADE
iptables -w -t nat -I POSTROUTING 1 -j NFVPN_NAT
trap - ERR
