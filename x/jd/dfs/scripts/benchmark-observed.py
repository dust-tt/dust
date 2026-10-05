#!/usr/bin/env python3
import argparse
import json
import pathlib
import sys
import time

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument('--metrics', type=pathlib.Path, required=True)
parser.add_argument('--observations', type=pathlib.Path, required=True)
parser.add_argument('--demand-filled', action='store_true')
args, remaining = parser.parse_known_args()
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'vendor'))
import benchmark

time.sleep(1.1)
before = json.loads(args.metrics.read_text())


class ObservedBenchmark(benchmark.Benchmark):
    def writes(self):
        time.sleep(1.1)
        after = json.loads(args.metrics.read_text())
        counters = ('data_calls', 'metadata_calls', 'mutation_calls')
        delta = {key: after['counters'][key] - before['counters'][key] for key in counters}
        args.observations.write_text(json.dumps({'before': before, 'after_readonly': after, 'rpc_category_delta': delta, 'content_mode': 'demand-filled' if args.demand_filled else 'resident'}, indent=2) + '\n')
        if delta['mutation_calls'] or (not args.demand_filled and any(delta.values())):
            raise ValueError(f'read-only RPC expectations failed: {delta}, demand_filled={args.demand_filled}')
        return super().writes()


benchmark.Benchmark = ObservedBenchmark
sys.argv = [sys.argv[0]] + remaining
raise SystemExit(benchmark.main())
