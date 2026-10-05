use dfs_poc::store::{Store, StoreMemory, WriteBatch};

#[test]
fn shared_cache_preserves_independent_databases_beyond_its_capacity() {
    let directory = tempfile::tempdir().unwrap();
    let memory = StoreMemory::new(4 << 20, 1 << 20).unwrap();
    let first = Store::open_with_memory(directory.path().join("first"), memory.clone()).unwrap();
    let second = Store::open_with_memory(directory.path().join("second"), memory.clone()).unwrap();
    for slot in 0..256_u32 {
        for (store, marker) in [(&first, 17_u8), (&second, 93_u8)] {
            let value = vec![marker.wrapping_add(slot as u8); 32 << 10];
            let mut batch = WriteBatch::default();
            store
                .put(&mut batch, "content", slot.to_be_bytes().to_vec(), &value)
                .unwrap();
            store.publish(batch).unwrap();
        }
    }
    for store in [&first, &second] {
        store.persist().unwrap();
        store
            .db
            .flush_cf(store.db.cf_handle("content").unwrap())
            .unwrap();
    }
    assert_eq!(first.memory.usage().capacity_bytes, 4 << 20);
    assert_eq!(second.memory.usage().memtable_capacity_bytes, 1 << 20);
    for slot in (0..256_u32).rev().chain(0..256_u32) {
        for (store, marker) in [(&first, 17_u8), (&second, 93_u8)] {
            let value = store
                .reader()
                .get::<Vec<u8>>("content", slot.to_be_bytes().to_vec())
                .unwrap()
                .unwrap();
            assert_eq!(value, vec![marker.wrapping_add(slot as u8); 32 << 10]);
        }
    }
    assert!(memory.usage().cache_bytes > 0);
}

#[test]
fn cache_configuration_rejects_zero_and_inconsistent_budgets() {
    assert!(StoreMemory::new(0, 1).is_err());
    assert!(StoreMemory::new(1, 0).is_err());
    assert!(StoreMemory::new(1, 2).is_err());
    assert!(StoreMemory::new(4 << 20, (1 << 20) - 1).is_err());
}
