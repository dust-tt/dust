# Independent mounts and frontends

Mounts share authoritative filesystem identities and revisions through the backend. Each mount has its own bounded metadata and content caches. There is no mount ownership boundary or invalidation stream: the one-second metadata/revision deadline controls when cached observations must be revalidated.

An existing descriptor preserves identity across rename/unlink but selects current content after validation. Concurrent writes keep their original version preconditions. A conflicting winner does not authorize the loser to silently rebase; lost replies use retained request identities and outcomes.

Frontends retain disposable caches. Sessions, pins, receipts and filesystem state are shared, so no frontend is a namespace owner. Shared tenant journal/state still limits publication scaling. [Consistency](CONSISTENCY.md), [operation sequences](MOUNT_OPERATIONS.md), [frontend tests](../tests/frontend.rs).

The [clean benchmark](../../dfs-bench/docs/RESULTS.md) uses one client per independent system. It does not claim concurrent-writer or frontend-failover performance.
