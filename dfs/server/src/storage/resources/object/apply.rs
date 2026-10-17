use std::collections::HashMap;

use dfs_protocol::{
    ObjectId,
    rpc::{Mutation, UpdateOperation, operation::Operation},
};
use foundationdb::{Transaction, tuple::pack};
use futures::future::try_join_all;

use super::{Error, Metadata, ObjectResource};
use crate::{
    clock,
    storage::{
        self,
        resources::{directory::DirectoryResource, file::FileResource, session::SessionResource},
    },
};

#[cfg(test)]
#[path = "../../../../tests/resources/object/apply.rs"]
mod tests;

pub type ApplyGroup = (Vec<(usize, Operation)>, Vec<ObjectId>);

impl ObjectResource {
    /**
     * @cc [owner:spolu,label:backend;concurrency] object-apply-batches
     * Apply MUST run disjoint target batches concurrently in the caller's transaction and each
     * batch's operations sequentially.
     */
    /**
     * @cc [owner:spolu,label:backend;error-handling] object-apply-results
     * Results MUST preserve request order and duplicates, with exactly one result per operation.
     * Resource failures MUST become per-operation errors without stopping later operations.
     * Storage failures MUST abort the attempt and preserve FDB errors for retry.
     */
    /**
     * @cc [owner:spolu,label:backend] object-apply-operation-attributes
     * Successful mutation attributes MUST reflect state immediately after their operation. Later
     * operations MUST NOT rewrite earlier results.
     */
    pub async fn apply(
        tx: &Transaction,
        session: &SessionResource,
        operations: Vec<Operation>,
    ) -> Result<Vec<Result<Mutation, Error>>, storage::Error<Error>> {
        let mut results: Vec<_> = (0..operations.len()).map(|_| None).collect();
        let batches = Self::group_by_targets(operations);
        let completed = try_join_all(batches.into_iter().map(
            |(operations, _targets)| async move {
                let mut results = Vec::with_capacity(operations.len());
                for (index, operation) in operations {
                    let result = match Self::apply_operation(tx, session, operation).await {
                        Ok(mutation) => Ok(mutation),
                        Err(storage::Error::Resource(error)) => Err(error),
                        Err(error) => return Err(error),
                    };
                    results.push((index, result));
                }
                Ok(results)
            },
        ))
        .await?;
        // Grouping assigns every original index exactly once, regardless of batch completion order.
        for (index, result) in completed.into_iter().flatten() {
            results[index] = Some(result);
        }
        Ok(results.into_iter().flatten().collect())
    }

    async fn apply_operation(
        tx: &Transaction,
        session: &SessionResource,
        operation: Operation,
    ) -> Result<Mutation, storage::Error<Error>> {
        match operation {
            Operation::Create(operation) => {
                Ok(DirectoryResource::apply_create(tx, session, operation).await?)
            }
            Operation::Update(operation) => Self::apply_update(tx, session, operation).await,
            Operation::Write(operation) => {
                Ok(FileResource::apply_write(tx, session, operation).await?)
            }
            Operation::Move(operation) => {
                Ok(DirectoryResource::apply_move(tx, session, operation).await?)
            }
            Operation::Remove(operation) => {
                Ok(DirectoryResource::apply_remove(tx, session, operation).await?)
            }
        }
    }

    /**
     * @cc [owner:spolu,label:backend;security] object-apply-update-authorization
     * Update MUST evaluate modes in the caller's transaction and require read and write on the
     * object. Missing objects MUST return NotFound; missing either permission MUST return Forbidden
     * before inspecting metadata or kind. All validation MUST finish before staging any writes.
     */
    /**
     * @cc [owner:spolu,label:backend] object-apply-update-patch
     * Unmentioned MIME types and xattrs MUST remain unchanged. Empty MIME types MUST store None.
     * Xattr changes MUST apply in order, preserving empty values and removing keys with absent
     * values. Every change's name, including removals, MUST be valid. The resulting metadata MUST
     * satisfy creation's MIME and xattr limits. Creation time MUST remain unchanged. Size MUST apply
     * only to files. Shrinking MUST discard bytes beyond EOF, and growing MUST expose zeroes.
     */
    /**
     * @cc [owner:spolu,label:backend] object-apply-update-attributes
     * Every successful Update, including an empty patch, MUST advance attr_version once and set
     * ctime. A supplied size MUST also advance content_version once and set mtime, even if unchanged.
     * Explicit atime and mtime MUST take precedence over automatic timestamps. Unspecified atime
     * MUST stay unchanged; unspecified mtime MUST stay unchanged unless size is supplied. Grants
     * and parent attributes MUST remain unchanged. The result MUST contain the object's immediate
     * attributes without metadata and have no related attributes.
     */
    pub async fn apply_update(
        tx: &Transaction,
        session: &SessionResource,
        operation: UpdateOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        // Check permissions and reuse the object fetched during authorization.
        let (mut object, mode) = Self::modes_for_session(tx, session, &[operation.object_id])
            .await?
            .pop()
            .flatten()
            .ok_or(Error::NotFound)?;
        if !mode.can_read() || !mode.can_write() {
            return Err(Error::Forbidden.into());
        }
        object.attr_mode(mode)?;

        // Prepare and validate the full metadata patch before changing stored state.
        let metadata = if operation.mime_type.is_some() || !operation.xattrs.is_empty() {
            object.load_metadata(tx).await?;
            let mut metadata = object.metadata.take().ok_or(Error::MissingMetadata)?;
            if let Some(mime_type) = &operation.mime_type {
                metadata.mime_type = (!mime_type.is_empty()).then(|| mime_type.clone());
            }
            for change in &operation.xattrs {
                Metadata::validate_xattr_name(&change.name)?;
                match &change.value {
                    Some(value) => {
                        metadata.xattrs.insert(change.name.clone(), value.clone());
                    }
                    None => {
                        metadata.xattrs.remove(&change.name);
                    }
                }
            }
            metadata.validate()?;
            Some(metadata)
        } else {
            None
        };
        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;

        // Resize first: reading a partial block can still fail without staging any writes.
        if let Some(size) = operation.size {
            FileResource::try_from(object.clone())
                .map_err(storage::Error::from)?
                .resize_blocks(tx, size)
                .await?;
            object.size = size;
            object.content_version += 1;
            object.mtime_ms = Some(now_ms);
        }
        if let Some(metadata) = metadata {
            if operation.mime_type.is_some() {
                tx.set(
                    &Self::metadata_key(&object.tenant.tenant_id, &object.object_id),
                    &pack(&(metadata.created_at_ms, metadata.mime_type.as_deref())),
                );
            }
            for change in &operation.xattrs {
                let key =
                    Self::xattr_key(&object.tenant.tenant_id, &object.object_id, &change.name);
                match &change.value {
                    Some(value) => tx.set(&key, value),
                    None => tx.clear(&key),
                }
            }
        }
        if let Some(atime_ms) = operation.atime {
            object.atime_ms = Some(atime_ms);
        }
        if let Some(mtime_ms) = operation.mtime {
            object.mtime_ms = Some(mtime_ms);
        }
        object.record_attr_change(tx, now_ms);

        Ok(Mutation {
            object: Some(object.attr(tx, mode).await?),
            related: vec![],
        })
    }

