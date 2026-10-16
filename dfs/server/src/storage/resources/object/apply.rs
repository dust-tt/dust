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
     * Each target MUST map to the original indexes of all operations targeting it, in request
     * order. Repeated operations MUST retain separate indexes; an operation MUST appear at most
     * once per target. Grouping MUST NOT change the input operations or their order.
     */
    pub fn group_by_targets(operations: &[Operation]) -> HashMap<ObjectId, Vec<usize>> {
        let mut groups = HashMap::<ObjectId, Vec<usize>>::new();
        for (index, operation) in operations.iter().enumerate() {
            for target in Self::targets_for_operation(operation) {
                groups.entry(target).or_default().push(index);
            }
        }
        groups
    }
}
