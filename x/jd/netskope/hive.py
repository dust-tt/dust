import argparse
import base64
import hashlib
import json
import os
import signal
import socket
import subprocess
import time
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[2]
ENV_NAME = ROOT.name
STATE = Path.home() / ".dust-hive" / "envs" / ENV_NAME / "netskope"
PORTS = json.loads((STATE.parent / "ports.json").read_text())
PROXY_PORT = PORTS["base"] + 80
PROFILES = {
    "pass": {"NS_BUFFER": "0", "NS_STRIP_HEADERS": "0"},
    "full": {},
    "chunk": {"NS_BUFFER_BYTES": "16384"},
    "idle": {"NS_BUFFER": "0", "NS_IDLE_KILL": "10"},
    "latency": {"NS_BUFFER": "0", "NS_LATENCY_MS": "4000"},
    "deny": {"NS_BUFFER": "0", "NS_BLOCK_SSE": "1"},
    "websocket": {"NS_BUFFER": "0", "NS_BLOCK_WS": "1"},
    "h1": {"NS_BUFFER": "0", "NS_STRIP_HEADERS": "0", "NS_HTTP2": "0"},
}
DEFAULTS = {
    "NS_BUFFER": "1",
    "NS_BUFFER_BYTES": "0",
    "NS_IDLE_KILL": "0",
    "NS_LATENCY_MS": "0",
    "NS_STRIP_HEADERS": "1",
    "NS_CORRUPT_ENCODING": "0",
    "NS_BLOCK_SSE": "0",
    "NS_BLOCK_WS": "0",
    "NS_HTTP2": "1",
}


def setup():
    STATE.mkdir(parents=True, exist_ok=True)
    python = STATE / "venv/bin/python"
    if not python.exists():
        subprocess.run(
            ["uv", "venv", "--python", "3.12", str(STATE / "venv")], check=True
        )
    subprocess.run(
        ["uv", "pip", "install", "--python", str(python), "mitmproxy==12.2.3"],
        check=True,
    )


def proxy_running():
    pid_file = STATE / "proxy.pid"
    if not pid_file.exists():
        return False
    pid = int(pid_file.read_text())
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "command="],
        capture_output=True,
        text=True,
        check=False,
    )
    return str(STATE / "venv/bin/mitmdump") in result.stdout


def stop():
    if proxy_running():
        pid = int((STATE / "proxy.pid").read_text())
        os.kill(pid, signal.SIGTERM)
        for _ in range(50):
            if not proxy_running():
                break
            time.sleep(0.1)
    (STATE / "proxy.pid").unlink(missing_ok=True)


def start(profile):
    binary = STATE / "venv/bin/mitmdump"
    if not binary.exists():
        setup()
    stop()
    config = DEFAULTS | PROFILES[profile]
    config.update({key: os.environ[key] for key in DEFAULTS if key in os.environ})
    config["NS_HIVE_BASE_PORT"] = str(PORTS["base"])
    command = [
        str(binary),
        "-s",
        str(TOOLS / "buffering_proxy.py"),
        "--listen-host",
        "127.0.0.1",
        "--listen-port",
        str(PROXY_PORT),
        "--set",
        f"confdir={STATE / 'ca'}",
        "--set",
        "connection_strategy=lazy",
        "--set",
        "upstream_cert=false",
        "--set",
        "flow_detail=0",
        "--set",
        "http2=" + ("true" if config["NS_HTTP2"] == "1" else "false"),
        "--allow-hosts",
        r"^(localhost|127\.0\.0\.1|\[?::1\]?):\d+$",
    ]
    with (STATE / "proxy.log").open("a") as log:
        process = subprocess.Popen(
            command,
            env=os.environ | config,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    (STATE / "proxy.pid").write_text(str(process.pid))
    (STATE / "profile.json").write_text(
        json.dumps({"profile": profile, "config": config}, indent=2) + "\n"
    )
    for _ in range(100):
        if process.poll() is not None:
            raise SystemExit(f"Proxy failed; see {STATE / 'proxy.log'}")
        try:
            with socket.create_connection(("127.0.0.1", PROXY_PORT), timeout=0.1):
                status()
                return
        except OSError:
            time.sleep(0.1)
    raise SystemExit(f"Proxy did not become ready; see {STATE / 'proxy.log'}")


def browser():
    if not proxy_running():
        raise SystemExit("Start the proxy first: python3 x/jd/netskope/hive.py start full")
    pem = STATE / "ca/mitmproxy-ca-cert.pem"
    public_key = subprocess.run(
        ["openssl", "x509", "-in", str(pem), "-pubkey", "-noout"],
        check=True,
        capture_output=True,
    ).stdout
    der = subprocess.run(
        ["openssl", "pkey", "-pubin", "-outform", "DER"],
        input=public_key,
        check=True,
        capture_output=True,
    ).stdout
    fingerprint = base64.b64encode(hashlib.sha256(der).digest()).decode()
    command = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        f"--user-data-dir={STATE / 'chrome'}",
        f"--proxy-server=http://127.0.0.1:{PROXY_PORT}",
        "--proxy-bypass-list=<-loopback>",
        "--disable-quic",
        f"--ignore-certificate-errors-spki-list={fingerprint}",
        f"--remote-debugging-port={PORTS['base'] + 81}",
        "--no-first-run",
        "--no-default-browser-check",
        "http://localhost:3011/",
    ]
    with (STATE / "chrome.log").open("a") as log:
        subprocess.Popen(command, stdout=log, stderr=log, start_new_session=True)
    print("Opened dedicated Netskope simulation Chrome at http://localhost:3011/")


def status():
    print(
        f"Hive: {ENV_NAME}; proxy: 127.0.0.1:{PROXY_PORT}; running: {proxy_running()}"
    )
    if (STATE / "profile.json").exists():
        print((STATE / "profile.json").read_text().strip())
    print(f"Log: {STATE / 'proxy.log'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command", choices=["setup", "start", "browser", "status", "stop"]
    )
    parser.add_argument("profile", nargs="?", choices=PROFILES, default="full")
    args = parser.parse_args()
    if args.command == "start":
        start(args.profile)
    else:
        {"setup": setup, "browser": browser, "status": status, "stop": stop}[
            args.command
        ]()
