use dfs_protocol::{
    NAME_MAX_BYTES, ObjectId, READ_MAX_BYTES,
    rpc::{Attr, ErrorDetails, FileResult, FilesBatch, ObjectKind},
};
use prost::Message;

use super::READ_FILES_RESULT_OVERHEAD_BYTES;

#[test]
fn read_files_allowance_covers_attributes_errors_and_framing() {
    let object_id = ObjectId::new_v7();
    for data_len in [0, 127, 128, 16_383, 16_384, READ_MAX_BYTES as usize] {
        let object = Attr {
            id: object_id.into(),
            name: "a".repeat(NAME_MAX_BYTES),
            kind: ObjectKind::File.into(),
            size: data_len as u64,
            mode: u32::MAX,
            atime: Some(u64::MAX),
            mtime: Some(u64::MAX),
            ctime: Some(u64::MAX),
            attr_version: u64::MAX,
            content_version: u64::MAX,
            grants_version: u64::MAX,
            store_version: i64::MAX,
            metadata: None,
        };
        let batch = FilesBatch {
            results: vec![FileResult {
                object_id,
                object: Some(object),
                data: Some(vec![0; data_len]),
                error: None,
            }],
        };
        assert!(batch.encode_to_vec().len() - data_len <= READ_FILES_RESULT_OVERHEAD_BYTES);
    }
    // A negative enum value uses the largest possible wire encoding for an error code.
    let batch = FilesBatch {
        results: vec![FileResult {
            object_id,
            object: None,
            data: None,
            error: Some(ErrorDetails { code: i32::MIN }),
        }],
    };
    assert!(batch.encode_to_vec().len() <= READ_FILES_RESULT_OVERHEAD_BYTES);
}
