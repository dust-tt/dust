import hashlib
import json
from pathlib import Path
import subprocess
import time

root = Path(__file__).resolve().parents[1]
paths = [p for directory in ['src', 'tests', 'proto', 'search', 'scripts', 'benchmarks'] for p in (root / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
paths += [root / name for name in ['Cargo.toml', 'Cargo.lock', 'build.rs', 'CONTRACTS']]
evidence = dict(time_ms=int(time.time() * 1000), source_sha256={str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)},
                binaries_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (root / 'target/release').iterdir() if p.is_file() and p.name in ['dfsd-fdb', 'dfs-mount-fdb', 'dfs-router', 'dfs-ha-probe']},
                foundationdb_library_sha256=hashlib.sha256((root / 'runtime/fdb/bin/libfdb_c.so').read_bytes()).hexdigest(),
                rustc=subprocess.check_output(['/home/dfs/.cargo/bin/rustc', '--version'], text=True).strip())
for name, digest in json.loads((root / 'proto/compatibility.json').read_text()).items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
evidence['wire_fingerprints_match'] = True
latest = json.loads((root / 'docs/LATEST_TIKV_SOURCE.json').read_text())
for name, digest in latest['source_sha256'].items():
    assert hashlib.sha256((root.parent / 'dfs-tikv' / name).read_bytes()).hexdigest() == digest, name
evidence['latest_tikv_source_matches'] = True
evidence['latest_tikv_binaries_sha256'] = {name: hashlib.sha256((root.parent / 'dfs-tikv/target/release' / name).read_bytes()).hexdigest() for name in ['dfsd-tikv', 'dfs-mount-tikv']}
(root / 'results/source.json').write_text(json.dumps(evidence, indent=2) + '\n')
