# Transactional publication and validation

The implemented v1 adapter publishes direct records in TiKV transactions. Invariants require current authority, original file/directory preconditions, receipts and indexing events to agree at publication. Transaction conflicts trigger revalidation; a stale same-file request is not silently rebased.

Shared tenant state and ordered-journal dependencies remain in the transaction footprint. This is distributed storage with optimistic writers, but it does not demonstrate independent same-tenant publication scaling. [Implemented layout](TXNKV_IMPLEMENTATION.md), [partitioned v2 design](TXNKV_DESIGN.md), [root examples](ROOT_BOUNDARIES.md).

[Storage tests](../tests/txn_storage.rs) exercise the actual adapter, and [engine tests](../tests/engine.rs) exercise filesystem preconditions and authority. [Acceptance criteria](ACCEPTANCE.md) define broader obligations. The clean benchmark records only its own observed validation; older run outputs were removed.
