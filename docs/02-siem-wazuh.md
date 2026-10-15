# 02 — SIEM (Wazuh)

## Deployment
- **Wazuh all-in-one** on `wazuh-soc` (10.10.30.10), isolated SOC segment.
- Dashboard: `https://10.10.30.10` (self-signed cert).
- SIEM choice: Wazuh over Splunk (Splunk Enterprise needs 12+ GB RAM; Wazuh fits
  the lab's memory budget).

## Agents
| ID | Host | Segment |
|---|---|---|
| 000 | wazuh-soc (manager, local) | SOC |
| 001 | web-dmz | DMZ |
| 002 | vpn-portal | LAN |

Agents reach the manager through the single firewall hole on TCP 1514 (events) and
1515 (registration). `agent_control -l` on the manager lists agent status; this is
the first check after any reboot.

## JSON logs → fields for free
Honeypots write **JSON Lines** (one JSON object per event, UTC ISO-8601 timestamps).
The agent reads them with `<log_format>json</log_format>`, so every field
(`data.honeypot`, `data.src_ip`, `data.username`, `data.event`, ...) becomes a
first-class SIEM field with **no custom decoder** — which is exactly why the traps
log JSON. See `src/wazuh/agent-ossec-snippets.conf`.

## Service health via command monitoring
To get "is each service up?" into the SIEM the agent runs a command every 60s and
ships the output:

```xml
<localfile>
  <log_format>command</log_format>
  <command>for s in honey-mysql honey-ssh firewall-siege; do echo "service $s $(systemctl is-active $s)"; done</command>
  <alias>lab_service_status</alias>
  <frequency>60</frequency>
</localfile>
```

- Command monitoring is **off by default** (RCE safety) — enable on the agent with
  `logcollector.remote_commands=1` in `local_internal_options.conf`.
- Command output decodes as `ossec` and chains off built-in **rule 530**, so the
  custom rules use `<if_sid>530</if_sid>` (a bare `<match>` would never fire —
  verified with `wazuh-logtest`). See `docs/04-detections.md`.

## Log access (permissions)
Honeypot logs live in `/var/log/honeynet/` (not the home dir, which is `750`). The
dir is owned `webadmin:webadmin` `750`, and the agent user `wazuh` is added to the
`webadmin` group so it can read — least-privilege, no world-readable home.
