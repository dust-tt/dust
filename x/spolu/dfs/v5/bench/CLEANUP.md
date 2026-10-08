# Recursive cleanup investigation

The original GCP supplemental run (`extended-20261007-a`) failed while recursively removing a
5,000-entry directory. The final `rmdir` returned `ENOTEMPTY`, and the client reported 4,357 deferred
`Unavailable` errors. Repeating removal in the same mount returned `EIO` for affected files.

## Cause

Deletion was acknowledged into the local overlay before the client had secured dispatch capacity.
Two refresh paths could then block those accepted edits: listing stabilization paused the directory
while awaiting a new listing, and refreshing a parent's attributes paused its independent children.
The client also admitted up to 4,096 groups behind just 128 in-flight group slots and 16 RPC streams.
Slow or saturated requests could therefore exhaust the 200 ms dispatch deadline before submission.

Expired groups were failed rather than silently dispatched late. Their deletion overlays were
removed, leaving files in FDB, while their errors remained attached to the affected client objects.
That explains both the nonempty parent and the repeated `EIO` on the same mount. A fresh client
successfully read a file that the user's original mount could no longer access. No mutation was
automatically replayed to obtain that recovery.

## Change

- After a listing race, dispatch and await the directory's captured edits before requesting another
  snapshot. Hold the directory gate against new local namespace edits without pausing dispatch.
- Limit metadata-refresh dispatch pauses to primary/replaced objects. Membership-only parent
  refreshes no longer block their independent children.
- Share the 128-group limit between queued and in-flight work. Reserve an RPC envelope before
  acknowledging each new group; when ready groups share a batch, retain one envelope and return the
  extra reservations. Capacity waits now precede acknowledgment. When every envelope is reserved,
  dispatch eligible groups without waiting for the coalescing timer; dependency and refresh
  constraints still apply.
- Record dispatch-deadline failures separately from RPC failures, including whether a refresh or
  dependency still blocked the group when it expired.

The client still uses a 512 MiB accounted cap, 200 ms maximum write buffering, 800 ms cache validity,
25 ms coalescing and at most 16 RPC envelopes. Server transaction and tombstone semantics are unchanged.
An already failed client retains its deferred errors; a fresh mount reloads authoritative FDB state.

## Validation

The real-FDB delayed-listing regression fails on the old code with two expired, already acknowledged
unlinks when the retry response is held for 300 ms. It passes after the fix. Admission regressions
also stall two group slots and all sixteen independent RPC streams beyond the 200 ms window, checking
that the next unlink waits before acknowledgment and does not expire or replay an inline callback.

`tests/recursive_remove.py` seeds 5,000 durable 16 KiB files in one directory and verifies every
payload through gRPC before each removal. It runs GNU `rm -rf` and Python `shutil.rmtree` separately,
fsyncs the surviving parent, verifies emptiness through an independent RPC client, and checks drain,
memory, writeback-error and inline-replay metrics. These are focused correctness workloads, not jd's
unchanged benchmark.

| Local method | Files | Removal (s) | Remaining durable drain (s) | Accounted peak (MiB) | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| GNU rm -rf | 5,000 | 24.340 | 0.014 | 123.43 | Passed |
| Python shutil.rmtree | 5,000 | 24.333 | 0.015 | 123.57 | Passed |

Both local cases finished with zero dispatch expirations, deferred writeback errors or inline waits
after effects. Rust workspace tests, real-FDB contracts, strict clippy and the unprivileged mounted
suite passed. The measured local FUSE binary SHA-256 is
`036a81bf77252d82c3b76b78addaf3b5762954a9fbbd707feb125d8be42c8279`.
The local raw report is `/tmp/dfs-v5-cleanup-final-20261007-e/run.json` in `dfs-v4-dev-1`.

Before the coalescing-pressure adjustment, the safety fix also passed on GCP: GNU `rm -rf` took 96.587 s plus 0.010 s
remaining drain, and `shutil.rmtree` took 98.238 s plus 0.009 s drain. Both removed and verified all
5,000 files with zero dispatch expirations or writeback errors. The raw report is
`/var/log/dfs-bench/v5/cleanup-20261007-c/run.json`; the driver exited successfully and restored all
prior interactive service states.

The first full local rerun (`local-full-20261007-c`) exposed a batching regression despite passing
all 24 checks: untar increased from 7.320 s to 22.149 s. Reserving envelopes before acknowledgment
left only 16 queued groups waiting for the 25 ms coalescing timer. Bypassing that timer when all
reservations are occupied brought a focused untar rerun down to 6.335 s. The complete rerun of this
final scheduling change is recorded in [local benchmark results](RESULTS.md). These measurements
retain the original 200 ms deadline and 800 ms cache validity.
