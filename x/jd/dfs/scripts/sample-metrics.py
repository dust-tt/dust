#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import signal
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--bin', type=pathlib.Path, required=True)
parser.add_argument('--token-file', type=pathlib.Path, required=True)
parser.add_argument('--endpoint', default='http://127.0.0.1:7443')
parser.add_argument('--ca', type=pathlib.Path)
parser.add_argument('--pids', type=int, nargs='*', default=[])
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--db', type=pathlib.Path)
parser.add_argument('--interval-ms', type=int, default=200)
args = parser.parse_args()
running = True


def stop(_signal, _frame):
    global running
    running = False


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
command = [str(args.bin / 'dfsctl'), '--endpoint', args.endpoint, '--token-file', str(args.token_file)]
if args.ca:
    command += ['--ca', str(args.ca)]
command += ['metrics']
with args.output.open('w') as output:
    while running:
        started = time.monotonic()
        result = subprocess.run(command, capture_output=True, timeout=10)
        record = {'time_ms': time.time_ns() // 1000000, 'query_ms': (time.monotonic() - started) * 1000, 'metrics': json.loads(result.stdout) if result.returncode == 0 else None, 'processes': {}}
        for pid in args.pids:
            try:
                raw = pathlib.Path(f'/proc/{pid}/stat').read_text()
                fields = raw[raw.rfind(')') + 2:].split()
                record['processes'][str(pid)] = {'cpu_seconds': (int(fields[11]) + int(fields[12])) / os.sysconf('SC_CLK_TCK'), 'rss_bytes': int(fields[21]) * os.sysconf('SC_PAGE_SIZE'), 'virtual_bytes': int(fields[20])}
                record['processes'][str(pid)]['io'] = {key: int(value) for key, value in (line.split(':') for line in pathlib.Path(f'/proc/{pid}/io').read_text().splitlines())}
            except FileNotFoundError:
                record['processes'][str(pid)] = None
        if args.db:
            files = []
            skipped = 0
            for path in args.db.glob('*.log'):
                try:
                    files.append(path.stat())
                except FileNotFoundError:
                    skipped += 1
            record['wal_files_rotated_during_sample'] = skipped
            record['wal_bytes'] = sum(stat.st_size for stat in files)
            record['oldest_wal_age_seconds'] = max((time.time() - stat.st_mtime for stat in files), default=0)
            record['disk_free_bytes'] = __import__('shutil').disk_usage(args.db).free
        output.write(json.dumps(record) + '\n')
        output.flush()
        time.sleep(max(0, args.interval_ms / 1000 - (time.monotonic() - started)))
