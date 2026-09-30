use std::time::Duration;

use anyhow::ensure;
use futures::TryStreamExt;
use slatedb::{
    bytes::Bytes,
    object_store::{ObjectStoreExt, local::LocalFileSystem, memory::InMemory, prefix::PrefixStore},
};

use super::*;
use crate::model::{
    ContentVersionId, FileContent, MetadataRevision, ObjectId, ObjectKind, ObjectMetadata,
    ParentLink, WorkspaceId, Xattrs,
};

mod recovery;

#[test]
fn storage_prefixes_cannot_select_the_bucket_root_or_normalize_paths() -> Result<()> {
    for invalid in [
        "",
        "/",
        "/dev",
        "dev/",
        "dev//test",
        ".",
        "..",
        "dev/../test",
        "gs://bucket/dev",
        "dev/%2f",
    ] {
        ensure!(
            invalid.parse::<StoragePrefix>().is_err(),
            "accepted invalid prefix"
        );
    }
    let prefix: StoragePrefix = "dfs-dev/spolu.v1".parse()?;
    ensure!(prefix.metadata_path().as_ref() == "dfs-dev/spolu.v1/metadata");
    ensure!(prefix.blobs_path().as_ref() == "dfs-dev/spolu.v1/blobs");
    Ok(())
}

#[tokio::test]
async fn storage_configuration_requires_a_pair_without_fallback() -> Result<()> {
    let disabled = StorageConfig {
        gcs_bucket: None,
        gcs_prefix: None,
    };
    ensure!(disabled.open().await?.is_none());
    for config in [
        StorageConfig {
            gcs_bucket: Some("bucket".to_owned()),
            gcs_prefix: None,
        },
        StorageConfig {
            gcs_bucket: None,
            gcs_prefix: Some("dev".parse()?),
        },
        StorageConfig {
            gcs_bucket: Some("gs://bucket".to_owned()),
            gcs_prefix: Some("dev".parse()?),
        },
    ] {
        ensure!(config.open().await.is_err());
    }
    Ok(())
}

#[tokio::test]
async fn storage_open_propagates_backend_failure_without_retrying_forever() -> Result<()> {
    let directory = tempfile::tempdir()?;
    std::fs::create_dir(directory.path().join("blocked"))?;
    std::fs::write(
        directory.path().join("blocked/metadata"),
        b"not a directory",
    )?;
    let store = Arc::new(LocalFileSystem::new_with_prefix(directory.path())?);
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        Storage::open(store, &"blocked".parse()?),
    )
    .await
    .context("storage open retried instead of returning the backend error")?;
    ensure!(result.is_err());
    Ok(())
}

#[tokio::test]
async fn storage_rejects_unknown_or_missing_database_format() -> Result<()> {
    for (key, value) in [
        (b"dfs-format".as_slice(), b"2".as_slice()),
        (b"legacy", b"data"),
    ] {
        let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
        let prefix: StoragePrefix = "format".parse()?;
        let db = Db::builder(prefix.metadata_path(), store.clone())
            .build()
            .await?;
        db.put(key, value).await?.await_durable().await?;
        db.close().await?;
        ensure!(Storage::open(store, &prefix).await.is_err());
    }
    Ok(())
}

#[tokio::test]
async fn local_storage_reopens_and_keeps_prefixes_separate() -> Result<()> {
    let directory = tempfile::tempdir()?;
    for store in [
        Arc::new(InMemory::new()) as Arc<dyn ObjectStore>,
        Arc::new(LocalFileSystem::new_with_prefix(directory.path())?),
    ] {
        let sibling = Path::from("fixture-other/keep");
        store
            .put(&sibling, Bytes::from_static(b"untouched").into())
            .await?;
        let prefix = "fixture".parse()?;
        tokio::time::timeout(
            Duration::from_secs(30),
            exercise_storage(store.clone(), &prefix),
        )
        .await??;
        cleanup_fixture(store.clone(), &prefix).await?;
        let remaining = store.list(None).try_collect::<Vec<_>>().await?;
        ensure!(remaining.len() == 1 && remaining[0].location == sibling);
        ensure!(store.get(&sibling).await?.bytes().await? == b"untouched"[..]);
    }
    Ok(())
}

