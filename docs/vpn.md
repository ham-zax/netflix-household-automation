# German VPN for TVs

The optional WireGuard server forwards selected TVs through Germany. It runs
separately from the Gmail listener. A working VPN does not prove Netflix accepts
the server IP or stops household prompts. Account stream limits still apply.

## Controls

Run these commands from the repository. They use the server's existing sudo
permission. The agent can run the same commands when you ask.

```bash
scripts/netflix-vpn.sh status
scripts/netflix-vpn.sh off
scripts/netflix-vpn.sh on
scripts/netflix-vpn.sh add-client another-home
```

`off` stops the tunnel, removes its firewall rules and disables startup at boot.
`on` restores the service link, starts the tunnel and enables startup at boot.
Neither command stops or restarts the Gmail listener.

If the router's VPN kill switch is enabled, the selected TV loses internet when
the VPN stops. Disable that TV's VPN routing on the router to restore its normal
local connection. The server cannot change a remote router's device selection.

## Oracle cloud ingress

The host firewall allows UDP 51820 while the VPN runs. Oracle's separate network
firewall must also allow it. No Oracle API credentials are configured here, so
the setup does not change cloud rules.

In Oracle Cloud, open this instance's networking page. Check its attached network
security groups and subnet security lists. Add an ingress rule to the applicable
group or list:

- Source CIDR: `0.0.0.0/0`
- IP protocol: UDP
- Source port: All
- Destination port: `51820`
- Stateful: Yes

The public endpoint is `89.168.87.96:51820`. The local namespace check bypasses
Oracle's ingress firewall. Only a real remote handshake checks that rule.

## Archer AX10 v3

The router screenshot confirms WireGuard under VPN Client.

1. Download `private/netflix-vpn/clients/home.conf` privately to your computer.
2. Open **Advanced → VPN Client → Add**.
3. Enter a description such as `Netflix Germany`.
4. Select **WireGuard**. Import `home.conf` using **Import from Config File**.
5. Enable **NAT**. The router must translate the TV's LAN address to its VPN address.
6. Enable **VPN Kill Switch** to prevent direct fallback when the tunnel fails.
7. Save the profile and enable it in the server list.
8. Add only your TV to the VPN device list. Other devices keep their usual route.
9. Check that the router reports a connection and that the server records a handshake.

The AX10 form rejects the combined IPv4/IPv6 Allowed IPs entry. Profiles use
`AllowedIPs = 0.0.0.0/0` for IPv4 egress. Disable IPv6 for the TV or its network
before relying on a common exit IP. The IPv4 tunnel does not capture direct
IPv6 traffic. DNS settings are included in the profile.

Give each friend their own profile: `friend1.conf` or `friend2.conf`. Do not reuse
one profile at two homes. Each router must support a WireGuard VPN client.
All selected TVs must keep using Germany for the shared-exit experiment.

First check one TV. Then check concurrent playback. A router connection indicator
alone does not prove that the TV follows the VPN route. Check Netflix's network
test and, where available, the TV browser's public IP. IPv4 must match the German
endpoint. Check IPv6 separately. The server's `status` command shows handshake
and transfer activity. Playback acceptance remains a separate Netflix check.

## Files and system changes

- `scripts/netflix-vpn.sh`: installation, client generation and controls.
- `scripts/netflix-vpn-firewall.sh`: scoped host firewall changes.
- `private/netflix-vpn/wg-netflix.conf`: server configuration.
- `private/netflix-vpn/server.key`: server private key, root-readable only.
- `private/netflix-vpn/clients/*.conf`: private router profiles.
- `private/netflix-vpn/netflix-vpn.service`: service definition.
- `/etc/systemd/system/`: service and boot symlinks to the repository definition.
- System package: `wireguard-tools`.
- Runtime setting: `net.ipv4.ip_forward=1`, set when the service starts.

Private directories use mode 700. Profiles and keys use mode 600. The existing
Git ignore rule excludes `private/`. Never commit, paste or publish profiles.
The server's default route, DNS and SSH settings do not change. Starting the VPN
does not route the server's other applications through a different connection.

Firewall rules use only the `NFVPN_INPUT`, `NFVPN_FORWARD` and `NFVPN_NAT`
chains and their jumps. They allow public IPv4 egress, reject private and special
destinations, block peer-to-peer traffic and block access to server services.
Stopping removes those chains. It leaves global IPv4 forwarding enabled to avoid
disrupting any other forwarding consumers. No persistent sysctl file is created.

## Install on another server

The scripts are portable. Interface name, subnet, port, unit name and the initial
client list are options, so one server can be an Australian exit and another a
German exit without editing code.

```bash
scripts/netflix-vpn.sh install YOUR_PUBLIC_IPV4_OR_HOSTNAME
```

Options:

| Option | Default | Meaning |
|---|---|---|
| `--interface NAME` | `wg-netflix` | WireGuard interface, 15 characters maximum |
| `--subnet CIDR` | `10.77.0.0/24` | Tunnel subnet. `/24` only |
| `--port PORT` | `51820` | UDP listen port |
| `--unit NAME` | `netflix-vpn.service` | systemd unit file name |
| `--clients "A B"` | `home friend1 friend2` | Profiles to create at install |

Settings are stored in `private/netflix-vpn/settings`, so `on`, `off`, `status`
and `add-client` need no repeated flags. The firewall helper reads the subnet and
port from the live interface, so it works with any tunnel name.

Example, an Australian exit on a second server:

```bash
scripts/netflix-vpn.sh install 54.252.229.131 --subnet 10.88.0.0/24 --clients home
```

Remove it with `scripts/netflix-vpn.sh uninstall`. That stops the service, removes
the unit link and the firewall rules, and keeps the keys. Add `--purge` to delete
the keys and profiles too.

The install command refuses to overwrite an existing configuration, refuses a
subnet that is already routed, and refuses an existing unit name. Keep each
checkout at its install path because the unit uses absolute repository paths.

Each server needs its own cloud ingress rule for the UDP port. A server also needs
`wireguard-tools` and `iptables`, which the installer adds when missing.

Both homes' internet connections and the server carry the streams. Server egress
can consume a cloud traffic allowance. Check each cloud account's allowance and
billing separately.

References: [WireGuard quick start](https://www.wireguard.com/quickstart/) and
[TP-Link VPN Client guide](https://www.tp-link.com/us/support/faq/3135/).
