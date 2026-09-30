use super::*;
use crate::{model::*, storage::*};
use futures::{StreamExt, TryStreamExt, stream};
use slatedb::{Settings, config::CloseOptions, object_store::memory::InMemory};

#[tokio::test]
async fn recovery_discards_a_consistent_suffix_at_upload_wal_and_retirement_boundaries()
-> Result<()> {
    for boundary in 0..4 {
        let store = Arc::new(InMemory::new());
        let prefix = "cached-recovery".parse()?;
        let workspace = WorkspaceId::new("w")?;
        let storage = Storage::open(store.clone(), &prefix).await?;
        let root = storage
            .create_workspace(&workspace, [0; 32], &["owner".to_owned()].into())
            .await?
            .context("root")?;
        storage.close().await?;
        let mut storage = Storage::open_with_settings(
            store.clone(),
            &prefix,
            Settings {
                flush_interval: None,
                ..Default::default()
            },
        )
        .await?;
        storage.enable_cache(CacheConfig {
            write_mode: WriteMode::Cached,
            ..Default::default()
        })?;
        storage.pause_persistence(true);
        let scoped = storage.workspace(&workspace)?;
        let id = ObjectId::generate();
        let version = ContentVersionId::generate();
        let request = RequestId::generate();
        let blob = scoped
            .upload_blob(
                id,
                version,
                stream::iter([Ok(Bytes::from_static(b"staged"))]),
            )
            .await?;
        let object = ObjectMetadata {
            workspace_id: workspace.clone(),
            id,
            parent: Some(ParentLink {
                parent_id: root,
                name: "file".parse()?,
            }),
            kind: ObjectKind::File(blob.content().clone()),
            mime_type: "text/plain".parse()?,
            xattrs: Default::default(),
            metadata_revision: MetadataRevision::INITIAL,
            posix: PosixAttributes::new(false, Timestamp::EPOCH),
        };
        scoped
            .commit(MetadataBatch {
                uploads: vec![blob.clone()],
                mutations: vec![
                    MetadataMutation::PutChild(object.directory_entry().context("entry")?),
                    MetadataMutation::PutObject(object.into()),
                    MetadataMutation::SetGrant {
                        object_id: id,
                        grant: "reader".into(),
                        attached: true,
                    },
                    MetadataMutation::RecordOperation {
                        request_id: request,
                        record: OperationRecord {
                            object_id: *id.as_bytes(),
                            content_version: *version.as_bytes(),
                            fingerprint: [0; 32],
                            size_bytes: 6,
                            metadata_revision: 0,
                        },
                    },
                ],
            })
            .await?;
        let selected = scoped
            .read_view()
            .await?
            .object(id)
            .await?
            .context("visible object")?;
        let ObjectKind::File(content) = selected.kind else {
            anyhow::bail!("not file")
        };
        let bytes = scoped
            .read_blob_stream(id, &content, 0, 6)
            .await?
            .stream
            .try_collect::<Vec<_>>()
            .await?;
        ensure!(bytes.concat() == b"staged");
        if boundary >= 1 {
            blob.persist(&storage.blobs).await?;
        }
        if boundary >= 2 {
            let cache = storage.cache.as_ref().context("cache")?;
            let rows = cache
                .state
                .lock()
                .map_err(|_| anyhow::anyhow!("state"))?
                .pending
                .front()
                .context("pending")?
                .rows
                .clone();
            let handle = storage.metadata.write(write_batch(&rows)).await?;
            if boundary >= 3 {
                storage.metadata.flush().await?;
                handle.await_durable().await?;
            }
        }
        storage.cache.as_ref().context("cache")?.abort();
        storage
            .metadata
            .close_with_options(CloseOptions { flush_type: None })
            .await?;
        drop(storage);
        let recovered = Storage::open(store, &prefix).await?;
        let scoped = recovered.workspace(&workspace)?;
        let view = scoped.read_view().await?;
        let committed = boundary == 3;
        ensure!(view.object(id).await?.is_some() == committed);
        ensure!(view.child(root, &"file".parse()?).await?.is_some() == committed);
        ensure!(view.operation(request).await?.is_some() == committed);
        ensure!(view.grants(id, None, 10).await?.len() == usize::from(committed));
        ensure!(view.granted_objects("reader", None, 10).await?.len() == usize::from(committed));
        ensure!(view.changes(1, 10).await?.len() == usize::from(committed));
        if committed {
            ensure!(scoped.read_blob(id, version).await? == b"staged"[..]);
        }
        recovered.close().await?;
    }
    Ok(())
}