/**
 * @cc [owner:spolu,label:testing] isolated-gcs-fixture
 * The real-GCS test MUST be opt-in and require an explicit test bucket and prefix. Each run MUST
 * use a fresh UUID subprefix. Cleanup MUST only delete objects within that run's prefix, after
 * closing SlateDB or terminating its process. Missing configuration or failed cloud access MUST
 * fail, not skip the test.
 */
#[tokio::test]
#[ignore = "requires DFS_TEST_GCS_BUCKET, DFS_TEST_GCS_PREFIX, and Google credentials"]
async fn gcs_storage_round_trip() -> Result<()> {
    let bucket = std::env::var("DFS_TEST_GCS_BUCKET").context("set DFS_TEST_GCS_BUCKET")?;
    let base: StoragePrefix = std::env::var("DFS_TEST_GCS_PREFIX")
        .context("set DFS_TEST_GCS_PREFIX")?
        .parse()?;
    let prefix: StoragePrefix = format!("{}/tests/{}", base.0, ObjectId::generate()).parse()?;
    let store = gcs_store(&bucket)?;
    tokio::time::timeout(Duration::from_secs(120), async {
        exercise_storage(store.clone(), &prefix).await?;
        recovery::exercise_recovery("gcs", &bucket, &format!("{}/recovery", prefix.0)).await?;
        crate::api::exercise_sessions(store.clone(), &format!("{}/sessions", prefix.0).parse()?)
            .await?;
        cleanup_fixture(store, &prefix).await
    })
    .await
    .context("GCS fixture timed out")
    .and_then(|result| result)
    .with_context(|| format!("GCS fixture failed; inspect gs://{bucket}/{}", prefix.0))
}

/// Exercise the same typed storage API against local stores and GCS.
async fn exercise_storage(store: Arc<dyn ObjectStore>, prefix: &StoragePrefix) -> Result<()> {
    let workspace = WorkspaceId::new("workspace/\0é")?;
    let (root, file, batch) = fixture(&workspace)?;
    let storage = Storage::open(store.clone(), prefix).await?;
    let write_result: Result<()> = async {
        let scoped = storage.workspace(&workspace)?;
        ensure!(scoped.commit(batch.clone()).await? == 1);
        verify_fixture(&scoped, file.id).await?;
        ensure!(scoped.commit(batch).await.is_err());
        ensure!(scoped.read_view().await?.changes(0, 10).await?.len() == 1);
        ensure!(scoped.read_blob(file.id, content(&file)?.version).await? == FIXTURE_BYTES);
        let other = storage.workspace(&WorkspaceId::new("workspace/\0é/other")?)?;
        ensure!(other.read_view().await?.object(file.id).await?.is_none());
        ensure!(
            other
                .read_view()
                .await?
                .children(root.id, None, 10)
                .await?
                .is_empty()
        );
        ensure!(
            other
                .read_view()
                .await?
                .granted_objects(FIXTURE_GRANT, None, 10)
                .await?
                .is_empty()
        );
        ensure!(
            other
                .read_blob(file.id, content(&file)?.version)
                .await
                .is_err()
        );
        Ok(())
    }
    .await;
    let close_result = storage.close().await;
    write_result?;
    close_result?;

    let reopened = Storage::open(store, prefix).await?;
    let read_result = verify_fixture(&reopened.workspace(&workspace)?, file.id).await;
    let close_result = reopened.close().await;
    read_result?;
    close_result
}

const FIXTURE_BYTES: &[u8] = b"file bytes stay outside SlateDB";
const FIXTURE_GRANT: &str = "g:engineers/\0é";

