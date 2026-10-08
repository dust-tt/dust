#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--uid', type=int, required=True)
parser.add_argument('--gid', type=int, required=True)
parser.add_argument('--groups', default='6100')
args = parser.parse_args()
os.setgroups([int(value) for value in args.groups.split(',') if value])
os.setgid(args.gid)
os.setuid(args.uid)
handles = {}
mappings = {}


def perform(request):
    operation = request['op']
    if operation == 'read':
        with open(request['path'], 'rb') as file:
            data = file.read()
        return {'allowed': True, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    if operation == 'write':
        with open(request['path'], 'r+b', buffering=0) as file:
            os.pwrite(file.fileno(), b'g', 0)
            os.fsync(file.fileno())
        return {'allowed': True}
    if operation == 'list':
        return {'allowed': True, 'names': sorted(os.listdir(request['path']))}
    if operation == 'hold':
        handles[request['id']] = os.open(request['path'], os.O_RDONLY)
        data = os.pread(handles[request['id']], 4096, 0)
        return {'allowed': True, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    if operation == 'held_read':
        data = os.pread(handles[request['id']], 4096, 0)
        return {'allowed': True, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    if operation == 'close':
        os.close(handles.pop(request['id']))
        return {'allowed': True}
    if operation == 'map':
        child = subprocess.Popen([sys.executable, '-c', 'import mmap,sys; f=open(sys.argv[1],"rb"); m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ); assert m[0]==103; print("ready",flush=True); sys.stdin.readline(); print(m[0],flush=True)', request['path']], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        assert child.stdout.readline().strip() == 'ready'
        mappings[request['id']] = child
        return {'allowed': True}
    if operation == 'mapped_read':
        child = mappings.pop(request['id'])
        output, error = child.communicate('\n', timeout=10)
        return {'allowed': child.returncode == 0, 'returncode': child.returncode, 'output': output.strip(), 'error': error.strip()}
    if operation == 'identity':
        return {'uid': os.getuid(), 'gid': os.getgid(), 'groups': os.getgroups()}
    raise ValueError(operation)


def attempt(request):
    try:
        return perform(request)
    except OSError as error:
        return {'allowed': False, 'errno': error.errno}


for line in sys.stdin:
    request = json.loads(line)
    started_ns = time.monotonic_ns()
    if request['op'] == 'watch':
        deadline_ns = started_ns + int(request.get('timeout_seconds', 65) * 1e9)
        polls = 0
        while True:
            answer = attempt({'op': request.get('probe', 'read'), 'path': request['path']})
            polls += 1
            if answer['allowed'] == request['allowed']:
                if request['allowed']:
                    if request.get('probe', 'read') == 'read':
                        assert answer['sha256'] == request['sha256']
                else:
                    assert answer['errno'] in (1, 2, 13), answer
                break
            if time.monotonic_ns() >= deadline_ns:
                answer['timeout'] = True
                break
            time.sleep(0.005)
        answer['polls'] = polls
    else:
        answer = attempt(request)
    answer['elapsed_ms'] = (time.monotonic_ns() - started_ns) / 1e6
    if 'ack_ns' in request:
        answer['after_ack_ms'] = (time.monotonic_ns() - request['ack_ns']) / 1e6
    print(json.dumps(answer), flush=True)

for fd in handles.values():
    os.close(fd)
for child in mappings.values():
    child.kill()
    child.wait()
