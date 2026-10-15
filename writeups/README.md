# TryHackMe Writeups

Penetration-testing walkthroughs — recon → enumeration → exploitation → privilege
escalation, each mapped to the techniques used. Written as study notes and a
practical portfolio of offensive work alongside the defensive SOC lab.

> Flags are redacted (`THM{REDACTED}`) per TryHackMe's sharing policy. The focus
> is the methodology, not the answers.

| Room | Difficulty | Key techniques |
|---|---|---|
| [Simple CTF](simple-ctf/) | Easy | CMS Made Simple SQLi (CVE-2019-9053), hash crack, `sudo vim` privesc |
| [Pyrat](pyrat/) | Easy | Python socket RCE, git-leaked creds, login brute force → root |
| [Billing](billing/) | Easy | MagnusBilling unauth RCE (CVE-2023-30258), `fail2ban-client` privesc |
| [Silver Platter](silver-platter/) | Easy | Silverpeas auth brute (Hydra), lateral movement |
| [Lookup](lookup/) | Easy/Med | Login brute, vhost enum, elFinder command injection |
| [Checkmate](checkmate/) | Med | Multi-service Flask enum, cross-site credential derivation |
| [Grep](grep/) | Med | Recon, exposed git / leaked API key (in progress) |

## Method (applies to every box)
1. **Recon** — full TCP scan: `nmap -sC -sV -p- -oN scan.nmap <ip>`
2. **Enumerate** — web dirs/vhosts (`gobuster`, `ffuf`), service versions, `searchsploit`
3. **Foothold** — exploit a known CVE or misconfig to get a shell
4. **Privilege escalation** — `sudo -l`, SUID (`find / -perm -4000`), GTFOBins
5. **Loot & lessons** — capture flags, note the root cause and the fix

See also [../docs/](../docs/) for the defensive side — how these same techniques
are detected in a Wazuh SIEM.
