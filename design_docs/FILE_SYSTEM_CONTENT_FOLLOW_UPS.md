# File system content follow-ups

The content namespace PR owns the safe write path and the durable cleanup rows.
The following work is intentionally left for later PRs.

## Blob cleanup worker

The worker must claim a small batch in a short database transaction, release the
transaction before calling GCS, then finish the row in a second transaction. A
failed delete must set a later retry time with capped backoff so one bad object
cannot block newer work. Workspace selection must use a cursor or a global claim
query rather than always starting with the lowest workspace ID.

Add the database index used by the final claim query. If claims remain scoped by
workspace, the expected index is `(workspaceId, notBefore, id)`. Tests must cover
failed deletes, retries, fair progress, and a commit racing with cleanup.

## Exact object versions

Store the committed GCS generation, and consider storing the checksum returned by
GCS. Signed reads can then name the exact object version instead of relying only
on the create-only blob key.

When the cleanup worker is added, close the small gap where a signed read can be
created from an old node snapshot just before that old blob is deleted.

## API limits and types

Add a workspace limit for prepared but uncommitted uploads. The per-file byte
limit already prevents one signed upload from being unbounded; this second limit
will bound the number of abandoned uploads.

Replace the optional `FileSystemOperationResponse` fields with a response type per
operation before more operations are added. This will let callers read the result
without checking fields that cannot be absent for that operation.
