use dfs_poc::store::{Store, WriteBatch, decode_key, key};

#[test]
fn snapshots_isolate_atomic_batches_and_persist_all_families() {
    let directory = tempfile::tempdir().unwrap();
    let store = Store::open(directory.path()).unwrap();
    let first_key = key("tenant\0a", &["node", "first"]);
    let second_key = key("tenant\0a", &["node", "second"]);
    let other_key = key("tenant\0ab", &["node", "first"]);
    let mut batch = WriteBatch::default();
    for family in ["metadata", "content", "changes"] {
        store
            .put(
                &mut batch,
                family,
                first_key.clone(),
                &format!("{family}-old"),
            )
            .unwrap();
        store
            .put(&mut batch, family, second_key.clone(), &"deleted")
            .unwrap();
        store
            .put(&mut batch, family, other_key.clone(), &"other tenant")
            .unwrap();
    }
    store.publish(batch).unwrap();
    let snapshot = store.reader();
    let mut batch = WriteBatch::default();
    for family in ["metadata", "content", "changes"] {
        store
            .put(
                &mut batch,
                family,
                first_key.clone(),
                &format!("{family}-new"),
            )
            .unwrap();
        store
            .delete(&mut batch, family, second_key.clone())
            .unwrap();
    }
    store.publish(batch).unwrap();
    for family in ["metadata", "content", "changes"] {
        assert_eq!(
            snapshot.get::<String>(family, first_key.clone()).unwrap(),
            Some(format!("{family}-old"))
        );
        assert_eq!(
            snapshot
                .scan::<String>(family, key("tenant\0a", &["node"]))
                .unwrap()
                .len(),
            2
        );
        let rows = store
            .reader()
            .scan::<String>(family, key("tenant\0a", &["node"]))
            .unwrap();
        assert_eq!(rows, vec![(first_key.clone(), format!("{family}-new"))]);
        assert_eq!(
            decode_key(&rows[0].0).unwrap(),
            ["tenant\0a", "1", "node", "first"]
        );
    }
    assert!(
        store
            .reader()
            .get::<String>("unknown", first_key.clone())
            .is_err()
    );
    store.persist().unwrap();
    drop(snapshot);
    drop(store);
    let reopened = Store::open(directory.path()).unwrap();
    for family in ["metadata", "content", "changes"] {
        assert_eq!(
            reopened
                .reader()
                .get::<String>(family, first_key.clone())
                .unwrap(),
            Some(format!("{family}-new"))
        );
        assert_eq!(
            reopened
                .reader()
                .get::<String>(family, second_key.clone())
                .unwrap(),
            None
        );
        assert_eq!(
            reopened
                .reader()
                .get::<String>(family, other_key.clone())
                .unwrap(),
            Some("other tenant".into())
        );
    }
}

#[test]
fn batch_accounting_preserves_duplicate_operations_and_length_boundaries() {
    let directory = tempfile::tempdir().unwrap();
    let store = Store::open(directory.path()).unwrap();
    let mut batch = WriteBatch::default();
    assert_eq!(batch.size_in_bytes(), 12);
    store
        .put(&mut batch, "content", vec![0; 128], &vec![0u8; 128])
        .unwrap();
    assert_eq!(batch.size_in_bytes(), 282);
    store
        .put(&mut batch, "content", vec![0; 128], &vec![0u8; 1])
        .unwrap();
    assert_eq!(batch.size_in_bytes(), 424);
    store.delete(&mut batch, "content", vec![0; 128]).unwrap();
    assert_eq!(batch.size_in_bytes(), 556);
    store.put(&mut batch, "metadata", vec![0], &true).unwrap();
    assert_eq!(batch.size_in_bytes(), 562);
    store
        .put(&mut batch, "changes", vec![0; 16384], &vec![0u8; 16384])
        .unwrap();
    assert_eq!(batch.size_in_bytes(), 33346);
}
