#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import struct
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('mount_a', type=pathlib.Path)
parser.add_argument('mount_b', type=pathlib.Path)
parser.add_argument('--samples', type=int, default=1000)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--bin', type=pathlib.Path)
parser.add_argument('--token-file', type=pathlib.Path)
parser.add_argument('--endpoint', default='http://127.0.0.1:7443')
parser.add_argument('--ca', type=pathlib.Path)
args = parser.parse_args()
name = 'visibility-' + str(time.time_ns())
a = args.mount_a / 'files' / name
b = args.mount_b / 'files' / name
a.write_bytes(b'\0' * 8)
deadline = time.monotonic() + 10
while not b.exists():
    if time.monotonic() > deadline:
        raise RuntimeError('initial visibility timeout')
    time.sleep(0.005)
command = None
node_id = None
if args.bin and args.token_file:
    command = [str(args.bin / 'dfsctl'), '--endpoint', args.endpoint, '--token-file', str(args.token_file)]
    if args.ca:
        command += ['--ca', str(args.ca)]
    view = json.loads(subprocess.check_output(command + ['view']))
    node_id = next(node['node']['id'] for node in view['nodes'] if node['visible_name'] == name)
samples = []
fresh_api_checks = 0
write_fd = os.open(a, os.O_RDWR)
read_fd = os.open(b, os.O_RDONLY)
try:
    for index in range(1, args.samples + 1):
        value = struct.pack('>Q', index)
        started = time.perf_counter_ns()
        assert os.pwrite(write_fd, value, 0) == len(value)
        published = time.perf_counter_ns()
        os.fsync(write_fd)
        deadline = time.monotonic() + 10
        polls = 0
        while os.pread(read_fd, 8, 0) != value:
            polls += 1
            if time.monotonic() > deadline:
                raise RuntimeError('update visibility timeout')
            time.sleep(0.0005)
        visible = time.perf_counter_ns()
        samples.append({'index': index, 'wall_ms': time.time_ns() // 1000000, 'publication_us': (published - started) / 1000, 'ack_to_visible_us': (visible - published) / 1000, 'send_to_visible_us': (visible - started) / 1000, 'polls': polls})
        if command and index % 100 == 0:
            request = args.output.with_suffix('.request.json')
            request.write_text(json.dumps({'Read': {'node': node_id, 'version': None, 'offset': 0, 'size': 8, 'handle': None}}))
            data = json.loads(subprocess.check_output(command + ['call', '--json', str(request)]))['Data']
            assert bytes(data) == value
            request.unlink()
            fresh_api_checks += 1
finally:
    os.close(write_fd)
    os.close(read_fd)


def quantiles(field):
    values = sorted(sample[field] for sample in samples)
    return {'p50': values[(len(values) - 1) // 2], 'p99': values[min(len(values) - 1, int(len(values) * 0.99))], 'max': max(values)}


args.output.write_text(json.dumps({'samples_count': len(samples), 'fresh_api_checks': fresh_api_checks, 'publication_us': quantiles('publication_us'), 'ack_to_visible_us': quantiles('ack_to_visible_us'), 'send_to_visible_us': quantiles('send_to_visible_us'), 'visibility_upper_bound_over_100ms': sum(sample['send_to_visible_us'] > 100000 for sample in samples), 'samples': samples}, indent=2) + '\n')
