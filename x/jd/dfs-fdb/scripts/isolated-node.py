import argparse
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('node', choices=['a', 'b', 'f'])
args = parser.parse_args()
base = Path('/home/dfs/dfs-fdb')
config = json.loads((base / 'runtime/deployment.json').read_text())
nodes = {name: config['nodes'][name] for name in ['a', 'b', 'f']}
address = nodes[args.node]
connection = 'dfs_fdb:independent20261006@' + ','.join(ip + ':4550' for ip in nodes.values())
subprocess.run(['bash', str(base / 'scripts/fdb-node.sh'), address, 'us-central1-' + args.node, connection], check=True)
runtime = base / 'runtime/storage'
runtime.mkdir(parents=True, exist_ok=True)
(runtime / 'tikv.toml').write_text('[storage]\nreserve-space = "1GB"\n[storage.block-cache]\ncapacity = "4GB"\n[raftstore]\nsync-log = true\n')

def container(name, memory, volumes, image, arguments):
    found = subprocess.run(['sudo', 'docker', 'inspect', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if found.returncode:
        command = ['sudo', 'docker', 'run', '-d', '--name', name, '--network', 'host', '--memory', memory]
        for volume in volumes:
            command += ['-v', volume]
        subprocess.run([*command, image, *arguments], check=True)
    else:
        subprocess.run(['sudo', 'docker', 'start', name], check=True)

for backend, pd_port, peer_port, store_port, status_port in [('rawkv', 2379, 2380, 20160, 20180), ('txnkv', 2479, 2480, 21160, 21180)]:
    peers = ','.join(f'{backend}-{name}=http://{ip}:{peer_port}' for name, ip in nodes.items())
    pd = ','.join(f'{ip}:{pd_port}' for ip in nodes.values())
    pd_data = runtime / (backend + '-pd')
    store_data = runtime / (backend + '-tikv')
    pd_data.mkdir(exist_ok=True)
    store_data.mkdir(exist_ok=True)
    container(backend + '-pd', '1g', [f'{pd_data}:/data'], 'pingcap/pd:v8.5.3', [
        f'--name={backend}-{args.node}', '--data-dir=/data', f'--client-urls=http://{address}:{pd_port}',
        f'--advertise-client-urls=http://{address}:{pd_port}', f'--peer-urls=http://{address}:{peer_port}',
        f'--advertise-peer-urls=http://{address}:{peer_port}', f'--initial-cluster={peers}'])
    container(backend + '-tikv', '8g', [f'{runtime}/tikv.toml:/config.toml:ro', f'{store_data}:/data'], 'pingcap/tikv:v8.5.3', [
        '--config=/config.toml', f'--addr={address}:{store_port}', f'--advertise-addr={address}:{store_port}',
        f'--status-addr={address}:{status_port}', f'--pd={pd}', '--data-dir=/data'])
if args.node == 'a':
    subprocess.run(['sudo', 'sysctl', '-w', 'vm.max_map_count=262144'], check=True)
    container('dfs-fdb-elasticsearch', '2g', [], 'docker.elastic.co/elasticsearch/elasticsearch:8.19.4', [
        'eswrapper', '-Ediscovery.type=single-node', '-Expack.security.enabled=false', '-Enetwork.host=0.0.0.0',
        '-Ecluster.name=dfs-fdb-independent', '-Enode.name=independent-a'])
