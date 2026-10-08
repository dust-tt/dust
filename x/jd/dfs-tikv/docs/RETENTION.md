# Retention and reclamation: remaining implementation work

[Current clean benchmark](../../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

## Whole-filesystem freshness rework

Open descriptors now follow live generations after expiry; an open alone no longer requires keeping its original content version forever. In-flight reads, delayed replies, retained unlinked identities and replay outcomes still constrain collection. One-second freshness is not a proof that all old objects can be deleted after one second. See [the active contract](CONSISTENCY.md) and [acceptance gates](ACCEPTANCE.md).

## Version lifetime is part of the storage design

DDIA chapters 3 and 7 provide the storage/version vocabulary; chapter 8 supplies the failure model. Immutable versions let readers survive later writes, but require a rule for when old state becomes disposable. Database replication preserves those bytes; it does not decide when the application no longer owes them to a reader, retry or index worker.

Three lifetimes must be coordinated: a reader's snapshot, a writer's right to publish prepared objects, and the recovery window for outcomes and derived events. A collector seeing an unreferenced object has not proved that all three have ended. [Smaller publication roots](ROOT_BOUNDARIES.md) increase the number of live selectors to consider; [TxnKV MVCC](TXNKV_DESIGN.md) does not automatically retain application content for arbitrarily long file opens. The gates below apply to either redesign.

Retention is the remaining long-lived-workload acceptance gap. The current implementation keeps immutable history and abandoned staged objects. Frontend replacement is safe because it discards caches while retaining authoritative state in TiKV; it does not reclaim that state.

This document records the current constraints and the required next work. It does not describe an implemented garbage collector.

## What currently retains data

| Record or object | Current behavior | Required safety condition for reclamation |
|---|---|---|
| Immutable tree objects | Path copying leaves old tree paths behind; failed root CAS attempts can leave uploaded objects. | No current root, active snapshot, or future successful publication may reference a deleted object. |
| Historical manifests and chunks | Old file versions remain keyed in the current logical tree. | Keep every version still promised to a live client, handle, view, or prepared index operation. Removing only unreachable tree paths does not remove these records. |
| Sessions, handles, view pins | Login removes expired session records; associated handle/pin records can remain. | Remove expired or absent-session dependents through a publication that revalidates the session's current state. Active-session counters and authority must remain consistent. |
| Request outcomes and receipts | The request record supplies deduplication and receipt resolution; mutation retries check the request expiry. | Preserve the retry window. Expired resolution must return an explicit expiry result rather than making a removed record look like proof of non-publication. |
| Changes and index events | Retained journal supports mount deltas and index recovery, including index UUID replacement. | Coordinate a journal floor with mount reset behavior, checkpoints, and an explicit index-rebuild source. The current index replacement path depends on retained history. |
| Elasticsearch tombstones | Versioned deleted documents prevent delayed workers from resurrecting files. | A delayed worker from an earlier snapshot must be fenced before a tombstone can disappear. |
| Retained-byte accounting | Filesystem mutations charge staged bytes plus an allowance; other shared control mutations are not fully charged. | Account for physical retention and shared control records without confusing cache size, logical live bytes, and stored immutable bytes. |

Source boundaries: [store snapshots and publication](../src/store.rs), [RawKV object keys and uploads](../src/objects.rs), [content history](../src/engine/content.rs), [sessions and handles](../src/engine.rs), [view pins](../src/engine/views.rs), [outcomes and receipts](../src/engine/mutations.rs), and [index plans/checkpoints](../src/engine/indexing.rs).

## Why a simple sweep is unsafe

`Store::snapshot` captures an immutable root without registering its lifetime in shared storage. `Indexer::prepare` can retain such a snapshot across later mutations. A sweep that marks only current roots could delete data still needed by either reader.

Publication uploads immutable objects before the root CAS. A sweeper can observe an uploaded object while it is unreferenced, then race with a successful publication that begins referencing it. A wall-clock age threshold alone does not fence that publication. Objects are also addressed by namespace-wide content hashes, so a per-tenant sweep must account for references from other tenants.

Current root and snapshot contracts therefore prohibit adding a standalone scan-and-delete loop. A safe change needs a protocol binding object lifetime, snapshot validity, and publication eligibility.

## Implementation sequence and gates

1. **Define snapshot and retry lifetimes explicitly.** Readers must either hold a shared retention pin or use a bounded snapshot lifetime with explicit expiry. A process-local reference count cannot protect against another frontend's collector. Paused and restarted processes must never regain publication rights from expired state.
2. **Reclaim expired logical control records in bounded CAS publications.** Preserve live sessions, active handles, view authority, retry windows, and receipt semantics. Multiple workers must safely cooperate without a designated owner. This step reduces live tree contents but does not reclaim physical immutable history.
3. **Add a fenced physical-reclamation protocol.** One candidate is tenant/object generations: publish a fully copied replacement generation, make old-generation publication impossible, then reclaim retired generations after all valid readers have drained. This remains a design candidate; generation migration, abandoned candidates, bounded streaming, stale writes, and failover must be resolved before implementation. Existing namespace-wide object addresses require an explicit migration strategy.
4. **Bound retained content and journal history.** Define how active handles/views protect historical file versions, how missing mount history triggers a fresh view, and how index replacement reconstructs current state after journal truncation. These changes must preserve current authorization and stale-worker rejection.
5. **Measure steady-state storage.** Run repeated writes, truncation, unlink, abandoned publication, session expiry, and index recovery long enough to demonstrate that reclaimable bytes and records stop accumulating. Include accounting and limits for both file data and control records.

Every step must retain interchangeable writers and recover after worker failure. A collector identity may be a disposable worker lease; it must not become permanent tenant ownership.

## Required failure tests

| Interleaving | Required result |
|---|---|
| Reader captures old root; another frontend commits and collects | The valid reader finishes consistently, or an explicitly expired snapshot fails; never silent mixed versions. |
| Writer uploads; collector retires its objects; writer attempts root CAS | The stale writer cannot publish a root referencing reclaimed data. |
| Collector or compactor dies before/after publishing progress | Another worker resumes or safely repeats work without losing reachable data. |
| Two collectors race with writers | Current roots and protected history remain intact; bounded work and CAS conflicts are observable. |
| Session expires or logs out during handle/pin pruning | Active sessions retain their records; expired authority cannot be restored by stale cleanup or a delayed request. |
| Retry/receipt is used near its retention boundary | Valid retries deduplicate; expired requests fail explicitly; absence is never mistaken for proof of abort. |
| Journal is truncated while an index worker is delayed, then ES is replaced | Recovery uses the defined retained boundary or rebuild path; old workers cannot overwrite newer documents or resurrect tombstones. |
| Empty-cache frontend replaces a failed one during reclamation | Normal serving resumes from shared state without transferring frontend memory or requiring a full-tenant replay. |

These are outstanding verification gates, not passing results. The current [acceptance audit](ACCEPTANCE.md) remains open until the implemented protocol and GCP evidence establish them.
