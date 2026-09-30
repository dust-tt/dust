use super::*;
use crate::storage::{CacheConfig, WriteMode};
use futures::TryStreamExt;

#[tokio::test]
async fn cached_visibility_retries_grants_and_paging_do_not_wait_for_persistence() -> Result<()> {
    let store = Arc::new(InMemory::new());
    let mut storage = Storage::open(store.clone(), &"cached".parse()?).await?;
    storage.enable_cache(CacheConfig {
        write_mode: WriteMode::Cached,
        persist_interval_ms: 0,
        ..Default::default()
    })?;
    storage.pause_persistence(true);
    let f = Fixture::from_storage(Arc::new(storage), FileConfig::default()).await?;
    let receipt = create_file(&f, "cached", b"start").await?;
    let object = text(&receipt, "object_id")?.parse()?;
    let writer = open_handle(&f, object, true).await?;
    let reader_key = f.session_key(&["reader"]).await?;
    let (_, opened) = call(
        &f.app,
        "POST",
        "/files/open",
        Some(&reader_key),
        json!({"object_id":object.to_string()}),
    )
    .await?;
    let reader = text(&opened, "handle_id")?;
    let id = RequestId::generate();
    let (status, receipt) = tokio::time::timeout(
        Duration::from_secs(2),
        write_body(&f, &writer, id, 1, 0, 1, Body::from("!")),
    )
    .await??;
    ensure!(status == StatusCode::OK, "{receipt}");
    ensure!(
        f.request(
            "/files/fsync",
            json!({"handle_id":writer,"through_sequence":1})
        )
        .await?
        .0 == StatusCode::NO_CONTENT
    );
    ensure!(
        write_body(&f, &writer, id, 1, 0, 1, Body::from("!"))
            .await?
            .1
            == receipt
    );
    let response = read_response(&f, &reader_key, reader, None, 0, 100).await?;
    ensure!(to_bytes(response.into_body(), 100).await? == b"start!"[..]);
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    let before = view.children(f.shared.id, None, 2).await?;
    ensure!(before.len() == 2);
    let after = view.children(f.shared.id, Some(&before[1].name), 2).await?;
    ensure!(after.len() == 2 && before[1].name.as_str() < after[0].name.as_str());
    ensure!(view.granted_objects("reader", None, 10).await? == [f.shared.id]);
    // Only workspace creation is durable while the persistence worker is paused.
    ensure!(view.changes(1, 100).await?.is_empty());
    ensure!(
        store
            .list(Some(&"cached/blobs".into()))
            .try_collect::<Vec<_>>()
            .await?
            .is_empty()
    );
    let shared = view.object(f.shared.id).await?.context("shared")?;
    crate::namespace::update_grants(
        &f.storage,
        &f.workspace,
        f.shared.id,
        shared.metadata_revision.get(),
        [("reader".to_owned(), false)].into(),
    )
    .await?;
    ensure!(
        read_response(&f, &reader_key, reader, None, 0, 100)
            .await?
            .status()
            == StatusCode::NOT_FOUND
    );
    // An older read view stays internally consistent across publication and retirement.
    ensure!(view.granted_objects("reader", None, 10).await? == [f.shared.id]);
    f.storage.pause_persistence(false);
    tokio::time::timeout(Duration::from_secs(5), f.storage.drain_persistence()).await??;
    ensure!(view.granted_objects("reader", None, 10).await? == [f.shared.id]);
    let fresh = f.storage.workspace(&f.workspace)?.read_view().await?;
    ensure!(fresh.granted_objects("reader", None, 10).await?.is_empty());
    ensure!(!fresh.changes(1, 100).await?.is_empty());
    f.close().await
}

