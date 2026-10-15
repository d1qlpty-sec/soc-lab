# Honeynet traps

Low-interaction honeypots. See [../../docs/03-honeynet.md](../../docs/03-honeynet.md).

| File | Port | Role |
|---|---|---|
| `fake_mysql.py` | 3306 | Decoy MySQL/MariaDB — sends a valid handshake, logs connections |
| `fake_ssh.py` | 2222 | Real-handshake SSH trap (Paramiko) — captures credentials, always denies |

Run as systemd services (see `../systemd/`). `fake_ssh.py` needs `paramiko`
(own venv). Logs → `/var/log/honeynet/*.log` (JSON), read by the Wazuh agent.
