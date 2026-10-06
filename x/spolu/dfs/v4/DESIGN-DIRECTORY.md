# Directory contention — follow-up proposal

No storage change is implemented here. The current directory record combines authority and mutable
membership metadata: sibling creates all read and replace it. Local scheduling reduces retries, but
does not remove the cross-server conflict. Keep independent transactions and the existing API.

## Proposed storage split

For directories only, separate:

| Keys | Contents | Sibling create behavior |
| --- | --- | --- |
| Authority record | ID, kind, parent/name, mode, MIME, xattrs, atime | Conflict-tracked read; no write |
| Revision, mtime, ctime | Separate scalar keys | Blind replacement with this transaction's token/time |
| Child name index | Existing `(parent, name) → ID` | Conflict-tracked absence read, then insert |
| Grants | Existing forward/reverse indexes | Fresh conflict-tracked authorization |

Creation still atomically writes the child, its blocks, the name index, and the parent's revision and
times. Distinct names can commit concurrently. Directory authority reads must not consume membership
revision/time keys. Keep the file layout unchanged. Every directory mutation must update its revision.

This is a proposed application of FDB's documented conflict rules: blind writes do not add read
conflicts; reads used for decisions still must. It does not relax transaction isolation.
[FoundationDB developer guide](https://apple.github.io/foundationdb/developer-guide.html#conflict-ranges).

`stat` and directory pages assemble all fields from one FDB snapshot. Membership changes supply their
own revision/mtime/ctime in the response. Other metadata operations may read those keys with conflicts
to preserve fields and return coherent canonical state; occasional conflicts there are acceptable.
Never copy stale times into an unrelated update. Explicit timestamp writes retain their existing
semantics; do not introduce monotonic-time assumptions across servers.

## Required race arguments and tests before adoption

| Race | Required dependency/result |
| --- | --- |
| Sibling creates, distinct names | Share authority reads but no authority writes; both names survive. |
| Same name or UUID | Both track absence of the same index/object key; only one commits. |
| Create versus parent removal | Create reads parent existence; removal reads the entire empty child range. Either ordering preserves reachability. |
| Create versus directory move | Create tracks the directory's actual parent chain; move writes that link. A stale chain conflicts and authorization is reevaluated. |
| Opposing moves / replacement | Retain source/destination bindings, ancestry cycle checks and replacement emptiness dependencies in one transaction. |
| Grant revocation | Reads of the selected grant and every actual parent edge remain conflict-tracked. A later conflicting commit cannot use the old proof. |
| Parent attributes versus membership | Attribute writes retain fresh field-preservation checks; membership writes never replace the authority record. |
| Listing versus concurrent membership | Page contents and revision come from one snapshot; existing pagination and client TTL rules remain unchanged. |

These arguments are not completed validation. Before changing the layout, add deterministic two-server
tests for both commit orders, including missing/expired hints, nested moves, grant changes, and lost
replies. Benchmark the same deep untar and one/many-parent diagnostics again. No exclusive writer,
cross-file transaction batching, or API/client change is needed by this proposal.
