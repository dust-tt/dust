#!/usr/bin/env python3
import argparse
import hmac
import http.server
import json
import os
import pathlib
import ssl
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--run', type=pathlib.Path, required=True)
parser.add_argument('--bin', type=pathlib.Path, required=True)
parser.add_argument('--listen', default='0.0.0.0')
parser.add_argument('--port', type=int, default=7445)
args = parser.parse_args()
run = args.run.resolve()
binary = args.bin.resolve() / 'dfsctl'
control_token = (run / 'control.token').read_text().strip()
principals = json.loads((run / 'principals.json').read_text())


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *values):
        pass

    def do_POST(self):
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + control_token):
            self.send_error(403)
            return
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size <= 4 << 20:
            self.send_error(400)
            return
        request = json.loads(self.rfile.read(size))
        kind = request['kind']
        if kind == 'dfs':
            user = request.get('user', 'admin')
            assert user in principals
            command = request['command']
            assert command in ('view', 'mutate', 'call', 'metrics')
            argv = [str(binary), '--endpoint', 'https://127.0.0.1:7443', '--ca', str(run / 'server.crt'), '--token-file', str(run / 'credentials' / (user + '.token')), command]
            with tempfile.NamedTemporaryFile(mode='w', dir=run, suffix='.json') as payload:
                if 'payload' in request:
                    json.dump(request['payload'], payload)
                    payload.flush()
                    argv += ['--json', payload.name]
                result = subprocess.run(argv, text=True, capture_output=True, timeout=30)
            answer = {'ok': result.returncode == 0, 'value': json.loads(result.stdout) if result.returncode == 0 else None, 'error': result.stderr if result.returncode else None}
        elif kind == 'nfs':
            relative = pathlib.Path(request['path'])
            assert not relative.is_absolute() and '..' not in relative.parts
            path = run / 'nfs' / relative
            operation = request['op']
            if operation == 'create':
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(bytes.fromhex(request['hex']))
                os.chown(path, request['uid'], request['gid'])
                os.chmod(path, request['mode'])
            elif operation == 'chmod':
                os.chmod(path, request['mode'])
            elif operation == 'chown':
                os.chown(path, request['uid'], request['gid'])
            elif operation == 'mkdir':
                path.mkdir(parents=True, exist_ok=True)
                os.chmod(path, request['mode'])
            elif operation == 'rename':
                target = pathlib.Path(request['target'])
                assert not target.is_absolute() and '..' not in target.parts
                path.rename(run / 'nfs' / target)
            elif operation == 'unlink':
                path.unlink()
            else:
                raise ValueError(operation)
            answer = {'ok': True}
        else:
            raise ValueError(kind)
        data = json.dumps(answer).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


server = http.server.HTTPServer((args.listen, args.port), Handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(run / 'server.crt', run / 'server.key')
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
