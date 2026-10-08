#!/usr/bin/env python3
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
r = root / 'results'
report = root / 'RESULTS.md'
s = report.read_text()
load = lambda name: json.loads((r / name).read_text())
idle = load('network-final/visibility-idle.json')
busy = load('network-final/visibility-busy.json')
probe_idle = load('network-final/probe-idle.json')
probe_busy = load('network-final/probe-busy.json')
noisy = load('network-final/busy-tenant.json')
summary = load('summary.json')['network-final/client-resources.jsonl']
processes = list(summary['processes'].values())
ms = lambda value: f'{value/1000:.2f}'
metric = lambda data, field: f"{ms(data[field]['p50'])} / {ms(data[field]['p99'])} ms"
block = '''## Separate-VM visibility, contention, and cache behavior

The storage VM has eight vCPUs; the separate client VM has four. Both are in `us-central1-a`, using persistent TLS connections over private IP and independent authenticated mount sessions. Two mounts run on the client. Each visibility trial publishes an 8-byte value through `pwrite` + `fsync`, then polls the other mount every 0.5 ms. Send-to-observation includes publication and polling, so it is a conservative upper bound on commit-to-visible latency without assuming synchronized cross-host clocks. Ack-to-observation is reported separately. Ten fresh API byte checks pass in each 1,000-sample trial.

| Metric | Idle | Eight competing writers in another tenant |
| --- | ---: | ---: |
'''
for field, label in [('send_to_visible_us','Send-to-visible p50 / p99'),('ack_to_visible_us','Ack-to-visible p50 / p99')]:
    block += f'| {label} | {metric(idle,field)} | {metric(busy,field)} |\n'
block += f"| Maximum send-to-visible | {ms(idle['send_to_visible_us']['max'])} ms | {ms(busy['send_to_visible_us']['max'])} ms |\n"
block += f"| Upper-bound samples over 100 ms | {idle['visibility_upper_bound_over_100ms']} / 1,000 | {busy['visibility_upper_bound_over_100ms']} / 1,000 |\n"
block += f"| Independent 4 KiB API probe p50 / p99 | {probe_idle['publication_p50_us']/1000:.3f} / {probe_idle['publication_p99_us']/1000:.3f} ms | {probe_busy['publication_p50_us']/1000:.3f} / {probe_busy['publication_p99_us']/1000:.3f} ms |\n\n"
block += f"""[Idle visibility](results/network-final/visibility-idle.json), [loaded visibility](results/network-final/visibility-busy.json), [idle API probe](results/network-final/probe-idle.json), [loaded API probe](results/network-final/probe-busy.json). Both visibility p99s meet the experimental 100 ms target; the maximum does not. The other tenant performs 24,000 random 64 KiB writes across eight workers in {noisy['elapsed_seconds']:.2f} s: {noisy['throughput_per_second']:.0f}/s, p50 {ms(noisy['publication_p50_us'])} ms, p99 {ms(noisy['publication_p99_us'])} ms, zero errors. The probe's p99 degrades {probe_busy['publication_p99_us']/probe_idle['publication_p99_us']:.1f}×. It is paced by 2 ms only during the loaded case, so its throughput is not a controlled throughput ratio. [Busy-tenant samples](results/network-final/busy-tenant.json) preserve timings for overlap analysis. Publication contention dominates the loaded visibility increase; delivery after acknowledgment remains under 3 ms at p99.

Client-side samples observed a persistence age of **{summary['max_persistence_age_ms']} ms** despite the 100 ms timer, a {summary['max_pending_bytes']/1e6:.2f} MB pending-byte peak, and {summary['max_pending_compaction_bytes']/1e6:.0f} MB of estimated compaction debt. Thus the timer is not an RPO bound, and this is a workload with compaction interference rather than an empty-engine microbenchmark. [Resource samples](results/network-final/client-resources.jsonl) contain timestamps, heads, debt, and process CPU/RAM. The two mount RSS peaks were {processes[0]['max_rss_bytes']/1e6:.1f} MB and {processes[1]['max_rss_bytes']/1e6:.1f} MB; CPU consumption over {summary['span_seconds']:.1f} s was {processes[0]['cpu_seconds']:.1f} and {processes[1]['cpu_seconds']:.2f} CPU-seconds respectively, with the first mount running the read benchmark. These totals include combined phases, not CPU attribution to one syscall. Sampling is every 200 ms and can miss peaks.

"""
def timing(filename, prefix, phase):
    for line in (r / 'network-final' / filename).read_text().splitlines():
        cells = [cell.strip() for cell in line.split('|')]
        if len(cells)==7 and cells[2].startswith(prefix) and cells[3]==phase:
            return float(cells[4].replace(',',''))
    raise ValueError((filename,prefix,phase))
block += f"""Warm separate-VM reads again add zero per-file RPCs. Open/fstat/close takes {timing('dfs-warm.txt','open + fstat','warm'):,.2f} ms versus {timing('client-baseline.txt','open + fstat','warm'):,.2f} ms on the same client's local filesystem; no-match search takes {timing('dfs-warm.txt','rg no-match','warm'):,.2f} versus {timing('client-baseline.txt','rg no-match','warm'):,.2f} ms. [DFS warm suite](results/network-final/dfs-warm.txt), [same-client baseline](results/network-final/client-baseline.txt), [RPC evidence](results/network-final/readonly-rpcs.json).

"""
cold = load('network-final/cold-after.json')
prep = json.loads((r/'network-final/cold.log').read_text().splitlines()[0])['fields']['preparation_ms']
block += f"""The controlled **client-content-cold / server-warm** run disables initial prefetch and starts with zero cached content, while retaining the authorized metadata snapshot. Preparation takes {prep} ms. Its first document no-match scan takes {timing('dfs-client-cold.txt','rg no-match','first'):,.0f} ms, then {timing('dfs-client-cold.txt','rg no-match','warm'):,.0f} ms warm. Directory-local miss packs are bounded to 16 ranges / 1 MiB; the entire suite, including write verification, issues {cold['counters']['data_calls']:,} data calls. Full initial prefetch uses 628 packs for this corpus but pays about four seconds before mounting. This is evidence of the startup/first-access tradeoff, not a pure batching A/B comparison. The server's page/block caches are warm, and earlier metadata phases have run; only the first document-content scan is labeled cold. [Cold timings](results/network-final/dfs-client-cold.txt), [empty-cache counter](results/network-final/cold-before.json), [final counter](results/network-final/cold-after.json), [preparation log](results/network-final/cold.log).

"""
a=s.index('## Separate-VM visibility');b=s.index('## Correctness and Unix compatibility',a)
s=s[:a]+block+s[b:]
report.write_text(s)
