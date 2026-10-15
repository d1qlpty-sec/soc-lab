# 05 — Dashboards & Reporting

Built in the Wazuh UI (OpenSearch Dashboards) from data already flowing — no code.
Honeypot JSON decodes into `data.*` fields, so visualizations need no custom decoder.

## Dashboard A — "Honeynet SOC Dashboard" (scenario-specific)
| Panel | Type | Definition |
|---|---|---|
| Honeypot hits by trap | Vertical bar | X-axis Terms `data.honeypot`, Y Count |
| Honeynet activity table | Data table | Split rows Terms `data.src_ip` (10) + `data.honeypot` (5) |
| Honeytoken uses (critical) | Metric | filter `rule.id:100403`, Count |

Shows the breadcrumb at a glance: which traps were hit, from which IP, and how many
times the honeytoken was used.

## Dashboard B — "Lab SOC Overview" (all sources)
| Panel | Type | Definition |
|---|---|---|
| Alerts by severity | Pie | Split slices Terms `rule.level` |
| Top rules | Data table | Terms `rule.description` (10) |
| Alerts by agent | Vertical bar | Terms `agent.name` (5) |

A broad view across every source (honeypots, service health, VPN, system events).
Note: Wazuh's built-in **Threat Hunting** / **Security Events** already show all
alerts — in a real SOC you keep the built-in overview and add scenario dashboards
on top, which is exactly this split (A = scenario, B = lab overview).

## PDF reporting
The dashboard **Reporting** button generates an on-demand PDF of the whole board —
a ready SOC report, no external service needed. (Wazuh/OpenSearch Reporting already
covers "automated reports".)

## UI notes learned
- Metrics are scoped to the selected time range — old events aren't visible under
  "Last 24h"; widen the range or generate fresh events.
- `Save` in Visualize is explicit; an unsaved panel can't be added to a dashboard.
