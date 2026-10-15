# Checkmate

**Difficulty:** Medium
**Techniques:** multi-service enumeration · cross-site credential derivation (OSINT → password)

## Recon
```bash
nmap -sS -Pn -p- -T4 -A -oN portscan.nmap <ip>
```
Five Flask (Werkzeug) services on one host:
```
22/tcp   ssh
5000/tcp http  "Operation Checkmate"       (a /check + /state puzzle API)
5001/tcp http  "FirewallOS — Sign in"      (firewall.thm:5001)
5002/tcp http  "Engineering Careers"       (jobs.thm:5002)
5003/tcp http  "social.thm — Log in"       (social.thm:5003)
```
Add the vhosts to `/etc/hosts`.

## Enumeration
```bash
gobuster dir -u http://<ip>:5000 -w .../common.txt
#   /state → {"progress":1}   /check (POST) → {"message":"Incorrect ❌"}
gobuster dir -u http://<ip>:5002 -w .../common.txt -x html,txt,js
#   /login  /profile (→ /login)
```
- **5002 (jobs.thm)** — a careers site. Login placeholder username `marco`. Page
  content is full of theme words (*innovation, excellence, security, cloud,
  digital, future*).
- **5003 (social.thm)** — explicit hint: *"Use the details from jobs.thm to
  generate Marco's password."*

## Approach — derive the password from site content
The intended path: harvest the jobs.thm wordlist with CeWL and build Marco's
password from the site's vocabulary, then authenticate as `marco` on social.thm
(and pivot across the linked services). 
```bash
cewl http://jobs.thm:5002 -w jobs.txt
```
The 5000 `/check` endpoint is a progress puzzle gating later steps. *Notes capture
full service enumeration and the credential-derivation strategy; exploitation
chain to be completed.*

## Lessons
- One host, many micro-services → enumerate every port; titles reveal vhosts.
- "Generate the password from site data" is a CeWL/OSINT cue — public text is a
  password source.
- Linked demo apps that share credential logic let one weak account cascade.
