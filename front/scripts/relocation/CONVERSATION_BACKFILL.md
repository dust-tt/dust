# Conversation data-source backfill

Launch one coordinator to recover conversation sources deferred by #32794. It uses the existing source/destination relocation queues, existing bucket, and existing per-source relocation workflow. There are no Terraform, IAM, queue, database-schema, or deployment-topology changes. Both cells' existing relocation workers must deploy this code before launch.

## Launch

From the source-cell prodbox, in `/dust/front` (Creative Force example):

```bash
TEMPORAL_CERT_PATH=/etc/certs/temporal.crt \
TEMPORAL_CERT_KEY_PATH=/etc/certs/temporal.pem \
TEMPORAL_RELOCATION_NAMESPACE=dust-relocation.gmnlm \
npx tsx scripts/relocation/backfill_conversation_data_sources.ts \
  --workspaceId CwtDr6OsD6 \
  --sourceCell cell-00000 \
  --destCell cell-00001 \
  --concurrency 5 \
  --execute
```

Omit `--execute` to validate launch arguments and print the plan without starting any workflow. This does not validate the manifest inventory, source rows, destination rows, or prior executions. The running coordinator performs those checks before starting each group. Concurrency must be an integer from 1 to 20; default 5. The launcher exits after starting the coordinator, not after the backfill completes.

Workflow ID: `workspaceBackfillConversationDataSourcesWorkflow-CwtDr6OsD6`.

Progress query in Temporal: `conversationBackfillProgress`. It reports the frozen inventory ID/count, current batch/offset, and completed source count. On successful completion, `completed === inventory.sourceCount`. Counts include sources whose existing executions were already completed and passed the destination check.

## Work selection and execution

- Read all JSON manifests in the source cell's existing relocation bucket under `relocations/<workspaceId>/core/skipped_conversation_data_sources/`, across run directories. No conversation/source ID list is supplied by hand.
- Validate workspace/cell and every source's original Core IDs/conversation ID. Deduplicate identical entries; fail closed on conflicting duplicates, missing/empty manifests, or malformed entries. Limit input to 10,000 manifest objects of at most 100 sources each.
- Freeze the sorted inventory into 100-source objects under `relocations/<workspaceId>/core/conversation_data_source_backfill/<inventory-run-id>/`. Original manifests are not modified or deleted. No full 80k-source payload is placed in Temporal history.
- For each bounded group, validate current source rows against that inventory, inspect existing execution status, and verify workspace/conversation identity and Core IDs in the destination.
- Start existing `workspaceRelocateDataSourceCoreWorkflow-<workspaceId>-<numeric-source-id>` executions with `REJECT_DUPLICATE`, or attach to running/completed executions. This also recognizes previous launches using `relocate_data_source.ts` or the normal workspace relocation.
- Poll with durable Temporal timers and wait for the whole group to complete and pass destination verification before advancing. Continue-as-new preserves the frozen inventory, exact cursor, and counters, including during long polling.

Per-source executions are intentionally external workflows, not children: they survive coordinator continue-as-new/failure and can be reattached after a lost activity response. Starting them is idempotent by workflow ID, but the existing per-source copy itself is still non-idempotent.

## Preconditions and remaining risks

Preserve the source database/Core content, original manifests, and frozen inventory until the recovery has been verified. Ensure the relocation bucket's retention policy will cover the entire operation. Do not run source purge, another full workspace relocation, or independent backfill launchers concurrently. Keep old source connectors paused.

Coordinate a quiet window for affected historical conversations. The existing per-source workflow switches the destination front row's Core IDs BEFORE copying its documents, folders, tables, and table files. This change does not alter that ordering, add content merging, or make the underlying copy safe for concurrent customer writes. Destination validation is not a lock against other writers.

A completed execution plus changed destination IDs is accepted as recovered. Changed IDs alone, missing/deleted/mismatched source or destination rows, or failed/cancelled/timed-out executions are NOT treated as success. The coordinator stops for human reconciliation instead of replaying the copy or silently skipping inventory entries. Temporal history retention can therefore turn an old migrated source into a safe blocker rather than risk duplicate creation.

## Recovery and cancellation

On a transient activity error, Temporal retries. A lost start response attaches to the existing source workflow instead of launching another. Non-retryable safety failures and per-source failed executions stop the coordinator with the source/workflow ID in the error.

Repair/reset the existing per-source execution with an engineer if appropriate, then rerun the same launcher after the prior coordinator is no longer running. `ALLOW_DUPLICATE_FAILED_ONLY` allows retrying a failed coordinator, rejects concurrent coordinators, and prevents accidental replay after successful completion. A fresh coordinator rebuilds the inventory and rechecks earlier sources; completed executions are not restarted. Normal continue-as-new uses the frozen inventory and exact checkpoint instead.

Cancelling/terminating the coordinator DOES NOT cancel or roll back per-source executions that have already started. Inspect/drain those executions before changing concurrency or doing manual recovery. Do not blindly reset/restart a source workflow: it can create another Core project and repoint an already-migrated destination.

## Final verification

Inspect coordinator success, resolve every blocked source, and sample legacy attachment retrieval and table queries in the destination. Keep the recovery records. Successful orchestration verifies completion and destination IDs, not a byte-for-byte content comparison or customer-visible indexing readiness. Only then authorize source cleanup (Creative Force: dust-tt/tasks#10514).
