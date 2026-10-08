import ast
import json
import os
from pathlib import Path
import re
import socket

root = Path(__file__).resolve().parents[1]
workspace = root.parent
documents = []
for package in ('dfs', 'dfs-tikv', 'dfs-fdb', 'dfs-bench'):
    base = workspace / package
    documents += list(base.glob('*.md'))
    for directory in ('docs', 'design', 'lexical', 'search'):
        documents += list((base / directory).rglob('*.md'))
missing = []
for path in documents:
    text = path.read_text()
    assert text.count('```') % 2 == 0, path
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if '://' in target or target.startswith('#'):
            continue
        if not (path.parent / target.split('#')[0]).exists():
            missing.append({'file': os.path.relpath(path, workspace), 'target': target})
for path in (root / 'scripts').glob('*.py'):
    ast.parse(path.read_text(), filename=str(path))
result = {'host': socket.getfqdn(), 'documents': len(documents), 'missing': missing, 'passed': not missing}
(root / 'results/documentation-check.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
assert not missing
