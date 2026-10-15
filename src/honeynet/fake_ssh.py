import socket
import threading
import json
import os
import paramiko
from datetime import datetime, timezone

HOST = "0.0.0.0"
PORT = 2222
HOST_KEY = paramiko.RSAKey(filename="/home/webadmin/honeynet/honey_host_key")
SSH_BANNER = "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1"

LOG_DIR = "/var/log/honeynet"
LOG_FILE = os.path.join(LOG_DIR, "fake_ssh.log")
os.makedirs(LOG_DIR, exist_ok=True)


def log_event(event: dict):
    event["timestamp"] = datetime.now(timezone.utc).isoformat()
    event["honeypot"] = "fake_ssh"
    line = json.dumps(event)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")
    print(line)


class HoneySSHServer(paramiko.ServerInterface):
    def __init__(self, client_ip):
        self.client_ip = client_ip

    def check_auth_password(self, username, password):
        log_event({
            "event": "login_attempt",
            "src_ip": self.client_ip,
            "username": username,
            "password": password,
            "dst_port": PORT,
        })
        return paramiko.AUTH_FAILED

    def get_allowed_auths(self, username):
        return "password"

    def check_channel_request(self, kind, chanid):
        return paramiko.OPEN_SUCCEEDED


def handle_connection(client_sock, client_ip):
    try:
        transport = paramiko.Transport(client_sock)
        transport.add_server_key(HOST_KEY)
        transport.local_version = SSH_BANNER
        server = HoneySSHServer(client_ip)
        transport.start_server(server=server)
        chan = transport.accept(20)
        if chan is not None:
            chan.close()
        transport.close()
    except Exception:
        pass
    finally:
        try:
            client_sock.close()
        except Exception:
            pass


def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((HOST, PORT))
    sock.listen(100)
    print(f"[*] fake-ssh honeypot listening on {HOST}:{PORT}")
    while True:
        client_sock, addr = sock.accept()
        log_event({"event": "connection", "src_ip": addr[0], "src_port": addr[1], "dst_port": PORT})
        t = threading.Thread(target=handle_connection, args=(client_sock, addr[0]), daemon=True)
        t.start()


if __name__ == "__main__":
    main()
