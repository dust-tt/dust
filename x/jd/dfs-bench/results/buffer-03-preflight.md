# Preflight recovery

The corrected RocksDB daemon exposes both search options. Its first startup attempt encountered a systemd transient unit that had already been garbage-collected after reset-failed. The launcher now accepts only that explicit absent-unit case when stopping. RocksDB was restarted alone; the already-empty FDB and TiKV namespaces were kept. No corpus work or timing barrier occurred before all three frontends became ready.
