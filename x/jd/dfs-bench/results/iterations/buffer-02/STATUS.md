# Preflight failure

No timing barrier was released. The RocksDB daemon was packaged from a default-feature test build, omitting `lexical-search`, and rejected `--search-listen`. FDB/TiKV started empty namespaces successfully. All six binary hashes and NVMe paths matched their package, but this did not validate required features. The next attempt rebuilds RocksDB with `--features lexical-search` and uses fresh namespaces for all three.