#[tokio::test]
async fn cached_disk_spill_truncate_and_capacity_preserve_previous_content() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let mut storage = Storage::open(Arc::new(InMemory::new()), &"spill".parse()?).await?;
    storage.enable_cache(CacheConfig {
        write_mode: WriteMode::Cached,
        cache_dir: directory.path().to_owned(),
        cache_memory_bytes: 1,
        cache_disk_bytes: 200_000,
        persist_interval_ms: 0,
        ..Default::default()
    })?;
    storage.pause_persistence(true);
    let f = Fixture::from_storage(Arc::new(storage), FileConfig::default()).await?;
    let receipt = create_file(&f, "spill", b"original").await?;
    let object = text(&receipt, "object_id")?.parse()?;
    let handle = open_handle(&f, object, false).await?;
    ensure!(
        write_body(
            &f,
            &handle,
            RequestId::generate(),
            1,
            65_530,
            20,
            Body::from(vec![b'x'; 20])
        )
        .await?
        .0 == StatusCode::OK
    );
    let contents = read_bytes(&f, &handle).await?;
    ensure!(
        &contents[..8] == b"original"
            && contents[8..65_530].iter().all(|byte| *byte == 0)
            && contents[65_530..] == [b'x'; 20]
    );
    ensure!(f.request("/files/truncate", json!({"handle_id":handle,"request_id":RequestId::generate().to_string(),"sequence":2,"size_bytes":4})).await?.0 == StatusCode::OK);
    ensure!(f.request("/files/truncate", json!({"handle_id":handle,"request_id":RequestId::generate().to_string(),"sequence":3,"size_bytes":8})).await?.0 == StatusCode::OK);
    ensure!(read_bytes(&f, &handle).await? == b"orig\0\0\0\0"[..]);
    ensure!(
        write_body(
            &f,
            &handle,
            RequestId::generate(),
            4,
            0,
            200_000,
            Body::from(vec![1; 200_000])
        )
        .await?
        .0 == StatusCode::INSUFFICIENT_STORAGE
    );
    ensure!(read_bytes(&f, &handle).await? == b"orig\0\0\0\0"[..]);
    f.storage.pause_persistence(false);
    f.close().await
}

#[tokio::test]
async fn persistence_coalesces_overwrites_and_deletes_without_breaking_readers_or_receipts()
-> Result<()> {
    let store = Arc::new(InMemory::new());
    let mut storage = Storage::open(store.clone(), &"coalesced".parse()?).await?;
    storage.enable_cache(CacheConfig {
        write_mode: WriteMode::Cached,
        persist_interval_ms: 0,
        ..Default::default()
    })?;
    storage.pause_persistence(true);
    let f = Fixture::from_storage(Arc::new(storage), FileConfig::default()).await?;
    let original = create_file(&f, "coalesced", b"start").await?;
    let object = text(&original, "object_id")?.parse()?;
    let scoped = f.storage.workspace(&f.workspace)?;
    let old_view = scoped.read_view().await?;
    let old = old_view.object(object).await?.context("old object")?;
    let ObjectKind::File(old_content) = old.kind else {
        anyhow::bail!("not file")
    };
    let writer = open_handle(&f, object, true).await?;
    let mut last = original.clone();
    for sequence in 1..=100 {
        let (status, receipt) = write_body(
            &f,
            &writer,
            RequestId::generate(),
            sequence,
            0,
            1,
            Body::from("!"),
        )
        .await?;
        ensure!(status == StatusCode::OK);
        last = receipt;
    }
    let discarded = create_file(&f, "discarded", b"never upload this").await?;
    ensure!(f.request("/objects/unlink", json!({"object_id":text(&discarded,"object_id")?,"expected_metadata_revision":discarded["metadata_revision"]})).await?.0 == StatusCode::NO_CONTENT);
    f.storage.pause_persistence(false);
    tokio::time::timeout(Duration::from_secs(5), f.storage.drain_persistence()).await??;
    let blobs = store
        .list(Some(&"coalesced/blobs/v1".into()))
        .try_collect::<Vec<_>>()
        .await?;
    // The three fixture files and final overwritten file, without intermediate/deleted versions.
    ensure!(blobs.len() == 4, "{} blobs", blobs.len());
    let original_version = text(&original, "content_version")?;
    ensure!(
        blobs
            .iter()
            .all(|blob| !blob.location.as_ref().ends_with(original_version))
    );
    let read = scoped.read_blob_stream(object, &old_content, 0, 5).await?;
    drop(old_view);
    ensure!(read.stream.try_collect::<Vec<_>>().await?.concat() == b"start");
    let bytes = read_bytes(&f, &writer).await?;
    ensure!(&bytes[..5] == b"start" && bytes[5..] == [b'!'; 100]);
    ensure!(
        f.request(
            "/files/status",
            json!({"object_id":object.to_string(),"request_id":original["request_id"]})
        )
        .await?
        .1 == original
    );
    ensure!(
        f.request(
            "/files/status",
            json!({"object_id":object.to_string(),"request_id":last["request_id"]})
        )
        .await?
        .1 == last
    );
    f.close().await
}
