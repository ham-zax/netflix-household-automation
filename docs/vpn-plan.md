# German WireGuard exit

## Scope

Run a WireGuard server for the AX10 v3 VPN Client. Keep the email listener running.
Keep managed scripts, configuration, keys, profiles and the service definition in
this repository. Ignore private files in Git. The system service needs a symlink
in `/etc/systemd/system`. System packages live in the operating system.

Baseline: commit `1ddd571`, clean working tree, Oracle A1 ARM64, two CPUs,
12 GB RAM, uplink `enp0s6`, IPv4 forwarding disabled. No WireGuard tools exist.
The host firewall rejects unsolicited input and forwarding. Preserve its rules.
The existing Gmail listener is active as a user service.

## Implementation

1. Add one management script and one firewall helper under `scripts/`.
2. Install `wireguard-tools`. Generate independent server and client keys using
   WireGuard. Store secrets under ignored `private/netflix-vpn/`, mode 700/600.
3. Generate a systemd unit in that directory and link it into systemd. Use
   `wg-quick` with the repository's server configuration. Listen on UDP 51820.
4. Use `10.77.0.0/24` for the tunnel. Clients route IPv4 and IPv6 into the
   tunnel. Only IPv4 egress is supported. IPv6 traffic is intentionally dropped.
5. Enable IPv4 forwarding when starting. Add only scoped input, forwarding and
   NAT rules. Block clients from host services, private destinations and peers.
   Remove the owned rules when stopping. Leave global IPv4 forwarding enabled
   after stopping to avoid disrupting other forwarding consumers.
6. Expose `on`, `off`, `status` and `add-client NAME`. On/off also controls boot
   persistence. Create `home`, `friend1` and `friend2` profiles initially.
7. Document TP-Link profile import, TV-only device selection, the kill switch,
   and Oracle's required cloud ingress rule for UDP 51820.

No passwords or keys enter chat or Git. No server default-route change, DNS
change, SSH change, listener restart, Tailscale installation or unrelated cleanup.

## Checks and stopping

TDD route: skipped. No test suite changes. Run shellcheck and bash syntax checks.
Check the systemd unit, interface, peer count, firewall state and off/on cycle.
Use a temporary local network namespace to check a real WireGuard handshake,
public egress and private-address blocking. Remove the namespace afterward.
Check the email listener remains active.

External reachability depends on Oracle ingress rules. Router import and Netflix
playback require the user's TV. Report those checks as pending until observed.
Do not claim that a working VPN proves Netflix household acceptance.

## Execution evidence

Installed `wireguard-tools` and created three profiles. Shellcheck and bash
syntax checks pass. A temporary network namespace completed a real WireGuard
handshake and HTTPS egress through `89.168.87.96`. Private destinations, instance
metadata, host access and IPv6 egress were blocked. The namespace was removed.

The first off/on check exposed systemd's linked-unit removal behavior. The
control now stops the service before unlinking it and enables it by absolute
path. The repeated check removed the interface and all owned firewall rules
when off, then restored the service when on. Final state: active and enabled.
The email listener remains active. Private file permissions and Git exclusion
pass. Oracle ingress and actual router/Netflix playback remain unchecked.