fn fixture(workspace: &WorkspaceId) -> Result<(ObjectMetadata, ObjectMetadata, MetadataBatch)> {
    let root = ObjectMetadata {
        workspace_id: workspace.clone(),
        id: ObjectId::generate(),
        parent: None,
        kind: ObjectKind::Directory,
        mime_type: "inode/directory".parse()?,
        xattrs: Xattrs::new(),
        metadata_revision: MetadataRevision::INITIAL,
        posix: crate::model::PosixAttributes::new(true, crate::model::Timestamp::EPOCH),
    };
    let file = ObjectMetadata {
        workspace_id: workspace.clone(),
        id: ObjectId::generate(),
        parent: Some(ParentLink {
            parent_id: root.id,
            name: "café.txt".parse()?,
        }),
        kind: ObjectKind::File(FileContent {
            version: ContentVersionId::generate(),
            size_bytes: u64::try_from(FIXTURE_BYTES.len())?,
        }),
        mime_type: "text/plain".parse()?,
        xattrs: Xattrs::from([("user.binary".to_owned(), vec![0, 128, 255])]),
        metadata_revision: MetadataRevision::INITIAL,
        posix: crate::model::PosixAttributes::new(true, crate::model::Timestamp::EPOCH),
    };
    let batch = MetadataBatch {
        mutations: vec![
            MetadataMutation::PutObject(root.clone().into()),
            MetadataMutation::PutObject(file.clone().into()),
            MetadataMutation::PutChild(file.directory_entry().context("missing file entry")?),
            MetadataMutation::SetGrant {
                object_id: file.id,
                grant: FIXTURE_GRANT.to_owned(),
                attached: true,
            },
        ],
        uploads: vec![BlobUpload {
            object_id: file.id,
            version: content(&file)?.version,
            bytes: Bytes::from_static(FIXTURE_BYTES),
        }],
    };
    Ok((root, file, batch))
}

fn content(file: &ObjectMetadata) -> Result<&FileContent> {
    match &file.kind {
        ObjectKind::File(content) => Ok(content),
        ObjectKind::Directory => bail!("fixture file is a directory"),
    }
}

async fn verify_fixture(scoped: &WorkspaceStorage<'_>, id: ObjectId) -> Result<()> {
    let view = scoped.read_view().await?;
    let file = view.object(id).await?.context("missing fixture object")?;
    let parent = file.parent.as_ref().context("missing fixture parent")?;
    ensure!(matches!(
        view.object(parent.parent_id)
            .await?
            .context("missing root")?
            .kind,
        ObjectKind::Directory
    ));
    ensure!(view.child(parent.parent_id, &parent.name).await? == Some(id));
    ensure!(
        view.children(parent.parent_id, None, 1).await?
            == vec![file.directory_entry().context("missing entry")?]
    );
    ensure!(
        view.children(parent.parent_id, Some(&parent.name), 1)
            .await?
            .is_empty()
    );
    ensure!(view.grants(id, None, 10).await? == vec![FIXTURE_GRANT]);
    ensure!(view.granted_objects(FIXTURE_GRANT, None, 10).await? == vec![id]);
    ensure!(
        view.granted_objects("g:engineers/", None, 10)
            .await?
            .is_empty()
    );
    ensure!(
        view.granted_objects(FIXTURE_GRANT, Some(id), 10)
            .await?
            .is_empty()
    );
    ensure!(scoped.read_blob(id, content(&file)?.version).await? == FIXTURE_BYTES);
    let events = view.changes(0, 10).await?;
    ensure!(events.len() == 1 && events[0].sequence == 1);
    ensure!(events[0].object_ids.contains(&id) && events[0].object_ids.contains(&parent.parent_id));
    ensure!(view.changes(1, 10).await?.is_empty());
    Ok(())
}

