import argparse
import json
import pathlib
import signal
import socket
import time

parser = argparse.ArgumentParser()
parser.add_argument('--phase-file', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--interval', type=float, default=.1)
parser.add_argument('--units', nargs='+', default=['dfs-scale-source', 'dfs-scale-lance'])
args = parser.parse_args()
assert socket.gethostname().split('.')[0] == 'dfs-tantivy-jd-20261002-server'
assert args.interval >= .1
running = True


def stop(*_):
    global running
    running = False


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)


def fields(path, colon=False):
    values = {}
    for line in path.read_text().splitlines():
        parts = line.replace(':', '').split()
        if len(parts) >= 2 and parts[1].isdigit():
            values[parts[0]] = int(parts[1]) * (1024 if colon and len(parts) > 2 and parts[2] == 'kB' else 1)
    return values


def service(unit, full):
    group = pathlib.Path('/sys/fs/cgroup/system.slice') / (unit + '.service')
    if not group.exists():
        return None
    value = {'cgroup': str(group), 'memory_current_bytes': int((group / 'memory.current').read_text()), 'memory_peak_bytes': int((group / 'memory.peak').read_text()), 'memory_max': (group / 'memory.max').read_text().strip(), 'memory_stat': fields(group / 'memory.stat'), 'memory_events': fields(group / 'memory.events'), 'cpu_stat': fields(group / 'cpu.stat')}
    if full:
        value['processes'] = []
        for pid in (group / 'cgroup.procs').read_text().split():
            p = pathlib.Path('/proc') / pid
            try:
                value['processes'].append({'pid': int(pid), 'status': fields(p / 'status', True), 'smaps': fields(p / 'smaps_rollup', True), 'io': fields(p / 'io')})
            except (FileNotFoundError, ProcessLookupError):
                pass
    return value


args.output.parent.mkdir(parents=True, exist_ok=True)
iteration = 0
with args.output.open('x') as output:
    while running:
        started = time.monotonic()
        try:
            phase = args.phase_file.read_text().strip()
            row = {'time_ns': time.time_ns(), 'monotonic': started, 'phase': phase, 'units': {unit: service(unit, iteration % 5 == 0) for unit in args.units}}
            if iteration % 5 == 0:
                row['host_memory'] = fields(pathlib.Path('/proc/meminfo'), True)
            output.write(json.dumps(row, separators=(',', ':')) + '\n')
            output.flush()
        except FileNotFoundError:
            pass
        iteration += 1
        time.sleep(max(0, args.interval - (time.monotonic() - started)))
