# 06 — VPN Access Portal

Private, VPN-only access to the lab — nothing is exposed to the internet.

## WireGuard
- Self-hosted WireGuard server on `vpn-portal` (10.10.10.20, LAN).
- OPNsense forwards WAN UDP 51820 → 10.10.10.20.
- Clients (admin laptop, attacker box) connect over the tunnel (10.10.100.0/24).

## Portal (Flask)
- Self-service WireGuard **key issuance**.
- Live admin view (`wg show`) + access audit.
- Runs its own Wazuh agent (ID 002) → events shipped to SOC.

## Detection
Custom rules on the manager flag failed admin logins and brute-force patterns
against the portal — the lab's **first confirmed live detection**
(`admin_login_fail` in `alerts.log`).

> Credentials, keys and `config.py` secrets are kept out of this repository by
> design (see `.gitignore`).
