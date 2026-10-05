#!/usr/bin/env python3
"""Two mounts of one tenant. For each mutation made through A, B polls continuously; no poll that
starts more than MAX_DELAY after the mutation was acknowledged may observe the old state. Also
checks that a revoked reader loses access within MAX_DELAY, and that every read returns a whole
state the writer produced (never a mix of two)."""
import os
from pathlib import Path
import sys
import tempfile
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
from harness import MAX_DELAY_MS, Stack  # noqa: E402

MAX = MAX_DELAY_MS / 1000
WARM = 0.3
# Every content of d/f the writer produces, in order.
STATES = {b'one', b'two!', b'two!+3', b'tw', 'EACCES'}


def observe(path, how):
    try:
        if how == 'content':
            with open(path, 'rb') as f:
                return f.read()
        if how == 'exists':
            return os.path.lexists(path)
        if how == 'mode':
            return os.stat(path).st_mode & 0o7777
        if how == 'mtime':
            return os.stat(path).st_mtime_ns
        if how == 'listing':
            return tuple(sorted(os.listdir(path)))
    except FileNotFoundError:
        return None
    except PermissionError:
        return 'EACCES'
    raise ValueError(how)


def check(name, path, how, mutate, expect):
    polls = []
    done = threading.Event()

    def poll():
        while not done.is_set():
            started = time.monotonic()
            value = observe(path, how)
            polls.append((started, time.monotonic(), value))
            time.sleep(0.002)

    poller = threading.Thread(target=poll)
    poller.start()
    time.sleep(WARM)
    mutate()
    acked = time.monotonic()
    time.sleep(MAX + 0.3)
    done.set()
    poller.join()
    late = [p for p in polls if p[0] > acked + MAX and p[2] != expect]
    if how == 'content':
        torn = [p[2] for p in polls if p[2] not in STATES]
        if torn:
            print(f'FAIL {name:28} read a state the writer never produced: {torn[0]!r}')
            return False
    seen = next((p[1] - acked for p in polls if p[0] >= acked and p[2] == expect), None)
    status = 'FAIL' if late or seen is None else 'ok'
    print(f'{status:4} {name:28} visible after {seen if seen is None else round(seen * 1000)} ms '
          f'(budget {MAX_DELAY_MS} ms, {len(polls)} polls)', flush=True)
    if late:
        print(f'     late stale observation: {late[0][2]!r} at +{(late[0][0] - acked) * 1000:.0f} ms')
    return status == 'ok'


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-visibility-'))
    stack = Stack(work, port=7404)
    a, b = work / 'a', work / 'b'
    ok = True
    try:
        tokens = stack.provision(['team:write'], ['alice', 'bob'])
        stack.start('visibility')
        stack.admin_op('members', 'team', 'alice', 'bob')
        stack.mount(a, tokens['alice'])
        stack.mount(b, tokens['bob'])
        (a / 'd').mkdir()
        (a / 'd' / 'f').write_bytes(b'one')
        (a / 'd' / 'g').write_bytes(b'gone')
        time.sleep(MAX + 0.1)
        cases = [
            ('create', b / 'd' / 'new', 'exists', lambda: (a / 'd' / 'new').write_bytes(b'x'), True),
            ('overwrite', b / 'd' / 'f', 'content', lambda: (a / 'd' / 'f').write_bytes(b'two!'), b'two!'),
            ('append', b / 'd' / 'f', 'content', lambda: open(a / 'd' / 'f', 'ab').write(b'+3'), b'two!+3'),
            ('truncate', b / 'd' / 'f', 'content', lambda: os.truncate(a / 'd' / 'f', 2), b'tw'),
            ('chmod', b / 'd' / 'f', 'mode', lambda: os.chmod(a / 'd' / 'f', 0o600), 0o600),
            ('utime', b / 'd' / 'f', 'mtime', lambda: os.utime(a / 'd' / 'f', ns=(10**18, 10**18)), 10**18),
            ('rename (old name)', b / 'd' / 'g', 'exists', lambda: os.rename(a / 'd' / 'g', a / 'd' / 'h'), False),
            ('unlink', b / 'd' / 'h', 'exists', lambda: os.unlink(a / 'd' / 'h'), False),
            ('mkdir (listing)', b / 'd', 'listing', lambda: (a / 'd' / 'e').mkdir(), ('e', 'f', 'new')),
            ('rmdir (listing)', b / 'd', 'listing', lambda: (a / 'd' / 'e').rmdir(), ('f', 'new')),
        ]
        for case in cases:
            ok &= check(*case)
        ino = os.stat(a / 'd').st_ino
        ok &= check('revoke read', b / 'd' / 'f', 'content',
                    lambda: (stack.admin_op('boundary', str(ino)), stack.admin_op('grant', str(ino), 'alice', 'write'),
                             stack.admin_op('members', 'team', 'alice')), 'EACCES')
        totals = {path.name: stack.unmount(path) for path in [a, b]}
        for mount, row in totals.items():
            commit = row['commit']
            print(f"mount {mount}: dropped {commit['dropped_ops']}, missed windows {commit['missed_windows']}, "
                  f"max lag {commit['max_lag_ms']:.1f} ms")
            ok &= commit['dropped_ops'] == 0 and commit['missed_windows'] == 0
    finally:
        stack.stop()
        stack.wipe()
    print('visibility ok' if ok else 'visibility FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