#[tokio::test]
async fn moves_and_grants_publish_atomically_while_old_snapshots_stay_stable() -> Result<()> {
    let storage = Storage::open(Arc::new(InMemory::new()), &"test".parse()?).await?;
    let workspace = WorkspaceId::new("w")?;
    let scoped = storage.workspace(&workspace)?;
    let (root, file, initial) = fixture(&workspace)?;
    scoped.commit(initial).await?;
    let old = scoped.read_view().await?;
    let old_parent = file.parent.as_ref().context("missing parent")?;
    let updated = ObjectMetadata {
        parent: Some(ParentLink {
            parent_id: root.id,
            name: "renamed.txt".parse()?,
        }),
        metadata_revision: file.metadata_revision.next()?,
        ..file.clone()
    };
    scoped
        .commit(MetadataBatch {
            mutations: vec![
                MetadataMutation::PutObject(updated.clone().into()),
                MetadataMutation::DeleteChild {
                    parent_id: root.id,
                    name: old_parent.name.clone(),
                },
                MetadataMutation::PutChild(updated.directory_entry().context("missing entry")?),
                MetadataMutation::SetGrant {
                    object_id: file.id,
                    grant: FIXTURE_GRANT.to_owned(),
                    attached: false,
                },
                MetadataMutation::SetGrant {
                    object_id: file.id,
                    grant: "".to_owned(),
                    attached: true,
                },
            ],
            uploads: vec![],
        })
        .await?;
    let current = scoped.read_view().await?;
    ensure!(old.object(file.id).await? == Some(file.clone()));
    ensure!(old.child(root.id, &old_parent.name).await? == Some(file.id));
    ensure!(old.granted_objects(FIXTURE_GRANT, None, 10).await? == vec![file.id]);
    ensure!(current.object(file.id).await? == Some(updated.clone()));
    ensure!(current.child(root.id, &old_parent.name).await?.is_none());
    ensure!(
        current.children(root.id, None, 10).await?
            == vec![updated.directory_entry().context("missing entry")?]
    );
    ensure!(
        current
            .granted_objects(FIXTURE_GRANT, None, 10)
            .await?
            .is_empty()
    );
    ensure!(current.grants(file.id, None, 10).await? == vec![""]);
    ensure!(current.granted_objects("", None, 10).await? == vec![file.id]);
    ensure!(current.changes(1, 10).await?.len() == 1);
    storage.close().await
}

#[tokio::test]
async fn invalid_batches_missing_blobs_and_failed_uploads_leave_metadata_unchanged() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let store = Arc::new(LocalFileSystem::new_with_prefix(directory.path())?);
    let storage = Storage::open(store, &"test".parse()?).await?;
    let workspace = WorkspaceId::new("w")?;
    let scoped = storage.workspace(&workspace)?;
    let (root, file, initial) = fixture(&workspace)?;
    let mut missing = initial.clone();
    missing.uploads.clear();
    ensure!(scoped.commit(missing).await.is_err());
    let mut duplicate = initial.clone();
    duplicate
        .mutations
        .push(MetadataMutation::PutObject(file.clone().into()));
    ensure!(scoped.commit(duplicate).await.is_err());
    let other = storage.workspace(&WorkspaceId::new("w/other")?)?;
    ensure!(other.commit(initial.clone()).await.is_err());
    std::fs::write(directory.path().join("test/blobs"), b"block uploads")?;
    ensure!(scoped.commit(initial.clone()).await.is_err());
    let view = scoped.read_view().await?;
    ensure!(view.object(file.id).await?.is_none());
    ensure!(view.children(root.id, None, 10).await?.is_empty());
    ensure!(
        view.granted_objects(FIXTURE_GRANT, None, 10)
            .await?
            .is_empty()
    );
    ensure!(view.changes(0, 10).await?.is_empty());
    std::fs::remove_file(directory.path().join("test/blobs"))?;
    ensure!(scoped.commit(initial).await? == 1);
    verify_fixture(&scoped, file.id).await?;
    let mut changed_content = file.clone();
    changed_content.kind = ObjectKind::File(FileContent {
        version: ContentVersionId::generate(),
        size_bytes: 0,
    });
    ensure!(
        scoped
            .begin_metadata_write()
            .await
            .commit(vec![MetadataMutation::PutObject(changed_content.into())])
            .await
            .is_err()
    );
    verify_fixture(&scoped, file.id).await?;
    storage.close().await
}

