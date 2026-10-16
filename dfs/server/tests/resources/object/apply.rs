use dfs_protocol::rpc::{
    CreateOperation, MoveOperation, RemoveOperation, UpdateOperation, WriteOperation,
};

use super::*;

#[test]
fn operation_targets_include_all_affected_objects_once() {
    let parent = ObjectId::new_v7();
    let file = ObjectId::new_v7();
    let other = ObjectId::new_v7();
    let destination = ObjectId::new_v7();
    let operations = vec![
        Operation::Create(CreateOperation {
            parent_id: parent,
            object_id: file,
            name: "file".to_owned(),
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: file,
            data: b"first".to_vec(),
            ..Default::default()
        }),
        Operation::Update(UpdateOperation {
            object_id: parent,
            ..Default::default()
        }),
        Operation::Move(MoveOperation {
            object_id: file,
            parent_id: parent,
            target_id: Some(destination),
            name: "renamed".to_owned(),
            ..Default::default()
        }),
        Operation::Remove(RemoveOperation {
            object_id: file,
            parent_id: destination,
            ..Default::default()
        }),
        Operation::Create(CreateOperation {
            parent_id: destination,
            object_id: other,
            name: "other".to_owned(),
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: file,
            data: b"first".to_vec(),
            ..Default::default()
        }),
        Operation::Move(MoveOperation {
            object_id: destination,
            parent_id: parent,
            target_id: Some(destination),
            name: "invalid-self-move".to_owned(),
            ..Default::default()
        }),
        Operation::Create(CreateOperation {
            parent_id: parent,
            object_id: parent,
            name: "invalid-self-create".to_owned(),
            ..Default::default()
        }),
        Operation::Move(MoveOperation {
            object_id: other,
            parent_id: destination,
            name: "renamed-in-place".to_owned(),
            ..Default::default()
        }),
    ];

    let expected_targets = [
        vec![parent, file],
        vec![file],
        vec![parent],
        vec![file, parent, destination],
        vec![file, destination],
        vec![destination, other],
        vec![file],
        vec![destination, parent],
        vec![parent],
        vec![other, destination],
    ];
    for (operation, mut expected) in operations.iter().zip(expected_targets) {
        expected.sort_unstable();
        assert_eq!(ObjectResource::targets_for_operation(operation), expected);
    }
}

#[test]
fn grouping_merges_overlaps_preserves_order_and_keeps_unrelated_operations_separate() {
    let first = ObjectId::new_v7();
    let second = ObjectId::new_v7();
    let child = ObjectId::new_v7();
    let third = ObjectId::new_v7();
    let unrelated = ObjectId::new_v7();
    let operations = vec![
        Operation::Write(WriteOperation {
            object_id: first,
            data: b"first".to_vec(),
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: second,
            ..Default::default()
        }),
        Operation::Update(UpdateOperation {
            object_id: unrelated,
            ..Default::default()
        }),
        Operation::Create(CreateOperation {
            parent_id: second,
            object_id: child,
            name: "child".to_owned(),
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: third,
            ..Default::default()
        }),
        Operation::Move(MoveOperation {
            object_id: first,
            parent_id: child,
            target_id: Some(third),
            name: "moved".to_owned(),
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: second,
            ..Default::default()
        }),
    ];
    let mut merged_targets = vec![first, second, child, third];
    merged_targets.sort_unstable();
    let merged_operations = [0, 1, 3, 4, 5, 6]
        .into_iter()
        .map(|index| operations[index].clone())
        .collect();
    let unrelated_operations = vec![operations[2].clone()];

    assert_eq!(
        ObjectResource::group_by_targets(operations),
        vec![
            (merged_operations, merged_targets),
            (unrelated_operations, vec![unrelated]),
        ]
    );
}

#[test]
fn grouping_empty_operations_returns_no_batches() {
    assert!(ObjectResource::group_by_targets(Vec::new()).is_empty());
}

#[test]
fn grouping_moves_write_payloads_without_cloning() {
    let data = b"payload".to_vec();
    let data_ptr = data.as_ptr();
    let operations = vec![Operation::Write(WriteOperation {
        object_id: ObjectId::new_v7(),
        data,
        ..Default::default()
    })];

    let batches = ObjectResource::group_by_targets(operations);

    let Operation::Write(write) = &batches[0].0[0] else {
        panic!("expected a write operation");
    };
    assert_eq!(write.data, b"payload");
    assert_eq!(write.data.as_ptr(), data_ptr);
}
