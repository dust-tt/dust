use anyhow::{Context, Result};
use dfs_protocol::{
    error::code,
    rpc::{dfs_server::Dfs, *},
};
use dfs_server_v2::{
    State,
    api::Api,
    storage::{Storage, StorageConfig, WriteBatch},
    writeback::WritebackConfig,
};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tonic::Request;

const KEY: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
fn request<T>(key: &str, body: T) -> Result<Request<T>> {
    let mut request = Request::new(body);
    request
        .metadata_mut()
        .insert("authorization", format!("Bearer {key}").parse()?);
    Ok(request)
}
fn expected(object: &Object) -> Expected {
    Expected {
        id: object.id.clone(),
        version: object.version,
    }
}
fn object(mutation: Mutation) -> Result<Object> {
    mutation.object.context("mutation object")
}

struct Client {
    api: Api,
    session: Session,
}
impl Client {
    async fn stat(&self, id: &str) -> Result<Object> {
        Ok(self
            .api
            .stat(request(
                &self.session.session_key,
                ObjectRequest {
                    object_id: id.into(),
                },
            )?)
            .await?
            .into_inner())
    }
    async fn create(&self, parent: &str, name: &str) -> Result<Object> {
        self.create_kind(parent, name, false).await
    }
    async fn create_kind(&self, parent: &str, name: &str, directory: bool) -> Result<Object> {
        object(
            self.api
                .create(request(
                    &self.session.session_key,
                    CreateRequest {
                        parent_id: parent.into(),
                        expected_parent_version: self.stat(parent).await?.version,
                        name: name.into(),
                        directory,
                        mode: 0o644,
                        ..Default::default()
                    },
                )?)
                .await?
                .into_inner(),
        )
    }
    async fn write(&self, id: &str, offset: u64, data: &[u8]) -> Result<Object> {
        object(
            self.api
                .write(request(
                    &self.session.session_key,
                    WriteRequest {
                        object_id: id.into(),
                        expected_version: 0,
                        offset,
                        data: data.to_vec(),
                        append: false,
                    },
                )?)
                .await?
                .into_inner(),
        )
    }
    async fn update(&self, id: &str, mut patch: UpdateRequest) -> Result<Object> {
        patch.object_id = id.into();
        patch.expected_version = 0;
        object(
            self.api
                .update(request(&self.session.session_key, patch)?)
                .await?
                .into_inner(),
        )
    }
    async fn read(&self, id: &str) -> Result<Vec<u8>> {
        Ok(self
            .api
            .read(request(
                &self.session.session_key,
                ReadRequest {
                    object_id: id.into(),
                    length: 1024,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner()
            .data)
    }
    async fn sync(&self, id: &str) -> std::result::Result<Object, tonic::Status> {
        let request = request(
            &self.session.session_key,
            ObjectRequest {
                object_id: id.into(),
            },
        )
        .map_err(|_| tonic::Status::internal("test request"))?;
        Ok(self.api.fsync(request).await?.into_inner())
    }
}
struct Fixture {
    a: Client,
    b: Client,
    workspace: Workspace,
    config: StorageConfig,
}
impl Fixture {
    async fn new(mut config: WritebackConfig) -> Result<Self> {
        config.writeback_debounce_ms = 60_000;
        config.writeback_max_age_ms = 60_000;
        Self::configured(config).await
    }
    async fn configured(config: WritebackConfig) -> Result<Self> {
        let storage = StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-writeback-{}", uuid::Uuid::new_v4().simple()),
        };
        let a = Api(State::with_writeback(
            Storage::open(&storage).await?,
            KEY,
            config.clone(),
        )?);
        let workspace = a
            .create_workspace(request(
                KEY,
                CreateWorkspaceRequest {
                    workspace_id: "writeback".into(),
                    root_grants: vec!["owner".into(), "admin".into()],
                },
            )?)
            .await?
            .into_inner();
        let b = Api(State::with_writeback(
            Storage::open(&storage).await?,
            KEY,
            config,
        )?);
        let a = Self::session(a, &workspace, "owner").await?;
        let b = Self::session(b, &workspace, "admin").await?;
        Ok(Self {
            a,
            b,
            workspace,
            config: storage,
        })
    }
    async fn session(api: Api, workspace: &Workspace, grant: &str) -> Result<Client> {
        let session = api
            .create_session(request(
                &workspace.workspace_key,
                CreateSessionRequest {
                    workspace_id: workspace.workspace_id.clone(),
                    grants: vec![grant.into()],
                },
            )?)
            .await?
            .into_inner();
        Ok(Client { api, session })
    }
    async fn cleanup(&self) -> Result<()> {
        self.a.api.0.drain().await?;
        self.b.api.0.drain().await?;
        self.a
            .api
            .0
            .storage
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    }
}

async fn memory_visibility_and_durable_barriers() -> Result<()> {
    let f = Fixture::new(WritebackConfig::default()).await?;
    let file = f.a.create(&f.workspace.root_id, "file").await?;
    f.a.write(&file.id, 0, b"abc").await?;
    let visible =
        f.a.update(
            &file.id,
            UpdateRequest {
                size: Some(8),
                mime_type: Some("text/plain".into()),
                xattrs: vec![XattrChange {
                    name: "user.test".into(),
                    value: Some(b"value".to_vec()),
                }],
                ..Default::default()
            },
        )
        .await?;
    assert_eq!(f.a.read(&file.id).await?, b"abc\0\0\0\0\0");
    assert_eq!(f.a.stat(&file.id).await?, visible);
    let lookup =
        f.a.api
            .lookup(request(
                &f.a.session.session_key,
                LookupRequest {
                    parent_id: f.workspace.root_id.clone(),
                    name: "file".into(),
                },
            )?)
            .await?
            .into_inner();
    assert_eq!(lookup, visible);
    let page =
        f.a.api
            .list(request(
                &f.a.session.session_key,
                ListRequest {
                    directory_id: f.workspace.root_id.clone(),
                    limit: 10,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner();
    assert_eq!(page.entries[0].object.as_ref(), Some(&visible));
    assert_eq!(f.b.stat(&file.id).await?, file);
    assert!(f.b.read(&file.id).await?.is_empty());
    let isolated =
        f.a.api
            .create_workspace(request(
                KEY,
                CreateWorkspaceRequest {
                    workspace_id: "isolated".into(),
                    root_grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
    let isolated = Fixture::session(f.a.api.clone(), &isolated, "owner").await?;
    let hidden = isolated
        .api
        .stat(request(
            &isolated.session.session_key,
            ObjectRequest {
                object_id: file.id.clone(),
            },
        )?)
        .await;
    assert_eq!(
        code(&hidden.err().context("pending object crossed workspaces")?),
        ErrorCode::NotFound
    );
    let other = f.a.create(&f.workspace.root_id, "other").await?;
    f.a.write(&other.id, 0, b"still in RAM").await?;
    let synced = f.a.sync(&file.id).await?;
    assert_eq!(synced, visible);
    assert_eq!(f.b.stat(&file.id).await?, synced);
    assert!(f.b.read(&other.id).await?.is_empty());
    let reopened = Fixture::session(
        Api(State::new_durable(Storage::open(&f.config).await?, KEY)?),
        &f.workspace,
        "admin",
    )
    .await?;
    assert_eq!(reopened.read(&file.id).await?, b"abc\0\0\0\0\0");
    f.a.api
        .close_session(request(&f.a.session.session_key, Empty {})?)
        .await?;
    assert_eq!(f.b.read(&other.id).await?, b"still in RAM");
    f.cleanup().await
}

async fn independent_writers_rebase_semantic_operations() -> Result<()> {
    let f = Fixture::new(WritebackConfig::default()).await?;
    let file = f.a.create(&f.workspace.root_id, "file").await?;
    f.a.write(&file.id, 0, b"abcdef").await?;
    f.a.sync(&file.id).await?;
    let parent = f.a.stat(&f.workspace.root_id).await?;
    let accepted = f.a.write(&file.id, 0, b"A").await?;
    f.b.write(&file.id, 5, b"Z").await?;
    f.b.sync(&file.id).await?;
    let rebased = f.a.sync(&file.id).await?;
    assert_ne!(accepted.version, rebased.version);
    assert_eq!(f.b.read(&file.id).await?, b"AbcdeZ");
    assert_eq!(f.a.stat(&f.workspace.root_id).await?, parent);
    f.a.write(&file.id, 2, b"12").await?;
    f.b.write(&file.id, 2, b"34").await?;
    f.a.sync(&file.id).await?;
    f.b.sync(&file.id).await?;
    assert_eq!(f.a.read(&file.id).await?, b"Ab34eZ");
    for (client, name) in [(&f.a, "user.a"), (&f.b, "user.b")] {
        client
            .update(
                &file.id,
                UpdateRequest {
                    xattrs: vec![XattrChange {
                        name: name.into(),
                        value: Some(vec![1]),
                    }],
                    ..Default::default()
                },
            )
            .await?;
    }
    f.a.sync(&file.id).await?;
    f.b.sync(&file.id).await?;
    assert_eq!(f.a.stat(&file.id).await?.xattrs.len(), 2);
    f.a.update(
        &file.id,
        UpdateRequest {
            size: Some(2),
            ..Default::default()
        },
    )
    .await?;
    f.a.update(
        &file.id,
        UpdateRequest {
            size: Some(8),
            ..Default::default()
        },
    )
    .await?;
    f.a.write(&file.id, 6, b"Q").await?;
    f.b.write(&file.id, 3, b"tail").await?;
    f.b.sync(&file.id).await?;
    f.a.sync(&file.id).await?;
    assert_eq!(f.b.read(&file.id).await?, b"Ab\0\0\0\0Q\0");
    f.cleanup().await
}

async fn remote_unlink_never_resurrects_pending_content() -> Result<()> {
    let f = Fixture::new(WritebackConfig::default()).await?;
    let file = f.a.create(&f.workspace.root_id, "file").await?;
    f.a.write(&file.id, 0, b"pending").await?;
    let parent = f.b.stat(&f.workspace.root_id).await?;
    f.b.api
        .remove(request(
            &f.b.session.session_key,
            RemoveRequest {
                object_id: file.id.clone(),
                directory: false,
                expected: vec![expected(&file), expected(&parent)],
            },
        )?)
        .await?;
    assert_eq!(
        code(
            &f.a.sync(&file.id)
                .await
                .err()
                .context("deleted fsync succeeded")?
        ),
        ErrorCode::NotFound
    );
    let close =
        f.a.api
            .close_session(request(&f.a.session.session_key, Empty {})?)
            .await;
    assert_eq!(
        code(&close.err().context("deferred deletion disappeared")?),
        ErrorCode::NotFound
    );
    assert!(f.b.stat(&file.id).await.is_err());
    f.cleanup().await
}

async fn revocation_rechecks_original_grants_at_publication() -> Result<()> {
    let f = Fixture::new(WritebackConfig::default()).await?;
    let file = f.a.create(&f.workspace.root_id, "file").await?;
    f.a.write(&file.id, 0, b"pending").await?;
    let root = f.b.stat(&f.workspace.root_id).await?;
    f.b.api
        .update_grants(request(
            &f.workspace.workspace_key,
            UpdateGrantsRequest {
                workspace_id: f.workspace.workspace_id.clone(),
                object_id: root.id,
                expected_version: root.version,
                changes: vec![GrantChange {
                    grant: "owner".into(),
                    attached: false,
                }],
            },
        )?)
        .await?;
    assert_eq!(
        code(
            &f.a.sync(&file.id)
                .await
                .err()
                .context("revoked fsync succeeded")?
        ),
        ErrorCode::NotFound
    );
    let close =
        f.a.api
            .close_session(request(&f.a.session.session_key, Empty {})?)
            .await;
    assert_eq!(
        code(&close.err().context("deferred revocation disappeared")?),
        ErrorCode::NotFound
    );
    assert!(f.b.read(&file.id).await?.is_empty());
    f.cleanup().await
}

async fn large_file_pressure_and_fsync_under_continued_writes() -> Result<()> {
    let f = Fixture::new(WritebackConfig {
        writeback_mib: 4,
        ..Default::default()
    })
    .await?;
    let file = f.a.create(&f.workspace.root_id, "large").await?;
    for block in 0..12 {
        f.a.write(&file.id, block * 1_048_576, &vec![block as u8; 1_048_576])
            .await?;
    }
    f.a.sync(&file.id).await?;
    for block in 0..12 {
        let response =
            f.b.api
                .read(request(
                    &f.b.session.session_key,
                    ReadRequest {
                        object_id: file.id.clone(),
                        offset: block * 1_048_576,
                        length: 1024,
                        version: None,
                    },
                )?)
                .await?
                .into_inner();
        assert_eq!(response.data, vec![block as u8; 1024]);
    }
    let stop = Arc::new(AtomicBool::new(false));
    let writer = Client {
        api: f.a.api.clone(),
        session: f.a.session.clone(),
    };
    let writing_id = file.id.clone();
    let stopping = stop.clone();
    let task = tokio::spawn(async move {
        let mut writes = 0;
        while !stopping.load(Ordering::Relaxed) {
            writer.write(&writing_id, 0, b"overwrite").await?;
            writes += 1;
        }
        Ok::<_, anyhow::Error>(writes)
    });
    tokio::time::sleep(Duration::from_millis(20)).await;
    let result = tokio::time::timeout(Duration::from_secs(2), f.a.sync(&file.id)).await;
    stop.store(true, Ordering::Relaxed);
    assert!(task.await?? > 0);
    result??;
    f.cleanup().await
}

#[test]
fn real_fdb_server_writeback() -> Result<()> {
    dfs_server_v2::network::run(async {
        memory_visibility_and_durable_barriers().await?;
        independent_writers_rebase_semantic_operations().await?;
        remote_unlink_never_resurrects_pending_content().await?;
        revocation_rechecks_original_grants_at_publication().await?;
        large_file_pressure_and_fsync_under_continued_writes().await?;
        failed_file_does_not_poison_other_files_or_new_sessions().await?;
        projected_metadata_keeps_listing_budgets_and_cursors().await?;
        background_flushes_during_continued_writes().await?;
        local_rename_and_append_drain_prior_edits().await?;
        search_waits_for_publication_and_filters_dirty_files().await?;
        ancestor_move_reauthorizes_pending_edits_without_file_version_changes().await?;
        Ok(())
    })
}

async fn failed_file_does_not_poison_other_files_or_new_sessions() -> Result<()> {
    let f = Fixture::new(WritebackConfig::default()).await?;
    let bad = f.a.create(&f.workspace.root_id, "bad").await?;
    let good = f.a.create(&f.workspace.root_id, "good").await?;
    for (client, name) in [(&f.a, "user.a"), (&f.b, "user.b")] {
        client
            .update(
                &bad.id,
                UpdateRequest {
                    xattrs: vec![XattrChange {
                        name: name.into(),
                        value: Some(vec![1; 20_000]),
                    }],
                    ..Default::default()
                },
            )
            .await?;
    }
    f.b.sync(&bad.id).await?;
    f.a.write(&good.id, 0, b"committed despite another file's rejection")
        .await?;
    assert!(f.a.api.0.drain().await.is_err());
    assert_eq!(
        f.b.read(&good.id).await?,
        b"committed despite another file's rejection"
    );
    assert_eq!(f.b.stat(&bad.id).await?.xattrs.len(), 1);
    for _ in 0..2 {
        assert_eq!(
            code(
                &f.a.sync(&bad.id)
                    .await
                    .err()
                    .context("deferred failure lost")?
            ),
            ErrorCode::InvalidInput
        );
    }
    let fresh = Fixture::session(f.a.api.clone(), &f.workspace, "owner").await?;
    fresh.write(&bad.id, 0, b"fresh session").await?;
    fresh.sync(&bad.id).await?;
    assert_eq!(f.b.read(&bad.id).await?, b"fresh session");
    assert!(
        f.a.api
            .close_session(request(&f.a.session.session_key, Empty {})?)
            .await
            .is_err()
    );
    f.cleanup().await
}

async fn projected_metadata_keeps_listing_budgets_and_cursors() -> Result<()> {
    let f = Fixture::new(WritebackConfig::default()).await?;
    // Stop the background publisher before edits so every expanded row remains in RAM for this test.
    f.a.api.0.drain().await?;
    let mut ids = std::collections::BTreeSet::new();
    for index in 0..40 {
        let file =
            f.a.create(&f.workspace.root_id, &format!("file-{index:02}"))
                .await?;
        f.a.api
            .update_grants(request(
                &f.workspace.workspace_key,
                UpdateGrantsRequest {
                    workspace_id: f.workspace.workspace_id.clone(),
                    object_id: file.id.clone(),
                    expected_version: file.version,
                    changes: vec![GrantChange {
                        grant: "owner".into(),
                        attached: true,
                    }],
                },
            )?)
            .await?;
        f.a.update(
            &file.id,
            UpdateRequest {
                xattrs: vec![XattrChange {
                    name: "user.big".into(),
                    value: Some(vec![1; 32_000]),
                }],
                ..Default::default()
            },
        )
        .await?;
        ids.insert(file.id);
    }
    for directory in [&f.workspace.root_id, "shared"] {
        let mut after = None;
        let mut seen = std::collections::BTreeSet::new();
        let mut pages = 0;
        loop {
            let page =
                f.a.api
                    .list(request(
                        &f.a.session.session_key,
                        ListRequest {
                            directory_id: directory.into(),
                            after,
                            limit: 1000,
                        },
                    )?)
                    .await?
                    .into_inner();
            let mut bytes = 0;
            for entry in &page.entries {
                let object = entry.object.as_ref().context("entry object")?;
                assert!(seen.insert(object.id.clone()));
                assert_eq!(object.xattrs["user.big"].len(), 32_000);
                bytes += object.xattrs["user.big"].len();
            }
            assert!(bytes <= dfs_protocol::MAX_IO);
            pages += 1;
            after = page.next_after;
            if after.is_none() {
                break;
            }
            assert!(pages <= 3);
        }
        assert!(pages > 1);
        assert_eq!(seen, ids);
    }
    f.cleanup().await
}

async fn background_flushes_during_continued_writes() -> Result<()> {
    let f = Fixture::configured(WritebackConfig {
        writeback_max_age_ms: 150,
        ..Default::default()
    })
    .await?;
    let file = f.a.create(&f.workspace.root_id, "file").await?;
    let stop = Arc::new(AtomicBool::new(false));
    let writer = Client {
        api: f.a.api.clone(),
        session: f.a.session.clone(),
    };
    let id = file.id.clone();
    let stopping = stop.clone();
    let task = tokio::spawn(async move {
        while !stopping.load(Ordering::Relaxed) {
            writer.write(&id, 0, b"background").await?;
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        Ok::<_, anyhow::Error>(())
    });
    let observed = tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if f.b.read(&file.id).await? == b"background" {
                return Ok::<_, anyhow::Error>(());
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await;
    stop.store(true, Ordering::Relaxed);
    task.await??;
    observed??;
    f.cleanup().await
}

async fn local_rename_and_append_drain_prior_edits() -> Result<()> {
    let f = Fixture::new(WritebackConfig::default()).await?;
    let file = f.a.create(&f.workspace.root_id, "before").await?;
    let file = f.a.write(&file.id, 0, b"pending").await?;
    let parent = f.a.stat(&f.workspace.root_id).await?;
    let file = object(
        f.a.api
            .rename(request(
                &f.a.session.session_key,
                RenameRequest {
                    object_id: file.id.clone(),
                    parent_id: parent.id.clone(),
                    name: "after".into(),
                    replace: false,
                    expected: vec![expected(&file), expected(&parent)],
                },
            )?)
            .await?
            .into_inner(),
    )?;
    let found =
        f.b.api
            .lookup(request(
                &f.b.session.session_key,
                LookupRequest {
                    parent_id: parent.id,
                    name: "after".into(),
                },
            )?)
            .await?
            .into_inner();
    assert_eq!(found, file);
    assert_eq!(f.b.read(&file.id).await?, b"pending");
    let file = f.a.write(&file.id, 0, b"updated").await?;
    f.a.api
        .write(request(
            &f.a.session.session_key,
            WriteRequest {
                object_id: file.id.clone(),
                expected_version: file.version,
                append: true,
                data: b"+append".to_vec(),
                offset: 0,
            },
        )?)
        .await?;
    assert_eq!(f.b.read(&file.id).await?, b"updated+append");
    f.cleanup().await
}

async fn search_waits_for_publication_and_filters_dirty_files() -> Result<()> {
    use dfs_server_v2::search::{Search, SearchConfig};
    let f = Fixture::new(WritebackConfig::default()).await?;
    f.a.api.0.drain().await?;
    let es_url = std::env::var("DFS_ES_URL")?;
    let search = Search::open(SearchConfig {
        es_url: es_url.clone(),
        es_index: f.config.fdb_prefix.clone(),
    })?;
    f.a.api
        .0
        .search
        .set(search.clone())
        .map_err(|_| anyhow::anyhow!("search already set"))?;
    let file = f.a.create(&f.workspace.root_id, "text").await?;
    f.a.update(
        &file.id,
        UpdateRequest {
            mime_type: Some("text/plain".into()),
            ..Default::default()
        },
    )
    .await?;
    f.a.write(&file.id, 0, b"beforetoken").await?;
    let status =
        f.a.api
            .get_index_status(request(
                &f.workspace.workspace_key,
                IndexStatusRequest {
                    workspace_id: f.workspace.workspace_id.clone(),
                },
            )?)
            .await?
            .into_inner();
    assert_eq!(
        status.pending, 1,
        "RAM and FDB work for one file must not double-count"
    );
    f.a.sync(&file.id).await?;
    search.start(&f.a.api.0).await?;
    async fn indexed(f: &Fixture) -> Result<()> {
        tokio::time::timeout(Duration::from_secs(15), async {
            loop {
                let status =
                    f.a.api
                        .get_index_status(request(
                            &f.workspace.workspace_key,
                            IndexStatusRequest {
                                workspace_id: f.workspace.workspace_id.clone(),
                            },
                        )?)
                        .await?
                        .into_inner();
                if status.pending == 0 && !status.backfilling {
                    return Ok::<_, anyhow::Error>(());
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        })
        .await??;
        Ok(())
    }
    async fn hits(client: &Client, query: &str) -> Result<SearchFilesResponse> {
        Ok(client
            .api
            .search_files(request(
                &client.session.session_key,
                SearchFilesRequest {
                    query: query.into(),
                    limit: 10,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner())
    }
    indexed(&f).await?;
    assert_eq!(hits(&f.a, "beforetoken").await?.hits.len(), 1);
    f.a.write(&file.id, 0, b"aftertoken").await?;
    f.a.update(
        &file.id,
        UpdateRequest {
            size: Some(10),
            ..Default::default()
        },
    )
    .await?;
    assert!(hits(&f.a, "beforetoken").await?.hits.is_empty());
    assert!(hits(&f.a, "aftertoken").await?.hits.is_empty());
    f.a.sync(&file.id).await?;
    indexed(&f).await?;
    let response = hits(&f.a, "aftertoken").await?;
    assert_eq!(response.hits.len(), 1);
    assert_eq!(
        response.hits[0]
            .object
            .as_ref()
            .context("search object")?
            .version,
        f.a.stat(&file.id).await?.version
    );
    let hidden = Fixture::session(f.a.api.clone(), &f.workspace, "hidden").await?;
    assert!(hits(&hidden, "aftertoken").await?.hits.is_empty());
    f.cleanup().await?;
    reqwest::Client::new()
        .delete(format!(
            "{}/{}",
            es_url.trim_end_matches('/'),
            f.config.fdb_prefix
        ))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

async fn ancestor_move_reauthorizes_pending_edits_without_file_version_changes() -> Result<()> {
    let f = Fixture::new(WritebackConfig::default()).await?;
    let allowed =
        f.a.create_kind(&f.workspace.root_id, "allowed", true)
            .await?;
    let denied =
        f.a.create_kind(&f.workspace.root_id, "denied", true)
            .await?;
    let moving = f.a.create_kind(&allowed.id, "moving", true).await?;
    let file = f.a.create(&moving.id, "file").await?;
    let allowed = f.a.stat(&allowed.id).await?;
    f.a.api
        .update_grants(request(
            &f.workspace.workspace_key,
            UpdateGrantsRequest {
                workspace_id: f.workspace.workspace_id.clone(),
                object_id: allowed.id.clone(),
                expected_version: allowed.version,
                changes: vec![GrantChange {
                    grant: "writer".into(),
                    attached: true,
                }],
            },
        )?)
        .await?;
    let reader = Fixture::session(f.a.api.clone(), &f.workspace, "writer").await?;
    reader
        .write(&file.id, 0, b"must not publish after ancestor move")
        .await?;
    f.b.api
        .rename(request(
            &f.b.session.session_key,
            RenameRequest {
                object_id: moving.id.clone(),
                parent_id: denied.id.clone(),
                name: "moved".into(),
                replace: false,
                expected: vec![
                    expected(&f.b.stat(&moving.id).await?),
                    expected(&f.b.stat(&allowed.id).await?),
                    expected(&f.b.stat(&denied.id).await?),
                ],
            },
        )?)
        .await?;
    assert_eq!(f.b.stat(&file.id).await?.version, file.version);
    assert_eq!(
        code(
            &reader
                .sync(&file.id)
                .await
                .err()
                .context("moved authority remained cached")?
        ),
        ErrorCode::NotFound
    );
    let close = reader
        .api
        .close_session(request(&reader.session.session_key, Empty {})?)
        .await;
    assert_eq!(
        code(&close.err().context("moved edit was silently dropped")?),
        ErrorCode::NotFound
    );
    assert!(f.b.read(&file.id).await?.is_empty());
    f.cleanup().await
}
