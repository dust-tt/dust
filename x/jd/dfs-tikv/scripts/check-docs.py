import ast
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import time

parser = argparse.ArgumentParser()
parser.add_argument('--output', default='results/cache-rework/documentation-check.json')
parser.add_argument('--extra-documents', nargs='*', default=[])
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
documents = sorted((root / 'docs').rglob('*.md')) + [(root / path).resolve() for path in args.extra_documents]
missing = []
links = 0
diagrams = 0
for document in documents:
    content = document.read_text()
    assert content.count('```') % 2 == 0, document
    diagrams += content.count('```mermaid')
    for target in re.findall(r'\]\(([^)]+)\)', content):
        if '://' in target or target.startswith('#'):
            continue
        links += 1
        if not (document.parent / target.split('#', 1)[0]).exists():
            missing.append(dict(document=os.path.relpath(document, root), target=target))
for script in [*sorted((root / 'scripts').glob('*.py')), *sorted((root / 'benchmarks').glob('*.py'))]:
    ast.parse(script.read_text(), filename=str(script.relative_to(root)))
result = dict(host=socket.getfqdn(), recorded_ms=int(time.time() * 1000),
              documents=len(documents), local_links=links, mermaid_blocks=diagrams,
              missing_targets=missing,
              sha256={os.path.relpath(p, root): hashlib.sha256(p.read_bytes()).hexdigest() for p in documents})
(root / args.output).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
assert not missing, missing
