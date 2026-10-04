#!/usr/bin/env python3
"""Keep one dfs-server alive while the host restarts its databases during writes."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import time

spec = importlib.util.spec_from_file_location('v2_support', Path(__file__).with_name('support.py'))
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('work', type=Path)
    args = parser.parse_args()
    work = args.work
    work.mkdir(mode=0o700)
    prefix, key, path = support.identity(work)
    process, endpoint = support.start(work, 'restarts', prefix, path)
    success = False
    try:
        workspace = support.rpc(endpoint, key, 'create-workspace', {'workspace_id': 'restarts', 'root_grants': ['owner']})
        session = support.session(endpoint, workspace, ['owner'])
        file = support.rpc(endpoint, session['session_key'], 'create', {
            'parent_id': workspace['root_id'], 'expected_parent_version': 1, 'name': 'atomic', 'mode': 420})['object']
        def rpc(method, body):
            return support.rpc(endpoint, session['session_key'], method, body)
        version = file['version']
        acks, failures = [], 0
        deadline = time.monotonic() + 90
        for sequence in range(1, 101):
            try:
                value = rpc('write', {'object_id': file['id'], 'expected_version': version,
                    'data': [sequence] * (2 * 65536 + 17)})['object']
                assert value['version'] != version
                version = value['version']
                acks.append({'sequence': sequence, 'version': version})
                (work / 'acks.json').write_text(json.dumps(acks))
            except subprocess.CalledProcessError:
                failures += 1
                while True:
                    assert time.monotonic() < deadline, 'server did not reconnect after database restart'
                    try:
                        version = rpc('stat', {'object_id': file['id']})['version']
                        break
                    except subprocess.CalledProcessError:
                        time.sleep(.1)
        (work / 'writes.json').write_text(json.dumps({'acknowledged': acks, 'errors': failures}))
        assert len(acks) >= 90
        current = rpc('stat', {'object_id': file['id']})
        read = rpc('read', {'object_id': current['id'], 'version': current['version'], 'length': 2 * 65536 + 17})
        assert read['version'] == current['version']
        content = bytes(read['data'])
        assert len(content) == 2 * 65536 + 17
        assert acks[-1]['sequence'] <= content[0] <= 100, 'lost acknowledged write'
        assert content == bytes([content[0]]) * len(content), 'mixed metadata/blocks'
        acknowledged = next((ack for ack in acks if ack['sequence'] == content[0]), None)
        if acknowledged is not None:
            assert current['version'] == acknowledged['version'], 'mixed metadata/content identity'
        deadline = time.monotonic() + 90
        while True:
            status = support.rpc(endpoint, workspace['workspace_key'], 'get-index-status', {'workspace_id': 'restarts'})
            if status['pending'] == 0 and not status['backfilling']:
                break
            assert time.monotonic() < deadline, 'indexer did not reconnect after database restart'
            time.sleep(.2)
        hits = rpc('search-files', {'limit': 10})['hits']
        assert len(hits) == 1 and hits[0]['object']['version'] == current['version']
        support.stop(process)
        support.cleanup(prefix)
        success = True
        print(json.dumps({'acknowledged_writes': len(acks), 'interrupted_calls': failures,
                          'final_version': current['version'], 'atomic_content_verified': True}))
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        path.unlink(missing_ok=True)
        if not success:
            print(f'Incomplete fixture retained: {work} ({prefix})', flush=True)


if __name__ == '__main__':
    main()
