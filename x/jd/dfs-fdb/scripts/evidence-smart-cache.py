import hashlib
import json
from pathlib import Path
import subprocess
import time

base = Path(__file__).resolve().parents[1]
comparands = json.loads((base / 'docs/SMART_CACHE_COMPARANDS.json').read_text())
evidence = dict(time_ms=int(time.time() * 1000), source_sha256={}, binaries_sha256={}, comparands={}, rustc=subprocess.check_output(['/home/dfs/.cargo/bin/rustc', '-Vv'], text=True))
for directory in ['src', 'tests', 'proto', 'search', 'scripts', 'benchmarks']:
    for path in (base / directory).rglob('*'):
        if path.is_file() and '__pycache__' not in path.parts and not path.name.startswith('._'):
            evidence['source_sha256'][str(path.relative_to(base))] = hashlib.sha256(path.read_bytes()).hexdigest()
for name in ['Cargo.toml', 'Cargo.lock', 'build.rs', 'CONTRACTS']:
    evidence['source_sha256'][name] = hashlib.sha256((base / name).read_bytes()).hexdigest()
for name in ['dfsd-fdb', 'dfs-mount-fdb', 'dfs-router', 'dfs-ha-probe']:
    evidence['binaries_sha256'][name] = hashlib.sha256((base / 'target/release' / name).read_bytes()).hexdigest()
for package, names in [('dfs', ['dfsd', 'dfsctl', 'dfs-mount-live']), ('dfs-tikv', ['dfsd-tikv', 'dfs-mount-tikv'])]:
    directory = base.parent / package
    for name, digest in comparands['packages'][package].items():
        assert hashlib.sha256((directory / name).read_bytes()).hexdigest() == digest, (package, name)
    evidence['comparands'][package] = dict(source_sha256=comparands['packages'][package], binaries_sha256={name: hashlib.sha256((directory / 'target/release' / name).read_bytes()).hexdigest() for name in names})
for name, digest in json.loads((base / 'proto/compatibility.json').read_text()).items():
    assert hashlib.sha256((base / name).read_bytes()).hexdigest() == digest, name
evidence['wire_fingerprints_match'] = True
evidence['foundationdb_library_sha256'] = hashlib.sha256((base / 'runtime/fdb/bin/libfdb_c.so').read_bytes()).hexdigest()
(base / 'results/smart-cache/source.json').write_text(json.dumps(evidence, indent=2) + '\n')
