# 04 — Detections (MITRE ATT&CK mapped)

Custom rules live on the manager in `/var/ossec/etc/rules/local_rules.xml`
(see `src/wazuh/local_rules.xml`). Every detection is mapped to a MITRE technique.

## Honeynet group
| Rule | Level | Fires on | MITRE |
|---|---|---|---|
| 100400 | 10 | connection to fake_mysql (3306) | T1046 Network Service Discovery |
| 100401 | 10 | connection to fake_ssh (2222) | T1046 Network Service Discovery |
| 100402 | 12 | login attempt on fake_ssh (creds captured) | T1110 Brute Force |
| 100403 | **14** | **honeytoken `d1_admin` used** (cascades off 100402) | T1078 Valid Accounts |

Rule 100403 is a **cascade**: `<if_sid>100402</if_sid>` + `username = d1_admin`.
It only evaluates after a login attempt matched, then raises severity to critical
when the username is the planted decoy. Matches on **username, not password** — the
attacker lifts the username from the leaked data; the password is irrelevant.

## Lab services group (health monitoring)
| Rule | Level | Fires on |
|---|---|---|
| 100500 | 3 | service status report (every 60s) — child of built-in rule 530 |
| 100501 | 10 | a monitored service is `inactive` (DOWN) |

**Key gotcha:** command-monitoring output decodes as `ossec` and is caught by
built-in rule 530 first. A custom rule with a bare `<match>` never fires — it must
chain with `<if_sid>530</if_sid>`. Isolated and confirmed with `wazuh-logtest`
before deploying (paste one log line → see which rule id triggers).

## Target-app group (Firewall Siege)
The vulnerable app emits JSON security events; rules cover SQLi attempts (T1190),
client-side score tampering (T1565), IDOR access + bruteforce correlation (T1087),
and unauthorized `/admin` hits (T1595). See `src/firewall-siege/VULNS.md` for the
full vuln→detection matrix.

## Confirmed detections
1. VPN portal `admin_login_fail` (first live detect)
2. fake_mysql connection — rule 100400
3. **Honeytoken `d1_admin`** — rule 100403, level 14 (the breadcrumb payoff)
4. Service DOWN — rule 100501 (health monitoring)

## Testing without a real attack
- `wazuh-logtest` on the manager to validate rule matching.
- Generate trap events from a client:
  `ssh d1_admin@10.10.20.10 -p 2222` (honeytoken) and
  `bash -c 'cat </dev/null >/dev/tcp/10.10.20.10/3306'` (fake_mysql).