    /**
     * @cc [owner:spolu,label:backend;security] apply-operation-targets
     * Create MUST target its parent and proposed object. Remove MUST target its object and parent.
     * Update and Write MUST target their object. Move MUST target its object, source parent, and
     * optional destination parent. Each target MUST appear only once.
     */
    pub fn targets_for_operation(operation: &Operation) -> Vec<ObjectId> {
        let mut targets = match operation {
            Operation::Create(operation) => vec![operation.parent_id, operation.object_id],
            Operation::Update(operation) => vec![operation.object_id],
            Operation::Write(operation) => vec![operation.object_id],
            Operation::Move(operation) => {
                let mut targets = vec![operation.object_id, operation.parent_id];
                targets.extend(operation.target_id);
                targets
            }
            Operation::Remove(operation) => vec![operation.object_id, operation.parent_id],
        };
        targets.sort_unstable();
        targets.dedup();
        targets
    }

    /**
     * @cc [owner:spolu,label:backend] apply-group-by-targets
     * Batches MUST merge operation target overlaps transitively and merge all batches containing a
     * Move into one batch (critical to prevent cycles). Every operation MUST be moved into exactly
     * one batch, unchanged and without cloning its payload. Each batch MUST contain operations with
     * their original indexes in request order and the unique union of its targets. Batches MUST
     * follow their first operation's order.
     */
    pub fn group_by_targets(operations: Vec<Operation>) -> Vec<ApplyGroup> {
        // Index both directions of the operation/target graph. For n operations with at most three
        // targets each, indexing takes expected O(n) time; all grouping bookkeeping uses O(n) memory.
        let targets_by_operation: Vec<_> =
            operations.iter().map(Self::targets_for_operation).collect();
        let mut moves: Vec<_> = operations
            .iter()
            .enumerate()
            .filter_map(|(index, operation)| {
                matches!(operation, Operation::Move(_)).then_some(index)
            })
            .collect();
        let mut operations_by_target = HashMap::<ObjectId, Vec<usize>>::new();
        for (index, targets) in targets_by_operation.iter().enumerate() {
            for target in targets {
                operations_by_target.entry(*target).or_default().push(index);
            }
        }

        // Follow shared targets and the shared Move group transitively. Each operation and neighbor
        // list is visited once, giving expected O(n) traversal time.
        let mut visited = vec![false; operations.len()];
        let mut batch_indexes = vec![0; operations.len()];
        let mut batches = Vec::new();
        for start in 0..operations.len() {
            if visited[start] {
                continue;
            }
            visited[start] = true;
            let mut pending = vec![start];
            let mut targets = Vec::new();
            while let Some(index) = pending.pop() {
                batch_indexes[index] = batches.len();
                // Disjoint Move targets can still share ancestry and jointly create a cycle.
                if matches!(operations[index], Operation::Move(_)) {
                    for neighbor in std::mem::take(&mut moves) {
                        if !visited[neighbor] {
                            visited[neighbor] = true;
                            pending.push(neighbor);
                        }
                    }
                }
                for target in &targets_by_operation[index] {
                    // Removing each target's neighbors visits them only once, even if many
                    // operations share that target.
                    if let Some(neighbors) = operations_by_target.remove(target) {
                        targets.push(*target);
                        for neighbor in neighbors {
                            if !visited[neighbor] {
                                visited[neighbor] = true;
                                pending.push(neighbor);
                            }
                        }
                    }
                }
            }
            batches.push((Vec::new(), targets));
        }

        // Move operations in request order so each batch preserves it without cloning payloads.
        // This final pass is O(n), so grouping takes expected O(n) time overall.
        for (index, (operation, batch_index)) in
            operations.into_iter().zip(batch_indexes).enumerate()
        {
            batches[batch_index].0.push((index, operation));
        }
        batches
    }
}
