# Preflight failure

No phase barrier was released and no timed extraction ran. The driver passed `--read-concurrency` to the distributed mount binaries, which do not expose that CLI option. RocksDB reached the readiness barrier; the coordinator stopped it and all mounts detached cleanly. The corrected harness uses the distributed implementations' existing eight-read defaults. The next iteration uses fresh namespaces on all three systems.
