use dfs_protocol::rpc::{
    CreateOperation, RemoveOperation, RenameOperation, UpdateOperation, WriteOperation,
};

use super::*;

#[test]
fn grouping_preserves_order_and_indexes_each_operation_once_per_target() {
    let parent = ObjectId::new_v7();
    let file = ObjectId::new_v7();
    let destination = ObjectId::new_v7();
    let operations = vec![
        Operation::Create(CreateOperation {
            parent_id: parent,
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
        Operation::Rename(RenameOperation {
            object_id: file,
            parent_id: destination,
            name: "renamed".to_owned(),
            ..Default::default()
        }),
        Operation::Remove(RemoveOperation {
            object_id: file,
            ..Default::default()
        }),
        Operation::Create(CreateOperation {
            parent_id: destination,
            name: "other".to_owned(),
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: file,
            data: b"first".to_vec(),
            ..Default::default()
        }),
        Operation::Rename(RenameOperation {
            object_id: destination,
            parent_id: destination,
            name: "invalid-self-move".to_owned(),
            ..Default::default()
        }),
    ];

    assert_eq!(
        ObjectResource::group_by_targets(&operations),
        HashMap::from([
            (parent, vec![0, 2]),
            (file, vec![1, 3, 4, 6]),
            (destination, vec![3, 5, 7]),
        ])
    );
}
