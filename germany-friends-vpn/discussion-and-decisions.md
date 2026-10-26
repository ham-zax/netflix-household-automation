# Discussion and setup record

## Original problem

The German server already approved Netflix Household emails automatically. That
removed manual email clicks, but did not prevent prompts. Friends approved their
homes, then the user's TV requested another household update. The user wanted
the prompts to stop, especially during simultaneous viewing.

The discussion identified repeated household updates as the reported pattern.
It did not establish a universal Netflix detection rule or prove a permanent fix.

## Options discussed

- Keep automatic approvals: already implemented, but does not prevent prompts.
- Run the approver at home: does not establish that prompts stop. The earlier
  claim that German approvals caused the problem was unproven.
- ESP32 relay: discussed, but no firmware was written or installed.
- Raspberry Pi at home: suggested, then withdrawn because approval automation
  was already running. No purchase is required for the current user's router.
- Browser extensions: Nikflix and HouseholdNoMore were found on GitHub. They
  target desktop browsers, not native Samsung TV apps. Failure reports exist.
  Neither extension was installed or tested here.
- Home VPN exit: can route remote playback through one home's connection, but
  uses that home's upload capacity for remote streams.
- German VPN exit: uses the existing server, avoids buying a Pi and avoids
  making one home's upload connection carry everyone else's streams. Chosen.
- Tailscale: another tunnel option. Each remote home still needs a supported
  client device or gateway. Tailscale on Germany alone cannot route a Samsung
  TV. No Tailscale setup was performed.

## Compatibility and chosen route

The user identified an Archer AX10 v3.0. Official firmware notes mention VPN
Client support, and the user's screenshot confirmed WireGuard in VPN Client.
The setup therefore uses native WireGuard instead of Tailscale.

Each home needs a VPN client or gateway. If a friend's router is incompatible,
options include an additional VPN router, a compatible streaming device, or a
computer running the VPN and connected to the TV through HDMI. A streaming
device uses its own Netflix app. A gateway can route the Samsung TV's native app.
Confirm the exact device and software support before buying anything.

All participating homes must use the chosen exit for the shared-IP experiment.
Only changing one home leaves the others using their own public IP addresses.
Each home needs its own key and profile. Profiles already exist for home,
friend1 and friend2.

## Region, bandwidth and speed

The German exit presents a German public IP. Netflix may change available titles,
restrict VPN connections or block playback. It does not guarantee a German
catalogue or preservation of the user's local catalogue.

Both home and server carry the stream. Germany receives video from Netflix and
sends it to each home. Each home still uses its own download bandwidth and data
allowance. The slowest part of the path limits playback, including router VPN
performance. A fast server does not increase a home's connection speed.

Illustration from the discussion: three streams at 20 Mbps each require about
60 Mbps incoming and 60 Mbps outgoing at Germany, plus overhead. This is an
example, not a measured Netflix bitrate. Account simultaneous-stream limits
remain in effect.

Observed short Cloudflare tests on 2026-10-25:

- Download: 1,896.8 Mbps median, 1,969.2 Mbps peak, three 50 MB transfers.
- Upload: 367.7 Mbps median, 510.8 Mbps peak, three 25 MB transfers.
- Oracle metadata: 2 Gbps configured network bandwidth, 2 CPUs, 12 GB RAM.

These tests did not measure sustained VPN throughput to the homes. The user
explicitly asked not to use ProvenFast for the speed test. No optimization work
was performed. Cloud traffic allowance and billing remain unchecked.

## Installed changes

The installer added `wireguard-tools`. It generated server/client keys,
configuration and a service definition under ignored `private/netflix-vpn/`.
Systemd links to the service definition inside the repository. The service uses
interface `wg-netflix` and subnet `10.77.0.0/24`.

Starting enables runtime IPv4 forwarding. Scoped `NFVPN_*` firewall chains allow
public IPv4 egress and block private destinations, metadata, peer traffic and
host-service access. Stopping removes the interface and owned firewall rules.
Global IPv4 forwarding stays enabled after stopping. No persistent sysctl file
was created. The server's default route, DNS and SSH configuration stay unchanged.

The original Gmail listener remains a separate user service. VPN on/off does not
stop or restart it. The user asked for all managed configuration in this
repository and simple agent-operated on/off controls.

Initial measured disk footprint: WireGuard tools 354 KiB, private directory
36 KiB, scripts and original VPN documents 24 KiB. Documentation added later
changes the total. The figures exclude package download caches and system logs.

## Issues found and corrected

1. The first off/on check exposed linked-unit behavior. `systemctl disable --now`
   removed the service definition before shutdown commands ran. The control now
   stops first, then disables. On enables by absolute unit path to restore links.
2. The AX10 rejected `0.0.0.0/0, ::/0`. All three profiles and the generator now
   use `0.0.0.0/0`. Direct IPv6 must be disabled separately for the TV/network.
3. The router initially stayed Connecting because the Oracle ingress step was
   still outstanding. The user later showed Connected. The server then observed
   a real remote handshake and bidirectional forwarding.
4. The earlier ipinfo.io instruction did not show the expected IP for the user.
   The suggested alternative is `https://api.ipify.org` on the TV browser.

## Evidence and remaining checks

Shellcheck and bash syntax checks passed. A temporary network namespace
completed a real WireGuard handshake and HTTPS egress through the German public
IP. Private-address access, host access and IPv6 egress from that namespace were
blocked. The namespace was removed. Off/on checks passed after the correction.
Profiles have distinct keys and mode 600. Private directories use mode 700.
Git excludes the live secrets. The email listener remained active.

The user's later router screenshot showed the home VPN Connected and the Samsung
TV selected. Server counters showed remote traffic in both directions. That does
not alone prove the TV's public IP, IPv6 behavior or Netflix playback acceptance.
Friend connections, concurrent playback and long-term prompt behavior remain
unconfirmed. Recheck current service state with the management script.

## Sources consulted during the discussion

- [Netflix Household signals](https://help.netflix.com/en/node/124925)
- [Update Netflix Household](https://help.netflix.com/en/node/128339)
- [Netflix and VPN connections](https://help.netflix.com/en/node/114701)
- [TP-Link VPN Client](https://www.tp-link.com/us/support/faq/3135/)
- [AX10 v3 downloads](https://www.tp-link.com/in/support/download/archer-ax10/v3/)
- [WireGuard quick start](https://www.wireguard.com/quickstart/)
- [Tailscale exit nodes](https://tailscale.com/kb/1103/exit-nodes)
- [Tailscale app connectors](https://tailscale.com/kb/1281/app-connectors)
- [GL.iNet Tailscale routing](https://docs.gl-inet.com/router/en/4/interface_guide/tailscale/)
- [Nikflix](https://github.com/YidirK/Nikflix)
- [HouseholdNoMore](https://github.com/Amachik/HouseholdNoMore)

This is a structured record of the discussion and observed setup, not a verbatim
chat export or a fresh check of those external sources.
