#!/usr/bin/env python3
import argparse
import cProfile
import pathlib
import pstats
import shutil
import sys
import time

root = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'vendor'))
from benchmark import Benchmark

parser = argparse.ArgumentParser()
parser.add_argument('corpus', type=pathlib.Path)
args = parser.parse_args()
benchmark = Benchmark(args.corpus.resolve(), 1, shutil.which('rg'))
benchmark.metadata()
profile = cProfile.Profile()
started = time.perf_counter()
sizes, directories = profile.runcall(benchmark.metadata)
assert sizes == benchmark.expected_sizes and directories == 100
print(f'Profiled elapsed seconds: {time.perf_counter() - started:.6f}')
pstats.Stats(profile).strip_dirs().sort_stats('cumulative').print_stats(25)
