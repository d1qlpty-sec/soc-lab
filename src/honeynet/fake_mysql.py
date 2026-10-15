import socket
import json
import os
import struct
from datetime import datetime, timezone

HOST = "0.0.0.0"
PORT = 3306

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
LOG_FILE = os.path.join(LOG_DIR, "fake_mysql.log")
os.makedirs(LOG_DIR, exist_ok=True)

SERVER_VERSION = b"5.5.5-10.11.14-MariaDB"   # what we pretend to be


def log_event(event: dict):
    event["timestamp"] = datetime.now(timezone.utc).isoformat()
    event["honeypot"] = "fake_mysql"
    line = json.dumps(event)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")
    print(line)


def build_greeting() -> bytes:
    """Build a minimal but valid MySQL/MariaDB initial handshake (protocol 10)."""
    payload = b""
    payload += b"\x0a"                       # protocol version = 10
    payload += SERVER_VERSION + b"\x00"      # server version string, NUL-terminated
    payload += struct.pack("<I", 1)          # connection id (4 bytes, little-endian)
    payload += b"\x11\x22\x33\x44\x55\x66\x77\x88"  # auth-plugin-data part 1 (8 bytes)
    payload += b"\x00"                        # filler
    payload += struct.pack("<H", 0xf7ff)     # capability flags (lower 2 bytes)
    payload += b"\x21"                        # character set = utf8_general_ci (0x21)
    payload += struct.pack("<H", 0x0002)     # status flags (AUTOCOMMIT)
    payload += struct.pack("<H", 0x0000)     # capability flags (upper 2 bytes)
    payload += b"\x00"                        # length of auth-plugin-data (0 = none extra)
    payload += b"\x00" * 10                   # reserved (10 bytes of zeros)
    payload += b"\x99\xaa\xbb\xcc\xdd\xee\xff\x00\x11\x22\x33\x44\x00"  # auth-data part 2 + NUL

    # MySQL packet header: 3-byte little-endian length + 1-byte sequence id
    header = struct.pack("<I", len(payload))[:3] + b"\x00"
    return header + payload


sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind((HOST, PORT))
sock.listen(5)
print(f"[*] fake-mysql honeypot listening on {HOST}:{PORT}")

while True:
    conn, addr = sock.accept()
    log_event({"event": "connection", "src_ip": addr[0], "src_port": addr[1], "dst_port": PORT})
    try:
        conn.sendall(build_greeting())        # pretend to be a real server: speak first
        conn.settimeout(5)                    # don't block forever waiting for a reply
        data = conn.recv(1024)                # read what the attacker sends back
        if data:
            log_event({
                "event": "data_received",
                "src_ip": addr[0],
                "dst_port": PORT,
                "bytes": len(data),
                "data_hex": data.hex(),
            })
    except (socket.timeout, ConnectionResetError, BrokenPipeError):
        pass
    finally:
        conn.close()
