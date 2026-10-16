use std::collections::HashMap;

use dfs_protocol::{ObjectId, rpc::operation::Operation};

use super::ObjectResource;

#[cfg(test)]
#[path = "../../../../tests/resources/object/apply.rs"]
mod tests;

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
     * overlaps. Every operation MUST be moved into exactly one batch, unchanged and without
     * cloning its payload. Each batch MUST contain operations in request order and the unique
     * union of its targets. Batches MUST follow their first operation's order.
     */
    pub fn group_by_targets(operations: Vec<Operation>) -> Vec<(Vec<Operation>, Vec<ObjectId>)> {
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
            // Sort each batch's targets: O(n log n) overall, the only superlinear step.
            targets.sort_unstable();
            batches.push((Vec::new(), targets));
        }

        // Move operations in request order so each batch preserves it without cloning payloads.
        // This final pass is O(n).
        for (operation, batch_index) in operations.into_iter().zip(batch_indexes) {
            batches[batch_index].0.push(operation);
        }
        batches
    }
}
