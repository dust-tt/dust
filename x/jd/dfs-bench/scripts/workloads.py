import argparse
import json
from pathlib import Path
import shutil
import statistics
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--vendor', type=Path, required=True)
parser.add_argument('--root', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--backend', required=True)
parser.add_argument('--warm-runs', type=int, default=3)
parser.add_argument('--writes-only', action='store_true')
args = parser.parse_args()
sys.path.insert(0, str(args.vendor))
import benchmark

samples = []
log = args.output.with_suffix('.jsonl').open('w', buffering=1)

class RecordedBenchmark(benchmark.Benchmark):
    def measure(self, feature, workload, phase, action, validate, runs=1):
        times_ms = []
        print(json.dumps(dict(event='start', workload=workload, phase=phase, time_ms=int(time.time() * 1000))), file=log)
        for repeat in range(runs):
            started = time.perf_counter_ns()
            result = action()
            elapsed_ms = (time.perf_counter_ns() - started) / 1000000
            validate(result)
            times_ms.append(elapsed_ms)
            print(json.dumps(dict(event='sample', workload=workload, phase=phase, repeat=repeat, elapsed_ms=elapsed_ms, validated=True, time_ms=int(time.time() * 1000))), file=log)
        samples.append(dict(feature=feature, workload=workload, phase=phase, samples_ms=times_ms, median_ms=statistics.median(times_ms)))
        self.rows.append((feature, workload, phase, f'{statistics.median(times_ms):,.2f}', 'OK'))
        args.output.write_text(json.dumps(dict(backend=args.backend, passed=False, rows=samples), indent=2))
        return result

rg = shutil.which('rg')
assert rg, 'ripgrep required'
versions = benchmark.tool_versions(rg)
bench = RecordedBenchmark(args.root, args.warm_runs, rg)
try:
    if args.writes_only:
        bench.writes()
    else:
        bench.run(False)
    assert len(samples) == (4 if args.writes_only else 24)
except BaseException as error:
    print(json.dumps(dict(event='failure', error=repr(error), time_ms=int(time.time() * 1000))), file=log)
    raise
args.output.write_text(json.dumps(dict(backend=args.backend, passed=True, warm_runs=args.warm_runs, versions=versions, rows=samples), indent=2) + '\n')
benchmark.render(bench.rows)
