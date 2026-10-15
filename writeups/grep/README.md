# Grep

**Difficulty:** Medium
**Status:** recon / in progress
**Techniques:** service enum · TLS cert OSINT · exposed-git / leaked API key hunt

## Recon
```bash
nmap -sS -sV -p- -oN nmap.scan <ip>
```
```
22/tcp    open  ssh      OpenSSH 8.2p1
80/tcp    open  http     Apache 2.4.41  (default page)
443/tcp   open  ssl/http Apache 2.4.41
51337/tcp open  http     Apache 2.4.41  → 403 Forbidden
```
The TLS certificate on 51337 leaks a hostname:
```bash
curl -vk https://<ip>:51337
#   subject/issuer CN = leakchecker.grep.thm
```
Add `leakchecker.grep.thm` to `/etc/hosts`.

## Enumeration
```bash
gobuster dir -u http://<ip> -w .../common.txt -x js,txt,html
#   index.php, /javascript/ → /jquery/, phpmyadmin (403), server-status (403)
```

## Working theory
The room is about a "leak checker" service. Clues gathered:
- **SuperSecure Corp** — the company (first lead)
- **SearchME** — the site/project name to find
- Objective: *recover a live API key from a git repository* — the hint
  *"Search for API Key in Dumped Repository"* points at an exposed/dumped `.git`.

Next steps: find the SearchME app, dump the exposed git history (git-dumper),
grep the history for the leaked API key, then use it to register/authenticate.

*Write-up in progress — foothold not yet reached in these notes.*

## Lessons
- TLS certificates leak internal hostnames — always inspect `subject`/`issuer`.
- Exposed `.git` directories are a recurring theme: dump and `grep` history for
  secrets (API keys, passwords).
