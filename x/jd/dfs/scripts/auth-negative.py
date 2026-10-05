#!/usr/bin/env python3
import json
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
scratch = root / 'runtime'
result = {}
with tempfile.TemporaryDirectory(dir=scratch) as directory:
    directory = pathlib.Path(directory)
    invalid = directory / 'invalid.token'
    invalid.write_text('invalid-experiment-token')
    common = [str(root / 'target/release/dfsctl'), '--endpoint', 'https://10.128.0.4:7443']
    bad_token = subprocess.run(common + ['--ca', str(scratch / 'network/server.crt'), '--token-file', str(invalid), 'metrics'], capture_output=True, text=True, timeout=25)
    assert bad_token.returncode != 0 and '13: credential rejected' in bad_token.stderr, bad_token.stderr
    result['invalid_token'] = {'rejected': True, 'error': bad_token.stderr.strip()}
    certificate = directory / 'untrusted.crt'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', str(directory / 'untrusted.key'), '-out', str(certificate), '-subj', '/CN=untrusted-test'], check=True, capture_output=True)
    bad_ca = subprocess.run(common + ['--ca', str(certificate), '--token-file', str(scratch / 'network/admin.token'), 'metrics'], capture_output=True, text=True, timeout=25)
    assert bad_ca.returncode != 0 and 'UnknownIssuer' in bad_ca.stderr, bad_ca.stderr
    result['untrusted_ca'] = {'rejected': True, 'error': bad_ca.stderr.strip()}
print(json.dumps(result, indent=2))
