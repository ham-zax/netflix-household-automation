# Connect family TVs through Germany

This folder records the discussion, installed VPN, router setup and configuration
locations. The aim is to send the selected TVs through one public IP instead of
repeatedly switching the Netflix Household. Netflix acceptance is not guaranteed.

## Start here

- [Discussion and decisions](discussion-and-decisions.md)
- [Complete installation and router guide](../docs/vpn.md)
- [Implementation plan and checks](../docs/vpn-plan.md)
- [VPN management script](../scripts/netflix-vpn.sh)
- [Firewall helper](../scripts/netflix-vpn-firewall.sh)
- [Sanitized client example](examples/client.conf.example)
- [Sanitized server example](examples/server.conf.example)

## All three actual profiles

On this server, `configurations` links to the existing private profile directory.
The link is intentionally excluded from Git. The actual profiles contain private
keys and must not enter a commit.

- [Your home](configurations/home.conf): `10.77.0.2`
- [Friend 1](configurations/friend1.conf): `10.77.0.3`
- [Friend 2](configurations/friend2.conf): `10.77.0.4`

The ignored `server-private` link points to the existing server configuration,
private key, endpoint file and service definition. Root owns the server secrets.
The services continue to use their original paths under `private/netflix-vpn/`.

Git stores the guide and sanitized examples. Git does not back up actual keys.
On a fresh clone, run the installer to create new profiles. To restore these
exact identities, restore `private/netflix-vpn/` from a separate private backup.
Recreate the local links from the repository root:

```bash
ln -s ../private/netflix-vpn/clients germany-friends-vpn/configurations
ln -s ../private/netflix-vpn germany-friends-vpn/server-private
```

## Current setup record

- Host: `oci-hunter-arm`, Oracle Cloud Frankfurt, ARM64.
- Endpoint: `89.168.87.96:51820`, UDP.
- Protocol: WireGuard. Tailscale is not installed for this setup.
- Your router: TP-Link Archer AX10 v3.0, confirmed WireGuard VPN Client.
- Selected device: Samsung TV.
- Home connection: the router showed Connected. The server observed a remote
  handshake and forwarded traffic. This is historical evidence, not live status.
- Friends: profiles exist. Their router setup and simultaneous playback remain
  unconfirmed.
- TV public-IP check, IPv6 behavior and Netflix household acceptance remain
  unconfirmed.

## Controls

From the repository root:

```bash
scripts/netflix-vpn.sh status
scripts/netflix-vpn.sh off
scripts/netflix-vpn.sh on
scripts/netflix-vpn.sh add-client another-home
```

Ask the agent for “VPN on”, “VPN off” or “VPN status” to run these controls.
Turning off also disables startup at boot. Turning on enables startup at boot.
The email listener stays separate and running.

With the router kill switch enabled, a stopped tunnel blocks internet for the
selected TV. To return the TV to its usual connection, disable its VPN access in
the router. Server controls cannot change that remote router setting.

## Router checklist

1. Use the correct private profile for each home. Never share one profile across homes.
2. Import it under VPN Client, select WireGuard, enable NAT, and save.
3. Enable the profile and select only the TV in the VPN device list.
4. Enable the kill switch if direct fallback must stop.
5. Use Allowed IPs `0.0.0.0/0`. This AX10 rejects the mixed IPv4/IPv6 entry.
6. Disable IPv6 for the TV or its network to prevent a direct IPv6 route.
7. Check Connected, a recent remote handshake and transfer activity.
8. Check the TV's public IP using `https://api.ipify.org` where its browser works.
9. Check actual Netflix playback, then concurrent playback across homes.

Oracle ingress must allow stateful UDP 51820 from `0.0.0.0/0`, source ports All.
The observed remote handshake proves ingress worked at that time. The host
firewall opens the port only while this VPN runs.