#[tokio::test]
async fn failed_body_and_overlay_capacity_do_not_publish_partial_mutations() -> Result<()> {
    let mut storage = Storage::open(Arc::new(InMemory::new()), &"capacity".parse()?).await?;
    storage.enable_cache(CacheConfig {
        write_mode: WriteMode::Cached,
        overlay_bytes: 1,
        ..Default::default()
    })?;
    storage.pause_persistence(true);
    let cache = storage.cache.as_ref().context("cache")?;
    ensure!(
        cache
            .publish(
                [(vec![1], Some(Bytes::from_static(b"value")))].into(),
                vec![]
            )
            .is_err()
    );
    ensure!(cache.snapshot()?.is_empty() && cache.visible.load(Ordering::Acquire) == 0);
    let body = stream::iter([
        Ok(Bytes::from(vec![1; 65_536])),
        Err(anyhow::anyhow!("interrupted")),
    ]);
    ensure!(cache.staging.stage(body.boxed()).await.is_err());
    ensure!(cache.staging.usage() == (0, 0));
    storage.close().await
}

#[tokio::test]
async fn retiring_a_durable_batch_preserves_newer_visible_metadata() -> Result<()> {
    let store = Arc::new(InMemory::new());
    let prefix = "retirement".parse()?;
    let workspace = WorkspaceId::new("w")?;
    let storage = Storage::open(store.clone(), &prefix).await?;
    let root = storage
        .create_workspace(&workspace, [0; 32], &Default::default())
        .await?
        .context("root")?;
    storage.close().await?;
    let mut storage = Storage::open_with_settings(
        store,
        &prefix,
        Settings {
            flush_interval: None,
            ..Default::default()
        },
    )
    .await?;
    storage.enable_cache(CacheConfig {
        write_mode: WriteMode::Cached,
        persist_interval_ms: 0,
        ..Default::default()
    })?;
    let scoped = storage.workspace(&workspace)?;
    let cache = storage.cache.as_ref().context("cache")?;
    let mut object = scoped
        .read_view()
        .await?
        .object(root)
        .await?
        .context("root")?;
    object.xattrs.insert("user.value".into(), b"first".to_vec());
    scoped
        .commit(MetadataBatch {
            mutations: vec![MetadataMutation::PutObject(object.clone().into())],
            ..Default::default()
        })
        .await?;
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while cache.applied.load(Ordering::Acquire) < 1 {
            tokio::task::yield_now().await;
        }
    })
    .await?;
    object
        .xattrs
        .insert("user.value".into(), b"second".to_vec());
    scoped
        .commit(MetadataBatch {
            mutations: vec![MetadataMutation::PutObject(object.into())],
            ..Default::default()
        })
        .await?;
    let snapshot = scoped.read_view().await?;
    storage.metadata.flush().await?;
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while cache.durable.load(Ordering::Acquire) < 1 || cache.applied.load(Ordering::Acquire) < 2
        {
            tokio::task::yield_now().await;
        }
    })
    .await?;
    ensure!(
        scoped
            .read_view()
            .await?
            .object(root)
            .await?
            .context("root")?
            .xattrs["user.value"]
            == b"second"
    );
    ensure!(
        snapshot
            .object(root)
            .await?
            .context("snapshot root")?
            .xattrs["user.value"]
            == b"second"
    );
    storage.metadata.flush().await?;
    storage.close().await
}
