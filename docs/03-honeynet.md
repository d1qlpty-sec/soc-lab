# 03 — Honeynet

Hand-written **low-interaction** honeypots. They have nothing real inside (safe),
their only job is to prove someone is probing or has moved laterally. Any
connection to them is suspicious by definition — there is no legitimate traffic.

## fake_mysql — decoy MySQL (port 3306)
`src/honeynet/fake_mysql.py`

- The real MariaDB was moved to `127.0.0.1:49201` (loopback only), freeing TCP 3306
  for the trap. Port 49201 was chosen from the dynamic range on purpose — `3307`
  would read as "MySQL+1" to anyone running `ss` after landing a shell.
- The trap sends a **valid MySQL/MariaDB initial handshake** (protocol 10, version
  string `5.5.5-10.11.14-MariaDB`), so `nmap -sV` believes it's a real server.
- Logs every connection as JSON, survives malformed input (traps must never crash).

## fake_ssh — real-handshake SSH trap (port 2222)
`src/honeynet/fake_ssh.py` — built on **Paramiko**.

Why Paramiko: SSH encrypts everything after the banner. A plain socket can't read
the password. Paramiko performs the genuine crypto handshake, so a real `ssh`
client connects normally — and the server side (the trap) sees the username and
password **in cleartext** inside `check_auth_password()`, logs them, then always
returns `AUTH_FAILED`. It's a dead end that looks exactly like a live OpenSSH host.

- Port 2222 (real sshd stays on 22 for admin), its own RSA host key.
- One thread per connection (the SSH handshake is slow; one stuck client must not
  block the trap).
- Captured fields: `src_ip`, `username`, `password`, event type.

> On a genuine `ssh` connect the client prints the host-key fingerprint — the same
> SHA256 the trap's `ssh-keygen` produced. The key theory checks out in practice.

## The breadcrumb / honeytoken chain
The centerpiece — a planted decoy credential that only an intruder would ever use.

```
1. Vulnerable app "Firewall Siege" leaks its DB:
   GET /admin?key=letmein   (weak auth, V5)  →  dumps the players table
2. Among the rows sits a decoy that looks like a real account:
   username d1_admin  /  password HONNEY2026!
   (token computed with the app's own weak-token formula, so it's indistinguishable)
3. Attacker reuses the creds — credential reuse, exactly what real intruders do:
   ssh d1_admin@10.10.20.10 -p 2222
4. fake_ssh captures the login; Wazuh fires rule 100403 (level 14, MITRE T1078).
```

Zero false positives: the `d1_admin` credential exists **only** in the bait, so any
use of it is, by construction, malicious. The chain is detected end-to-end.

The bridge is intentionally **implicit** (no "ssh here" signpost in the dump) — the
attacker reuses the creds on their own. The target app's code is left untouched so
it stays a clean, reusable vulnerability reference.

## Deployment
Both traps run as systemd services (`src/systemd/`) — autostart, restart on
failure, no terminal dependency. A trap only captures while running, which is the
whole reason they're services, not scripts.

## Future
A **high-interaction** SSH trap (fake shell the attacker can roam) = deploy
**Cowrie** (same Paramiko foundation), not hand-rolled. Planned as a separate stage
so the portfolio shows both a hand-written low-interaction trap (protocol
understanding) and an industrial tool deployment.
