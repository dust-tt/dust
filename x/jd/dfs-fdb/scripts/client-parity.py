import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

base = Path(__file__).resolve().parents[1]
capture = json.loads((base / 'docs/SMART_CACHE_SOURCE.json').read_text())
rows = []
with tempfile.TemporaryDirectory(prefix='fdb-client-parity-') as temporary:
    for name in ['src/mount.rs', 'src/mount_cache.rs', 'src/mount_files.rs', 'src/mount_publication.rs']:
        original = base.parent / 'dfs-tikv' / name
        raw = hashlib.sha256(original.read_bytes()).hexdigest()
        assert raw == capture['files'][name], name
        path = Path(temporary) / Path(name).name
        shutil.copy(original, path)
        subprocess.run(['/home/dfs/.cargo/bin/rustfmt', '--edition', '2024', str(path)], check=True)
        formatted = hashlib.sha256(path.read_bytes()).hexdigest()
        actual = hashlib.sha256((base / name).read_bytes()).hexdigest()
        assert actual == formatted, name
        rows.append(dict(file=name, captured_sha256=raw, formatted_sha256=formatted, fdb_sha256=actual))
(base / 'results/smart-cache/client-parity.json').write_text(json.dumps(dict(passed=True, transformation='rustfmt --edition 2024 only', modules=rows), indent=2) + '\n')
print('All four client modules match the captured redesign after Rust formatting')
