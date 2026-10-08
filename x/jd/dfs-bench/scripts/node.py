import json
from pathlib import Path
import subprocess
import sys

base = Path('/srv/dfs')
hosts = json.loads((base / 'config/hosts.json').read_text())
role = sys.argv[1]
mode = sys.argv[2]
ips = {name: row['networkInterfaces'][0]['networkIP'] for name, row in hosts.items()}
ip = ips[role]


def run(*args):
    return subprocess.run(list(map(str, args)), check=True)


def service(name, memory, *command):
    run('sudo', 'systemd-run', '--unit', name, '--uid', 'dfs', '--property=MemoryMax=' + memory, '--property=MemorySwapMax=0', '--setenv=LD_LIBRARY_PATH=/srv/dfs/lib', *command)


def container(name, memory, mounts, env, image, *args):
    command = ['sudo', 'docker', 'run', '-d', '--name', name, '--network', 'host', '--memory', memory, '--memory-swap', memory]
    for source, target in mounts:
        command += ['-v', str(source) + ':' + target]
    for value in env:
        command += ['-e', value]
    run(*command, image, *args)


if mode == 'storage':
    if '-es-' in role:
        backend = role.split('-')[0]
        names = [backend + '-es-' + zone for zone in 'abc']
        path = base / 'data/es'
        path.mkdir()
        run('sudo', 'chown', '1000:1000', path)
        container('dfs-es', '8g', [(path, '/usr/share/elasticsearch/data')], ['cluster.name=dfs-clean-' + backend, 'node.name=' + role, 'network.host=' + ip, 'discovery.seed_hosts=' + ','.join(ips[n] + ':9300' for n in names), 'cluster.initial_master_nodes=' + ','.join(names), 'xpack.security.enabled=false', 'ES_JAVA_OPTS=-Xms4g -Xmx4g'], 'docker.elastic.co/elasticsearch/elasticsearch:8.19.4')
    elif role.startswith('tikv-') and not role.endswith('-client'):
        pd = base / 'data/pd'
        kv = base / 'data/tikv'
        pd.mkdir()
        kv.mkdir()
        initial = ','.join('tikv-' + z + '=http://' + ips['tikv-' + z] + ':2380' for z in 'abc')
        container('dfs-pd', '1g', [(pd, '/data')], [], 'pingcap/pd:v8.5.3', '--name=' + role, '--data-dir=/data', '--client-urls=http://' + ip + ':2379', '--advertise-client-urls=http://' + ip + ':2379', '--peer-urls=http://' + ip + ':2380', '--advertise-peer-urls=http://' + ip + ':2380', '--initial-cluster=' + initial)
        config = base / 'config/tikv.toml'
        config.write_text('[storage]\nreserve-space = "1GB"\n[storage.block-cache]\ncapacity = "4GB"\n[raftstore]\nsync-log = true\n')
        container('dfs-tikv', '12g', [(kv, '/data'), (config, '/config.toml:ro')], [], 'pingcap/tikv:v8.5.3', '--config=/config.toml', '--addr=' + ip + ':20160', '--advertise-addr=' + ip + ':20160', '--status-addr=' + ip + ':20180', '--pd=' + ','.join(ips['tikv-' + z] + ':2379' for z in 'abc'), '--data-dir=/data', '--labels=zone=us-east4-' + role[-1])
    elif role.startswith('fdb-') and not role.endswith('-client'):
        path = base / 'data/fdb'
        path.mkdir()
        service('dfs-storage', '16G', base / 'bin/fdbserver', '--cluster-file', base / 'config/fdb.cluster', '--public-address', ip + ':4550', '--listen-address', ip + ':4550', '--datadir', path, '--logdir', base / 'log', '--locality-zoneid', 'us-east4-' + role[-1], '--locality-machineid', ip, '--memory', '12GiB', '--cache-memory', '4GiB')
elif mode == 'frontend':
    backend = 'rocks' if role == 'rocks' else role.split('-')[0]
    args = ['--credentials', base / 'config/credentials.json', '--listen', ip + ':7443', '--tls-cert', base / 'config/server.crt', '--tls-key', base / 'config/server.key', '--search-listen', '127.0.0.1:7446' if backend == 'rocks' else ip + ':7447']
    if backend == 'rocks':
        run('sudo', 'apt-get', 'install', '-y', '-qq', 'nginx')
        run('sudo', 'systemctl', 'disable', '--now', 'nginx')
        config = base / 'config/nginx.conf'
        config.write_text('pid /run/dfs-search-proxy.pid;\nevents { worker_connections 1024; }\nhttp { access_log off; upstream lexical { server 127.0.0.1:7446; keepalive 16; } server { listen ' + ip + ':7447 ssl; ssl_certificate /srv/dfs/config/server.crt; ssl_certificate_key /srv/dfs/config/server.key; location / { proxy_http_version 1.1; proxy_set_header Connection \"\"; proxy_pass http://lexical; } } }\n')
        run('sudo', 'systemd-run', '--unit', 'dfs-search-proxy', '--property=MemoryMax=256M', '/usr/sbin/nginx', '-c', config, '-g', 'daemon off;')
        args += ['--db', base / 'data/rocksdb', '--search-index', base / 'data/tantivy', '--search-token-file', base / 'config/admin.token']
    else:
        args += ['--namespace', 'clean-20261006', '--cache-bytes', str(64 << 20), '--elasticsearch', ','.join('http://' + ips[backend + '-es-' + z] + ':9200' for z in 'abc'), '--index-tokens', base / 'config/admin.token']
        if backend == 'tikv':
            args += ['--pd', ','.join(ips['tikv-' + z] + ':2379' for z in 'abc')]
        else:
            args += ['--cluster-file', base / 'config/fdb.cluster']
    service('dfs-frontend', '4G', base / ('bin/dfsd-' + backend), *args)
else:
    raise ValueError(mode)
