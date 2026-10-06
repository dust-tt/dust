# Directory records

Server-only change, storage format `dfs-v4-fdb-2`. The gRPC API, client and file-record encoding are
unchanged. Directory membership changes no longer rewrite the core used to resolve authority.

## Storage and transactions

All keys remain tenant-scoped:

| Record | Contents | Parent update during create/remove/rename |
| --- | --- | --- |
| Object/core, existing family 1 | ID, kind, parent/name, mode, MIME, xattrs, atime | Conflict-tracked authorization read; no write |
| Directory state, new family 7 | Revision, mtime, ctime in one compact value | Blind replacement with a fresh token/time |
| Child index, existing family 2 | `(parent, name) → ID` | Conflict-tracked uniqueness/existence check and binding edit |
| Grants, existing families 3/4 | Object/grant and grant/object indexes | Fresh conflict-tracked authorization |

One mutable-state value is sufficient: each membership change replaces all three fields together.
The stored directory core has empty revision/mtime/ctime fields; it must never be sent to clients.
`stat`, listings and mutation responses assemble complete metadata in one FDB snapshot. Mutation
responses read each parent's mutable state only after writing it. Directory metadata/grant edits
first read the complete record with conflicts, preserving untouched fields and coherent responses.
Deletion clears both records; files retain their previous single-record representation.

Sibling creates still use separate atomic transactions for child metadata/blocks, the name binding
and parent state. They read the same stable core but do not read each other's mutable-state input.
FDB checks read/write conflicts, so their blind state writes can both commit; the last commit sets
the parent's token/time, while both independent child bindings survive.
[FoundationDB conflict rules](https://apple.github.io/foundationdb/developer-guide.html#conflict-ranges).

Creates now schedule by their **new object ID**, removing the local parent gate. Other mutations
retain target-object scheduling; FDB provides all cross-server coordination. All admission, memory,
request-size and independent-group limits are unchanged.

## Verification

Real-FDB tests pin transactions from two server states before either commit and exercise:

- Independent sibling creates, renames and removals, including canonical parent response reads.
- A file write committing after a sibling create without invalidating its ancestry proof.
- Duplicate names/UUIDs, and an older snapshot retaining matching directory metadata/listing.
- Create versus parent deletion or replacement in both commit orders; no orphaned state survives.
- Parent moves, stale ancestry hints, grant revocation and fresh authorization after moving.
- Attribute preservation and opposing moves/cycle prevention in both commit orders.
- Accepted batch completion after dropping replies; foreign-format rejection without erasing keys.

The local database can be reset for this PoC, as authorized. There is no migration: opening an old
format fails cleanly. Benchmark results are recorded in [bench/RESULTS.md](bench/RESULTS.md); the
networked/multi-node performance evaluation remains separate work.
