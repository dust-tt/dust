use std::collections::{HashMap, HashSet};

use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{Mutation, UpdateOperation, operation::Operation},
};
use foundationdb::Transaction;
use futures::future::try_join_all;

use super::{Error, ObjectResource};
use crate::storage::{
    self,
    resources::{directory::DirectoryResource, file::FileResource, session::SessionResource},
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
     * @cc [owner:spolu,label:backend] object-apply-final-attributes
     * Successful mutation attributes MUST reflect the final transaction state after all operations.
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
        let mut results: Vec<_> = results.into_iter().flatten().collect();
        // Resolve attributes after all operations, including children created later in a batch.
        let ids: HashSet<_> = results
            .iter()
            .filter_map(|result| result.as_ref().ok())
            .flat_map(|mutation| mutation.object.iter().chain(&mutation.related))
            .filter_map(|attr| match attr.id {
                ObjectRef::Object(id) => Some(id),
                _ => None,
            })
            .collect();
        let ids: Vec<_> = ids.into_iter().collect();
        let mut attrs = HashMap::new();
        for (object, mode) in Self::modes_for_session(tx, session, &ids)
            .await?
            .into_iter()
            .flatten()
        {
            attrs.insert(object.object_id, object.attr(tx, mode).await?);
        }
        for mutation in results.iter_mut().filter_map(|result| result.as_mut().ok()) {
            let final_attr = |attr: &dfs_protocol::rpc::Attr| match attr.id {
                ObjectRef::Object(id) => attrs.get(&id).cloned(),
                _ => None,
            };
            mutation.object = mutation.object.as_ref().and_then(final_attr);
            mutation.related = mutation.related.iter().filter_map(final_attr).collect();
        }
        Ok(results)
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

    pub async fn apply_update(
        _tx: &Transaction,
        _session: &SessionResource,
        _operation: UpdateOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Err(Error::UnsupportedOperation.into())
    }

    /**
     * @cc [owner:spolu,label:backend;security] apply-operation-targets
     * Create MUST target its parent and proposed object. Remove MUST target its object and parent.
     * Update and Write MUST target their object. Move MUST target its object, source parent, and
     * optional destination parent. Each target MUST appear only once.
     */
    pub fn targets_for_operation(operation: &Operation) -> Vec<ObjectId> {
        // These are grouping targets available from the request. Move replacements still require
        // stored state when validating mutations.
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
     * Batches MUST be the connected components of operation target overlap, including indirect
     * overlaps. Every operation MUST be moved into exactly one batch, unchanged and without
     * cloning its payload. Each batch MUST contain operations with their original indexes in
     * request order and the unique union of its targets. Batches MUST follow their first
     * operation's order.
     */
    pub fn group_by_targets(operations: Vec<Operation>) -> Vec<ApplyGroup> {
        // Index both directions of the operation/target graph. For n operations with at most three
        // targets each, indexing takes expected O(n) time; all grouping bookkeeping uses O(n) memory.
        let targets_by_operation: Vec<_> =
            operations.iter().map(Self::targets_for_operation).collect();
        let mut operations_by_target = HashMap::<ObjectId, Vec<usize>>::new();
        for (index, targets) in targets_by_operation.iter().enumerate() {
            for target in targets {
                operations_by_target.entry(*target).or_default().push(index);
            }
        }

        // Follow shared targets transitively to form the smallest disjoint batches. Each operation
        // and target's neighbor list is visited once, giving expected O(n) traversal time.
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