#[tokio::test]
async fn commits_and_change_events_wait_for_wal_durability() -> Result<()> {
    for succeed in [true, false] {
        let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
        let prefix: StoragePrefix = "test".parse()?;
        let storage = Arc::new(
            Storage::open_with_settings(
                store.clone(),
                &prefix,
                Settings {
                    flush_interval: None,
                    ..Default::default()
                },
            )
            .await?,
        );
        let workspace = WorkspaceId::new("w")?;
        let (root, file, initial) = fixture(&workspace)?;
        let writer_store = storage.clone();
        let writer_workspace = workspace.clone();
        let writer = tokio::spawn(async move {
            writer_store
                .workspace(&writer_workspace)?
                .commit(initial)
                .await
        });
        let scoped = storage.workspace(&workspace)?;
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if scoped.read_view().await?.object(file.id).await?.is_some() {
                    break Ok::<_, anyhow::Error>(());
                }
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        })
        .await??;
        ensure!(!writer.is_finished());
        let view = scoped.read_view().await?;
        ensure!(view.children(root.id, None, 10).await?.len() == 1);
        ensure!(view.granted_objects(FIXTURE_GRANT, None, 10).await? == vec![file.id]);
        ensure!(view.changes(0, 10).await?.is_empty());
        if succeed {
            storage.metadata.flush().await?;
            ensure!(writer.await?? == 1);
            verify_fixture(&scoped, file.id).await?;
            storage.metadata.close().await?;
        } else {
            storage
                .metadata
                .close_with_options(slatedb::config::CloseOptions { flush_type: None })
                .await?;
            ensure!(writer.await?.is_err());
            let reopened = Storage::open(store, &prefix).await?;
            let recovered = reopened.workspace(&workspace)?.read_view().await?;
            ensure!(recovered.object(file.id).await?.is_none());
            ensure!(recovered.children(root.id, None, 10).await?.is_empty());
            ensure!(
                recovered
                    .granted_objects(FIXTURE_GRANT, None, 10)
                    .await?
                    .is_empty()
            );
            ensure!(recovered.changes(0, 10).await?.is_empty());
            ensure!(
                reopened
                    .workspace(&workspace)?
                    .read_blob(file.id, content(&file)?.version)
                    .await?
                    == FIXTURE_BYTES
            );
            reopened.close().await?;
        }
    }
    Ok(())
}

