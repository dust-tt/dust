use std::collections::HashMap;

use dfs_protocol::{ObjectId, rpc::operation::Operation};

use super::ObjectResource;

#[cfg(test)]
#[path = "../../../../tests/resources/object/apply.rs"]
mod tests;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct ApplyBatch {
    pub operation_indexes: Vec<usize>,
    pub targets: Vec<ObjectId>,
}

impl ObjectResource {
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
     * overlaps. Every operation MUST appear exactly once. Each batch MUST contain its original
     * operation indexes in request order and the unique union of its targets. Batches MUST follow
     * their first operation's order. Grouping MUST NOT change the input operations or their order.
     */
    pub fn group_by_targets(operations: &[Operation]) -> Vec<ApplyBatch> {
        let targets_by_operation: Vec<_> =
            operations.iter().map(Self::targets_for_operation).collect();
        let mut operations_by_target = HashMap::<ObjectId, Vec<usize>>::new();
        for (index, targets) in targets_by_operation.iter().enumerate() {
            for target in targets {
                operations_by_target.entry(*target).or_default().push(index);
            }
        }

        let mut visited = vec![false; operations.len()];
        let mut batches = Vec::new();
        for start in 0..operations.len() {
            if visited[start] {
                continue;
            }
            visited[start] = true;
            let mut pending = vec![start];
            let mut batch = ApplyBatch::default();
            while let Some(index) = pending.pop() {
                batch.operation_indexes.push(index);
                for target in &targets_by_operation[index] {
                    // Removing each target's neighbors visits them only once, even if many
                    // operations share that target.
                    if let Some(neighbors) = operations_by_target.remove(target) {
                        batch.targets.push(*target);
                        for neighbor in neighbors {
                            if !visited[neighbor] {
                                visited[neighbor] = true;
                                pending.push(neighbor);
                            }
                        }
                    }
                }
            }
            batch.operation_indexes.sort_unstable();
            batch.targets.sort_unstable();
            batches.push(batch);
        }
        batches
    }
}
