# 01 — Infrastructure

## Host & hypervisor
- Host: ThinkPad T14 (Arch Linux), KVM/QEMU + libvirt.
- 4 isolated virtual switches (`virbr-lan/dmz/soc/atk`) — no host IP, no outside
  route. All routing/filtering is done by OPNsense only, so every inter-segment
  packet is filterable and visible to the IDS/SIEM.

## Segmentation
| Interface | libvirt net | Subnet | Purpose |
|---|---|---|---|
| WAN | macvtap on host NIC | DHCP (home net) | entry point / attack surface |
| LAN | lab-lan | 10.10.10.0/24 | office clients + vpn-portal |
| DMZ | lab-dmz | 10.10.20.0/24 | web server + DB + honeynet |
| SOC | lab-soc | 10.10.30.0/24 | Wazuh SIEM |

## OPNsense firewall model (default-deny between zones)
- `Block DMZ to LAN`, `Block DMZ to SOC`, `Block LAN to SOC`, `Block SOC to *` —
  segments cannot talk to each other by default.
- **Narrow holes only**, least-privilege:
  - `Allow vpn-portal Wazuh agent to SOC` — LAN 10.10.10.20 → SOC 10.10.30.10, ports 1514/1515
  - `Allow web-dmz Wazuh agent to SOC` — DMZ 10.10.20.10 → SOC 10.10.30.10, ports 1514/1515
  - DMZ/SOC → Internet limited to 80/443/53 (for package updates)
- Rule order matters: the agent `Pass` rule must sit **above** `Block DMZ to SOC`
  (first match wins with Quick rules).

### Incident note (real troubleshooting)
After a host reboot the `Allow web-dmz → SOC (1514/1515)` rule went missing, so the
web-dmz agent silently dropped off the manager (`Transport endpoint is not
connected`). Diagnosed by elimination: manager listening on 1514 ✓, SOC local
firewall clean ✓, `/dev/tcp/10.10.30.10/1514` from DMZ → blocked, `ping` DMZ→SOC
100% loss → OPNsense. Fix: recreate the Pass rule above the block rule, then
**Apply** (OPNsense `Save` ≠ `Apply`). Lesson: back up `/conf/config.xml` and
re-verify firewall holes + `agent_control -l` after every reboot.

## Host → segment access (veth)
The host reaches each isolated segment through veth pairs (host `.50` in LAN/DMZ/SOC),
brought up automatically by a systemd unit `lab-veth.service` (also self-heals
stuck `DOWN` links after reboot).

## Autonomy
Everything runs under **systemd** so the lab survives reboots and crashes:
`honey-mysql`, `honey-ssh`, `firewall-siege` (web-dmz), `lab-veth` (host),
MariaDB, and the Wazuh agent/manager. No component is left running by hand.