#[tokio::test]
async fn workspace_authority_requires_a_durable_creation_batch() -> Result<()> {
    let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
    let prefix = "authority".parse()?;
    let storage = Arc::new(
        Storage::open_with_settings(
            store.clone(),
            &prefix,
            Settings {
                flush_interval: None,
                ..Default::default()
            },
        )
        .await?,
    );
    let workspace = WorkspaceId::new("w")?;
    let writer_store = storage.clone();
    let writer_workspace = workspace.clone();
    let writer = tokio::spawn(async move {
        writer_store
            .create_workspace(&writer_workspace, [42; 32], &["root".to_owned()].into())
            .await
    });
    let keys = Keyspace::new(workspace.clone())?;
    tokio::time::timeout(Duration::from_secs(5), async {
        while storage
            .metadata
            .get(keys.workspace_record())
            .await?
            .is_none()
        {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        Ok::<_, anyhow::Error>(())
    })
    .await??;
    ensure!(!writer.is_finished());
    ensure!(storage.workspace_record(&workspace).await?.is_none());
    ensure!(
        storage
            .workspace(&workspace)?
            .read_view()
            .await?
            .changes(0, 10)
            .await?
            .is_empty()
    );
    storage
        .metadata
        .close_with_options(slatedb::config::CloseOptions { flush_type: None })
        .await?;
    ensure!(writer.await?.is_err());
    let reopened = Storage::open(store, &prefix).await?;
    ensure!(reopened.workspace_record(&workspace).await?.is_none());
    ensure!(
        reopened
            .metadata
            .scan_prefix(keys.prefix(), ..)
            .await?
            .next()
            .await?
            .is_none()
    );
    ensure!(
        reopened
            .create_workspace(&workspace, [43; 32], &Default::default())
            .await?
            .is_some()
    );
    reopened.close().await
}

async fn cleanup_fixture(store: Arc<dyn ObjectStore>, prefix: &StoragePrefix) -> Result<()> {
    let scoped = PrefixStore::new(store, prefix.0.clone());
    let paths = scoped.list(None).map_ok(|object| object.location);
    scoped
        .delete_stream(Box::pin(paths))
        .try_collect::<Vec<_>>()
        .await?;
    ensure!(scoped.list(None).try_next().await?.is_none());
    Ok(())
}

#[tokio::test]
async fn namespace_writes_release_publication_before_durability_and_recover_atomically()
-> Result<()> {
    use crate::namespace::{CreateDirectory, mkdir};

    for succeed in [true, false] {
        let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
        let prefix = "namespace-durability".parse()?;
        let storage = Arc::new(
            Storage::open_with_settings(
                store.clone(),
                &prefix,
                Settings {
                    flush_interval: None,
                    ..Default::default()
                },
            )
            .await?,
        );
        let workspace = WorkspaceId::new("w")?;
        let keys = Keyspace::new(workspace.clone())?;
        let writer_store = storage.clone();
        let writer_workspace = workspace.clone();
        let creation = tokio::spawn(async move {
            writer_store
                .create_workspace(&writer_workspace, [42; 32], &["owner".to_owned()].into())
                .await
        });
        tokio::time::timeout(Duration::from_secs(5), async {
            while storage
                .metadata
                .get(keys.workspace_record())
                .await?
                .is_none()
            {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
            Ok::<_, anyhow::Error>(())
        })
        .await??;
        storage.metadata.flush().await?;
        let root = creation.await??.context("root creation")?;
        let mut writers = Vec::new();
        for name in ["one", "two"] {
            let writer_store = storage.clone();
            let writer_workspace = workspace.clone();
            writers.push(tokio::spawn(async move {
                mkdir(
                    &writer_store,
                    &writer_workspace,
                    &["owner".to_owned()].into(),
                    CreateDirectory {
                        parent_id: root,
                        name: name.parse()?,
                        mime_type: "inode/directory".parse()?,
                        xattrs: Default::default(),
                        mode: 0o755,
                    },
                )
                .await
                .map_err(anyhow::Error::from)
            }));
        }
        // Both batches must publish even though neither caller can finish without a WAL flush.
        tokio::time::timeout(Duration::from_secs(5), async {
            while storage
                .workspace(&workspace)?
                .read_view()
                .await?
                .children(root, None, 10)
                .await?
                .len()
                != 2
            {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
            Ok::<_, anyhow::Error>(())
        })
        .await??;
        ensure!(writers.iter().all(|writer| !writer.is_finished()));
        let pending = storage.workspace(&workspace)?.read_view().await?;
        ensure!(
            pending
                .object(root)
                .await?
                .context("root")?
                .metadata_revision
                .get()
                == 2
        );
        ensure!(pending.changes(1, 10).await?.is_empty());
        drop(pending);
        if succeed {
            storage.metadata.flush().await?;
            for writer in writers {
                writer.await??;
            }
            storage.close().await?;
        } else {
            storage
                .metadata
                .close_with_options(slatedb::config::CloseOptions { flush_type: None })
                .await?;
            for writer in writers {
                ensure!(writer.await?.is_err());
            }
        }
        let recovered = Storage::open(store, &prefix).await?;
        let view = recovered.workspace(&workspace)?.read_view().await?;
        let count = if succeed { 2 } else { 0 };
        ensure!(view.children(root, None, 10).await?.len() == count);
        ensure!(view.changes(1, 10).await?.len() == count);
        ensure!(
            view.object(root)
                .await?
                .context("root")?
                .metadata_revision
                .get()
                == u64::try_from(count)?
        );
        for entry in view.children(root, None, 10).await? {
            let object = view.object(entry.object_id).await?.context("child")?;
            ensure!(object.directory_entry() == Some(entry));
        }
        drop(view);
        recovered.close().await?;
    }
    Ok(())
}
