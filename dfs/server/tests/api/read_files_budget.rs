use super::*;

#[test]
fn predicted_success_size_matches_protobuf_encoding() {
    let object_id = ObjectId::new_v7();
    for name_len in [0, 127, 255] {
        for data_len in [0, 1, 127, 128, 16_383, 16_384, READ_MAX_BYTES as usize] {
            let object = Attr {
                id: object_id.into(),
                name: "a".repeat(name_len),
                size: data_len as u64,
                store_version: i64::MAX,
                ..Attr::default()
            };
            let batch = FilesBatch {
                results: vec![FileResult {
                    object_id,
                    object: Some(object.clone()),
                    data: Some(vec![0; data_len]),
                    error: None,
                }],
            };
            assert_eq!(
                success_encoded_len(object_id, &object, data_len),
                batch.encode_to_vec().len(),
                "name length {name_len}, data length {data_len}"
            );
        }
    }
}
