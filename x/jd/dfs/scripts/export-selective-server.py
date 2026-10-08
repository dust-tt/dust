#!/usr/bin/env python3
import hashlib
import json
import pathlib
import shutil
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
base = root / 'results/selective'
run = root / 'runtime/grants'
roles = json.loads((run / 'credentials/credentials.json').read_text())
(base / 'credential-roles.json').write_text(json.dumps([{key: value for key, value in role.items() if key != 'token_hash'} for role in roles], indent=2) + '\n')
manifest_bytes = (run / 'corpus/manifest.json').read_bytes()
manifest = json.loads(manifest_bytes)
(base / 'corpus-manifest.json').write_bytes(manifest_bytes)
checks = {}
hashes = []
for name, corpus in [('source', run / 'corpus'), ('nfs', run / 'nfs/corpus')]:
    digest = hashlib.sha256((corpus / 'manifest.json').read_bytes()).hexdigest()
    hashes.append(f'{digest}  {name}/manifest.json')
    assert (corpus / 'manifest.json').read_bytes() == manifest_bytes
    assert len(manifest['paths']) == 10000
    for path, size, expected in zip(manifest['paths'], manifest['sizes'], manifest['sha256'], strict=True):
        content = (corpus / 'docs' / path).read_bytes()
        assert len(content) == size and hashlib.sha256(content).hexdigest() == expected, (name, path)
    checks[name + '_10000_files_match_oracle'] = True
(base / 'corpus-manifests.sha256').write_text('\n'.join(hashes) + '\n')
(base / 'corpus-check.json').write_text(json.dumps(checks, indent=2) + '\n')
shutil.copytree(root / 'results/grants', base / 'setup')
with (base / 'source-final.json').open('w') as output:
    subprocess.run(['python3', 'scripts/fingerprint.py'], cwd=root, stdout=output, check=True)
pid = subprocess.check_output(['systemctl', 'show', 'dfs-grants-server', '-p', 'MainPID', '--value'], text=True).strip()
with (base / 'running-server.sha256').open('w') as output:
    subprocess.run(['sudo', 'sha256sum', f'/proc/{pid}/exe'], stdout=output, check=True)
print(json.dumps(checks))
