#!/usr/bin/env python3
"""Restart FDB/ES during acknowledged gRPC writes while keeping dfs-server alive."""
import pathlib
import subprocess
import time
import uuid

COMPOSE = ['docker', 'compose', '-f', str(pathlib.Path(__file__).with_name('compose.yaml'))]


def main():
    work = '/tmp/dfs-v2-restart-' + uuid.uuid4().hex
    command = [*COMPOSE, 'exec', '-T', 'dev', 'python3', '/dfs/v2/tests/restart_fixture.py']
    writer = subprocess.Popen([*command, work])
    deadline = time.monotonic() + 20
    while True:
        result = subprocess.run([*COMPOSE, 'exec', '-T', 'dev', 'test', '-f', work + '/acks.json'])
        if result.returncode == 0:
            break
        assert writer.poll() is None, 'writer failed before restart'
        assert time.monotonic() < deadline, 'writer did not begin'
        time.sleep(.1)
    subprocess.run([*COMPOSE, 'restart', 'fdb', 'es'], check=True)
    assert writer.wait(timeout=120) == 0, 'writer failed'
    print('PASS: acknowledged FDB writes survive database restarts; live dfs-server reconnects.')


if __name__ == '__main__':
    main()
