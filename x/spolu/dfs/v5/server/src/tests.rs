use super::*;
use anyhow::{Context, Result};
use dfs_protocol::ObjectRef;
use dfs_protocol::Revision;
use dfs_protocol::{
    BLOCK_SIZE,
    error::code,
    rpc::{dfs_server::Dfs, *},
};
use futures::TryStreamExt;
use tonic::Request;
mod batch_reads;
mod client_content;
mod client_directory;
mod client_inline;
mod client_refresh;
mod directory;
mod grants;
mod permissions;
mod tree_log;

// Deterministic network stalls; storage and authorization still use the real FDB fixture.
pub(super) type Pauses = parking_lot::Mutex<std::collections::HashMap<ObjectRef, Arc<Pause>>>;
pub(super) struct Pause {
    entered: tokio::sync::Notify,
    release: Semaphore,
}
pub(super) async fn pause(pauses: &Pauses, changes: &[mutation::Change]) {
    let paused = changes
        .first()
        .and_then(|c| pauses.lock().get(c.primary_id()).cloned());
    if let Some(paused) = paused {
        paused.entered.notify_one();
        if let Ok(permit) = paused.release.acquire().await {
            permit.forget();
        }
    }
}

pub(super) async fn pause_listing(pauses: &Pauses, directory: &ObjectRef) {
    let paused = pauses.lock().get(directory).cloned();
    if let Some(paused) = paused {
        paused.entered.notify_one();
        if let Ok(permit) = paused.release.acquire().await {
            permit.forget();
        }
    }
}

fn request<T>(key: &str, body: T) -> Result<Request<T>> {
    let mut request = Request::new(body);
    request
        .metadata_mut()
        .insert("authorization", format!("Bearer {key}").parse()?);
    Ok(request)
}

struct Fixture {
    api: api::Api,
    owner: Session,
    tenant: Tenant,
    config: storage::StorageConfig,
}
impl Fixture {
    async fn new() -> Result<Self> {
        // These fixtures exercise the complete transactional fallback; RAM authority has its own
        // bounded-staleness and lifecycle suite.
        Self::with_permissions(crate::permissions::Config {
            tree_memory_bytes: 0,
            ..Default::default()
        })
        .await
    }
    async fn with_permissions(permissions: crate::permissions::Config) -> Result<Self> {
        let config = storage::StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v5-test-{}", uuid::Uuid::new_v4().simple()),
        };
        let key = "ab".repeat(32);
        let api = api::Api(State::with_config(
            storage::Storage::open(&config).await?,
            &key,
            Default::default(),
            permissions,
        )?);
        let tenant = api
            .create_tenant(request(
                &key,
                CreateTenantRequest {
                    tenant_id: "test".into(),
                    root_grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let owner = Self::session(&api, &tenant, &["owner"]).await?;
        Ok(Self {
            api,
            owner,
            tenant,
            config,
        })
    }
    async fn session(api: &api::Api, tenant: &Tenant, grants: &[&str]) -> Result<Session> {
        Ok(api
            .create_session(request(
                &tenant.tenant_key,
                CreateSessionRequest {
                    tenant_id: tenant.tenant_id.clone(),
                    grants: grants.iter().map(|v| v.to_string()).collect(),
                },
            )?)
            .await?
            .into_inner())
    }
    async fn peer(&self) -> Result<(api::Api, Session)> {
        let api = api::Api(State::with_config(
            storage::Storage::open(&self.config).await?,
            &"ab".repeat(32),
            Default::default(),
            crate::permissions::Config {
                tree_memory_bytes: 0,
                ..Default::default()
            },
        )?);
        let session = Self::session(&api, &self.tenant, &["owner"]).await?;
        Ok((api, session))
    }
    async fn create(&self, parent: &ObjectRef, name: &str, directory: bool) -> Result<Attr> {
        self.api
            .create(request(
                &self.owner.session_key,
                CreateRequest {
                    parent_id: parent.into(),
                    name: name.into(),
                    directory,
                    mode: 0o755,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner()
            .object
            .context("created object")
    }
    async fn batch(&self, groups: Vec<MutationGroup>) -> Result<Vec<GroupResult>> {
        Ok(self
            .api
            .mutate_batch(request(
                &self.owner.session_key,
                MutateBatchRequest { groups },
            )?)
            .await?
            .into_inner()
            .try_collect()
            .await?)
    }
    async fn read(&self, id: &ObjectRef) -> Result<ReadResponse> {
        Ok(self
            .api
            .read(request(
                &self.owner.session_key,
                ReadRequest {
                    object_id: id.into(),
                    length: (3 * BLOCK_SIZE) as u32,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner())
    }
}
fn edit(operation: edit::Operation) -> Edit {
    Edit {
        operation: Some(operation),
    }
}
fn write(id: &ObjectRef, offset: u64, data: &[u8]) -> Edit {
    edit(edit::Operation::Write(WriteRequest {
        object_id: id.into(),
        offset,
        data: data.into(),
        append: false,
    }))
}
fn truncate(id: &ObjectRef, size: u64) -> Edit {
    edit(edit::Operation::Update(UpdateRequest {
        object_id: id.into(),
        size: Some(size),
        ..Default::default()
    }))
}

#[test]
fn real_fdb_contracts() -> Result<()> {
    network::run(async {
        let f = Fixture::new().await?;
        let dir = f.create(&f.tenant.root_id, "work", true).await?;
        let id = ObjectRef::new_v4();
        let create = edit(edit::Operation::Create(CreateRequest {
            object_id: id,
            parent_id: dir.id,
            name: "file".into(),
            mode: 0o644,
            ..Default::default()
        }));
        let results = f
            .batch(vec![MutationGroup {
                id: 1,
                edits: vec![
                    create,
                    write(&id, 0, b"abcdef"),
                    truncate(&id, 3),
                    truncate(&id, 8),
                    write(&id, 7, b"z"),
                ],
            }])
            .await?;
        assert!(results[0].error.is_none(), "{:?}", results[0]);
        let committed = results[0]
            .mutation
            .as_ref()
            .and_then(|m| m.object.as_ref())
            .context("commit")?;
        assert_eq!(committed.size, 8);
        assert_eq!(committed.revision.len(), 16);
        assert_eq!(f.read(&id).await?.data, b"abc\0\0\0\0z");

        // A different server must see the acknowledged state immediately, without drain or fsync.
        let (peer, peer_session) = f.peer().await?;
        let observed = peer
            .stat_one(request(
                &peer_session.session_key,
                ObjectRequest { object_id: id },
            )?)
            .await?
            .into_inner();
        assert!(observed.read_version >= committed.read_version);
        same_attr(&observed, committed);
        f.api
            .write(request(
                &f.owner.session_key,
                WriteRequest {
                    object_id: id,
                    data: b"X".to_vec(),
                    ..Default::default()
                },
            )?)
            .await?;
        let stale = f
            .api
            .read(request(
                &f.owner.session_key,
                ReadRequest {
                    object_id: id,
                    length: 8,
                    revision: observed.revision,
                    ..Default::default()
                },
            )?)
            .await
            .err()
            .context("changed revision must reject cached view")?;
        assert_eq!(code(&stale), ErrorCode::StaleView);

        // One failing group rolls back its own writes without aborting a different object.
        let other = f.create(&dir.id, "other", false).await?;
        let before = f.read(&id).await?;
        let results = f
            .batch(vec![
                MutationGroup {
                    id: 2,
                    edits: vec![write(&id, 0, b"bad"), truncate(&id, u64::MAX)],
                },
                MutationGroup {
                    id: 3,
                    edits: vec![write(&other.id, 0, b"good")],
                },
            ])
            .await?;
        assert!(
            results
                .iter()
                .find(|r| r.id == 2)
                .context("failed group")?
                .error
                .is_some()
        );
        assert!(
            results
                .iter()
                .find(|r| r.id == 3)
                .context("successful group")?
                .error
                .is_none()
        );
        let after = f.read(&id).await?;
        assert_eq!(after.data, before.data);
        same_attr(&after.object, &before.object);
        assert_eq!(f.read(&other.id).await?.data, b"good");
        let invalid = f
            .batch(vec![MutationGroup {
                id: 4,
                edits: vec![write(&id, 0, b"no"), write(&other.id, 0, b"no")],
            }])
            .await?;
        assert_eq!(
            invalid[0]
                .error
                .as_ref()
                .context("multi-object group rejected")?
                .code,
            ErrorCode::InvalidInput as i32
        );

        // Separate transactions serialize concurrent appends without client version preconditions.
        let mut tasks = Vec::new();
        for n in 0..8 {
            let api = if n % 2 == 0 {
                f.api.clone()
            } else {
                peer.clone()
            };
            let key = if n % 2 == 0 {
                f.owner.session_key.clone()
            } else {
                peer_session.session_key.clone()
            };
            let id = other.id;
            tasks.push(tokio::spawn(async move {
                api.write(request(
                    &key,
                    WriteRequest {
                        object_id: id,
                        data: vec![n],
                        append: true,
                        offset: 0,
                    },
                )?)
                .await?;
                Ok::<_, anyhow::Error>(())
            }));
        }
        for task in tasks {
            task.await??;
        }
        let appended = f.read(&other.id).await?;
        let mut tail = appended.data[4..].to_vec();
        tail.sort();
        assert_eq!(tail, (0..8).collect::<Vec<_>>());

        // Grants and shared discovery remain transactional, without subtree propagation.
        f.api
            .update_grants(request(
                &f.tenant.tenant_key,
                UpdateGrantsRequest {
                    tenant_id: f.tenant.tenant_id.clone(),
                    object_id: dir.id,
                    changes: vec![GrantChange {
                        grant: "reader".into(),
                        attached: true,
                    }],
                },
            )?)
            .await?;
        let reader = Fixture::session(&peer, &f.tenant, &["reader"]).await?;
        let shared = peer
            .list(request(
                &reader.session_key,
                ListRequest {
                    directory_id: ObjectRef::Shared,
                    limit: 64,
                    after: None,
                },
            )?)
            .await?
            .into_inner();
        assert_eq!(shared.entries.len(), 1);
        assert_eq!(shared.entries[0].name, format!("work--{}", dir.id));
        peer.stat_one(request(
            &reader.session_key,
            ObjectRequest { object_id: id },
        )?)
        .await?;
        let hidden = f.create(&f.tenant.root_id, "private", true).await?;
        f.api
            .rename(request(
                &f.owner.session_key,
                RenameRequest {
                    object_id: id,
                    parent_id: hidden.id,
                    name: "moved".into(),
                    replace: false,
                },
            )?)
            .await?;
        assert_eq!(
            code(
                &peer
                    .stat_one(request(
                        &reader.session_key,
                        ObjectRequest { object_id: id }
                    )?)
                    .await
                    .err()
                    .context("moved authority")?
            ),
            ErrorCode::NotFound
        );
        f.api
            .update_grants(request(
                &f.tenant.tenant_key,
                UpdateGrantsRequest {
                    tenant_id: f.tenant.tenant_id.clone(),
                    object_id: dir.id,
                    changes: vec![GrantChange {
                        grant: "reader".into(),
                        attached: false,
                    }],
                },
            )?)
            .await?;
        assert_eq!(
            code(
                &peer
                    .stat_one(request(
                        &reader.session_key,
                        ObjectRequest {
                            object_id: other.id
                        }
                    )?)
                    .await
                    .err()
                    .context("revoked authority")?
            ),
            ErrorCode::NotFound
        );

        // A namespace replacement is atomic and deleted objects cannot be recreated by old writes.
        let victim = f.create(&dir.id, "victim", false).await?;
        f.api
            .rename(request(
                &f.owner.session_key,
                RenameRequest {
                    object_id: other.id,
                    parent_id: dir.id,
                    name: "victim".into(),
                    replace: true,
                },
            )?)
            .await?;
        assert_eq!(
            f.api
                .lookup(request(
                    &f.owner.session_key,
                    LookupRequest {
                        parent_id: dir.id,
                        name: "victim".into(),
                    }
                )?)
                .await?
                .into_inner()
                .object
                .id,
            other.id
        );
        assert_eq!(
            code(
                &f.api
                    .write(request(
                        &f.owner.session_key,
                        WriteRequest {
                            object_id: victim.id,
                            data: vec![1],
                            ..Default::default()
                        }
                    )?)
                    .await
                    .err()
                    .context("deleted target")?
            ),
            ErrorCode::NotFound
        );

        // Tenant-scoped keys prevent a known foreign object ID from granting access.
        let foreign = f
            .api
            .create_tenant(request(
                &"ab".repeat(32),
                CreateTenantRequest {
                    tenant_id: "foreign".into(),
                    root_grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let foreign_session = Fixture::session(&f.api, &foreign, &["owner"]).await?;
        assert_eq!(
            code(
                &f.api
                    .stat_one(request(
                        &foreign_session.session_key,
                        ObjectRequest { object_id: id }
                    )?)
                    .await
                    .err()
                    .context("tenant isolation")?
            ),
            ErrorCode::NotFound
        );
        // Revoke a grant after a writer has read it; commit must reject that authorization proof.
        let snapshot = f.api.0.storage.snapshot().await?;
        let view = read::View::from_snapshot(
            snapshot.clone(),
            &f.tenant.tenant_id,
            std::collections::BTreeSet::from(["owner".into()]),
        )
        .await?;
        let (edit, _) = view
            .write(WriteRequest {
                object_id: other.id,
                data: b"forbidden".to_vec(),
                ..Default::default()
            })
            .await?;
        edit.batch.apply(&snapshot)?;
        drop(view);
        f.api
            .update_grants(request(
                &f.tenant.tenant_key,
                UpdateGrantsRequest {
                    tenant_id: f.tenant.tenant_id.clone(),
                    object_id: f.tenant.root_id,
                    changes: vec![GrantChange {
                        grant: "owner".into(),
                        attached: false,
                    }],
                },
            )?)
            .await?;
        let conflict = storage::commit(snapshot)
            .await
            .err()
            .context("stale authorization must conflict")?;
        assert!(conflict.is_retryable_not_committed());
        client_cache_contracts()
            .await
            .context("client cache contracts")?;
        independent_batch_scheduling().await?;
        tracked_collision().await?;
        concurrent_parent_creates().await?;
        directory::contracts().await?;
        batch_reads::contracts().await?;
        grants::contracts().await?;
        tree_log::contracts().await?;
        permissions::contracts().await?;
        Ok(())
    })
}

async fn concurrent_parent_creates() -> Result<()> {
    use futures::StreamExt;
    for _ in 0..2 {
        let f = Fixture::new().await?;
        let parent = f.create(&f.tenant.root_id, "parent", true).await?;
        let results = futures::stream::iter(0..32)
            .map(|n| {
                let f = &f;
                let parent = &parent;
                async move {
                    let id = ObjectRef::new_v4();
                    let results = f
                        .batch(vec![MutationGroup {
                            id: n,
                            edits: vec![
                                edit(edit::Operation::Create(CreateRequest {
                                    object_id: id,
                                    parent_id: parent.id,
                                    name: format!("file{n}"),
                                    mode: 0o644,
                                    ..Default::default()
                                })),
                                write(&id, 0, &[n as u8]),
                            ],
                        }])
                        .await?;
                    anyhow::ensure!(
                        results[0].error.is_none(),
                        "create failed: {:?}",
                        results[0]
                    );
                    assert_eq!(f.read(&id).await?.data, [n as u8]);
                    Ok::<_, anyhow::Error>(())
                }
            })
            .buffer_unordered(32)
            .try_collect::<Vec<_>>()
            .await?;
        assert_eq!(results.len(), 32);
        let (peer, session) = f.peer().await?;
        let create = CreateRequest {
            parent_id: parent.id,
            name: "same-name".into(),
            mode: 0o644,
            ..Default::default()
        };
        let (a, b) = tokio::join!(
            f.api.create(request(&f.owner.session_key, create.clone())?),
            peer.create(request(&session.session_key, create)?),
        );
        assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
        assert_eq!(
            code(&a.err().or_else(|| b.err()).context("same-name conflict")?),
            ErrorCode::AlreadyExists
        );
        let entries = f
            .api
            .list(request(
                &f.owner.session_key,
                ListRequest {
                    directory_id: parent.id,
                    after: None,
                    limit: 64,
                },
            )?)
            .await?
            .into_inner()
            .entries;
        assert_eq!(entries.len(), 33);
        for n in 0..32 {
            assert!(entries.iter().any(|entry| entry.name == format!("file{n}")));
        }
    }
    Ok(())
}

async fn tracked_collision() -> Result<()> {
    let f = Fixture::new().await?;
    let a = f.create(&f.tenant.root_id, "a", true).await?;
    let b = f.create(&f.tenant.root_id, "b", true).await?;
    let id = ObjectRef::new_v4();
    let create = |parent: &ObjectRef| CreateRequest {
        object_id: id,
        parent_id: parent.into(),
        name: "file".into(),
        mode: 0o644,
        ..Default::default()
    };
    let snapshot = f.api.0.storage.snapshot().await?;
    let view = read::View::from_snapshot(
        snapshot.clone(),
        &f.tenant.tenant_id,
        ["owner".into()].into(),
    )
    .await?;
    assert!(snapshot.get(view.keys.object(&id)?).await?.is_none());
    let (edit, _) = view.create(create(&a.id)).await?;
    edit.batch.apply(&snapshot)?;
    drop(view);
    f.api
        .create(request(&f.owner.session_key, create(&b.id))?)
        .await?;
    let conflict = storage::commit(snapshot)
        .await
        .err()
        .context("UUID absence must remain conflict-tracked")?;
    assert!(conflict.is_retryable_not_committed());

    let unauthorized = Fixture::session(&f.api, &f.tenant, &[]).await?;
    for (key, expected) in [
        (&f.owner.session_key, ErrorCode::AlreadyExists),
        (&unauthorized.session_key, ErrorCode::NotFound),
    ] {
        let error = f
            .api
            .create(request(key, create(&a.id))?)
            .await
            .err()
            .context("collision must not replace or disclose an existing object")?;
        assert_eq!(code(&error), expected);
    }
    let absent = f
        .api
        .lookup(request(
            &f.owner.session_key,
            LookupRequest {
                parent_id: a.id,
                name: "file".into(),
            },
        )?)
        .await
        .err()
        .context("losing create must leave no name binding")?;
    assert_eq!(code(&absent), ErrorCode::NotFound);
    assert_eq!(
        f.api
            .lookup(request(
                &f.owner.session_key,
                LookupRequest {
                    parent_id: b.id,
                    name: "file".into(),
                }
            )?)
            .await?
            .into_inner()
            .object
            .id,
        id
    );
    Ok(())
}

async fn independent_batch_scheduling() -> Result<()> {
    let f = Fixture::new().await?;
    let blocked = f.create(&f.tenant.root_id, "blocked", true).await?;
    let ready = f.create(&f.tenant.root_id, "ready", true).await?;
    let pause = Arc::new(Pause {
        entered: Default::default(),
        release: Semaphore::new(0),
    });
    f.api.0.pauses.lock().insert(blocked.id, pause.clone());
    let groups = (0..64u64)
        .map(|id| MutationGroup {
            id,
            edits: vec![edit(edit::Operation::Create(CreateRequest {
                parent_id: if id == 63 { ready.id } else { blocked.id },
                object_id: ObjectRef::new_v4(),
                name: format!("file-{id}"),
                mode: 0o644,
                ..Default::default()
            }))],
        })
        .collect();
    let mut results = f
        .api
        .mutate_batch(request(
            &f.owner.session_key,
            MutateBatchRequest { groups },
        )?)
        .await?
        .into_inner();
    let first = tokio::time::timeout(std::time::Duration::from_secs(2), results.try_next()).await;
    // Release the stalled parent before reporting failure so a regression cannot strand the fixture.
    f.api.0.pauses.lock().remove(&blocked.id);
    pause.release.add_permits(63);
    let first = first??.context("independent outcome")?;
    assert_eq!(
        first.id, 63,
        "later independent group must bypass blocked siblings"
    );
    assert!(first.error.is_none());
    let remaining: Vec<_> = results.try_collect().await?;
    assert_eq!(remaining.len(), 63);
    assert!(remaining.iter().all(|r| r.error.is_none()));
    f.api.0.drain().await?;
    Ok(())
}

async fn client_cache_contracts() -> Result<()> {
    let fixture = Fixture::new().await?;
    let directory = fixture
        .create(&fixture.tenant.root_id, "cached", true)
        .await?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}", listener.local_addr()?);
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let api = fixture.api.clone();
    let task = tokio::spawn(
        tonic::transport::Server::builder()
            .add_service(dfs_server::DfsServer::new(api))
            .serve_with_incoming_shutdown(transport::incoming(listener), async {
                let _ = stopped.await;
            }),
    );
    let key = fixture.owner.session_key.clone();
    let tenant = fixture.tenant.clone();
    let state = fixture.api.0.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<()> {
        let client = ::dfs_client::CachedClient::connect(
            &endpoint,
            &key,
            ::dfs_client::CacheConfig {
                write_delay_ms: 125,
                ..Default::default()
            },
        )?;
        let observer = ::dfs_client::BlockingClient::connect(&endpoint, &key)?;
        directory_absence_contracts(&endpoint, &key, &tenant.root_id)
            .context("directory absence")?;
        client_refresh::contracts(&endpoint, &key, &tenant, &state).context("pending refresh")?;
        client_directory::contracts(&endpoint, &key, &tenant, &state).context("directory cache")?;
        client_content::contracts(&endpoint, &key, &tenant, &state).context("content cache")?;
        client_inline::contracts(&endpoint, &key, &tenant, &state).context("inline client")?;
        let a = client
            .create(CreateRequest {
                parent_id: directory.id,
                name: "a".into(),
                mode: 0o644,
                ..Default::default()
            })?
            .object
            .context("a")?;
        let b = client
            .create(CreateRequest {
                parent_id: directory.id,
                name: "b".into(),
                mode: 0o644,
                ..Default::default()
            })?
            .object
            .context("b")?;
        client.write(WriteRequest {
            object_id: a.id,
            data: b"local".to_vec(),
            ..Default::default()
        })?;
        client.write(WriteRequest {
            object_id: b.id,
            data: b"other".to_vec(),
            ..Default::default()
        })?;
        let read = |id: &ObjectRef| ReadRequest {
            object_id: id.into(),
            length: 64,
            ..Default::default()
        };
        assert_eq!(client.read(read(&a.id))?.data, b"local");
        assert_eq!(
            code(
                &observer
                    .stat_one(ObjectRequest { object_id: a.id })
                    .err()
                    .context("RAM create")?
            ),
            ErrorCode::NotFound
        );
        client.fsync(ObjectRequest { object_id: a.id })?;
        assert_eq!(observer.read(read(&a.id))?.data, b"local");
        assert_eq!(
            code(
                &observer
                    .stat_one(ObjectRequest { object_id: b.id })
                    .err()
                    .context("object fsync must not flush sibling")?
            ),
            ErrorCode::NotFound
        );
        client.fsync(ObjectRequest { object_id: b.id })?;
        assert_eq!(observer.read(read(&b.id))?.data, b"other");

        // An unrelated RPC stays stalled beyond C while fsync of A completes independently.
        let stalled = Arc::new(Pause {
            entered: Default::default(),
            release: Semaphore::new(0),
        });
        state.pauses.lock().insert(b.id, stalled.clone());
        client.write(WriteRequest {
            object_id: b.id,
            data: b"wait".to_vec(),
            ..Default::default()
        })?;
        let waiting = client.clone();
        let b_id = b.id;
        let blocked = std::thread::spawn(move || waiting.fsync(ObjectRequest { object_id: b_id }));
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?;
        runtime.block_on(async {
            tokio::time::timeout(
                std::time::Duration::from_secs(3),
                stalled.entered.notified(),
            )
            .await
        })?;
        client.write(WriteRequest {
            object_id: a.id,
            data: b"local".to_vec(),
            ..Default::default()
        })?;
        let started = std::time::Instant::now();
        let synced = client.fsync(ObjectRequest { object_id: a.id });
        stalled.release.add_permits(1);
        state.pauses.lock().remove(&b.id);
        blocked
            .join()
            .map_err(|_| anyhow::anyhow!("blocked fsync panicked"))??;
        synced?;
        assert!(started.elapsed() < std::time::Duration::from_secs(2));

        // Dirty writes share the total budget and must keep making progress while preserving bytes.
        let small = ::dfs_client::CachedClient::connect(
            &endpoint,
            &key,
            ::dfs_client::CacheConfig {
                cache_mib: 128,
                write_delay_ms: 125,
                ..Default::default()
            },
        )?;
        let large = small
            .create(CreateRequest {
                parent_id: directory.id,
                name: "pressure".into(),
                mode: 0o644,
                ..Default::default()
            })?
            .object
            .context("pressure file")?;
        for block in 0..64u64 {
            small
                .write(WriteRequest {
                    object_id: large.id,
                    offset: block * 262144,
                    data: vec![block as u8; 262144],
                    append: false,
                })
                .context("memory pressure write")?;
        }
        small
            .fsync(ObjectRequest {
                object_id: large.id,
            })
            .context("memory pressure fsync")?;
        for block in 0..64u64 {
            assert_eq!(
                observer
                    .read(ReadRequest {
                        object_id: large.id,
                        offset: block * 262144,
                        length: 262144,
                        revision: Revision::default()
                    })?
                    .data,
                vec![block as u8; 262144]
            );
        }
        small.drain()?;

        // A losing create fails its dependent file, but an orderly drain still publishes other work.
        let losing = ::dfs_client::CachedClient::connect(
            &endpoint,
            &key,
            ::dfs_client::CacheConfig {
                write_delay_ms: 125,
                ..Default::default()
            },
        )?;
        let create_dir = CreateRequest {
            parent_id: directory.id,
            name: "collision".into(),
            directory: true,
            mode: 0o755,
            ..Default::default()
        };
        let folder = losing
            .create(create_dir.clone())?
            .object
            .context("tentative folder")?;
        let child = losing
            .create(CreateRequest {
                parent_id: folder.id,
                name: "child".into(),
                mode: 0o644,
                ..Default::default()
            })?
            .object
            .context("dependent child")?;
        observer.create(create_dir)?;
        assert_eq!(
            code(
                &losing
                    .fsync(ObjectRequest {
                        object_id: child.id
                    })
                    .err()
                    .context("failed prerequisite")?
            ),
            ErrorCode::AlreadyExists
        );
        assert_eq!(
            code(
                &observer
                    .stat_one(ObjectRequest {
                        object_id: child.id
                    })
                    .err()
                    .context("child absent")?
            ),
            ErrorCode::NotFound
        );
        assert_eq!(
            code(
                &losing
                    .fsync(ObjectRequest {
                        object_id: directory.id
                    })
                    .err()
                    .context("directory deferred failure")?
            ),
            ErrorCode::AlreadyExists
        );
        let survivor = losing
            .create(CreateRequest {
                parent_id: directory.id,
                name: "survivor".into(),
                mode: 0o644,
                ..Default::default()
            })?
            .object
            .context("survivor")?;
        assert!(losing.drain().is_err());
        assert_eq!(
            observer
                .stat_one(ObjectRequest {
                    object_id: survivor.id
                })?
                .id,
            survivor.id
        );

        // Revocation is enforced after the client TTL, even when content blocks remain resident.
        let admin = ::dfs_client::BlockingClient::connect(&endpoint, &tenant.tenant_key)?;
        let grant = |attached| UpdateGrantsRequest {
            tenant_id: tenant.tenant_id.clone(),
            object_id: directory.id,
            changes: vec![GrantChange {
                grant: "reader".into(),
                attached,
            }],
        };
        admin.update_grants(grant(true))?;
        let session = admin.create_session(CreateSessionRequest {
            tenant_id: tenant.tenant_id.clone(),
            grants: vec!["reader".into()],
        })?;
        let reader = ::dfs_client::CachedClient::connect(
            &endpoint,
            &session.session_key,
            ::dfs_client::CacheConfig {
                cache_ttl_ms: 50,
                ..Default::default()
            },
        )?;
        assert_eq!(reader.read(read(&a.id))?.data, b"local");
        admin.update_grants(grant(false))?;
        std::thread::sleep(std::time::Duration::from_millis(75));
        assert_eq!(
            code(
                &reader
                    .read(read(&a.id))
                    .err()
                    .context("revoked cached access")?
            ),
            ErrorCode::NotFound
        );

        // Revalidating an unchanged revision must retain its content blocks.
        assert_eq!(client.read(read(&a.id))?.data, b"local");
        let content_calls = || {
            ["rpc.read", "rpc.read_files"]
                .into_iter()
                .map(|name| {
                    client.metrics()["dfs_client_metrics"][name]["calls"]
                        .as_u64()
                        .unwrap_or(0)
                })
                .sum::<u64>()
        };
        let reads = content_calls();
        std::thread::sleep(std::time::Duration::from_millis(1050));
        assert_eq!(client.read(read(&a.id))?.data, b"local");
        assert_eq!(content_calls(), reads);
        observer.write(WriteRequest {
            object_id: a.id,
            data: b"fresh".to_vec(),
            ..Default::default()
        })?;
        std::thread::sleep(std::time::Duration::from_millis(1050));
        assert_eq!(client.read(read(&a.id))?.data, b"fresh");
        assert!(content_calls() > reads);

        // Local truncate/re-extension and sparse writes must remain coherent before publication.
        client.update(UpdateRequest {
            object_id: a.id,
            size: Some(2),
            ..Default::default()
        })?;
        client.update(UpdateRequest {
            object_id: a.id,
            size: Some(8),
            ..Default::default()
        })?;
        client.write(WriteRequest {
            object_id: a.id,
            offset: 7,
            data: vec![b'z'],
            append: false,
        })?;
        assert_eq!(client.read(read(&a.id))?.data, b"fr\0\0\0\0\0z");
        client.fsync(ObjectRequest { object_id: a.id })?;
        assert_eq!(observer.read(read(&a.id))?.data, b"fr\0\0\0\0\0z");

        // An external unlink causes a deferred write failure; no stale handle recreates the file.
        observer.remove(RemoveRequest {
            object_id: a.id,
            directory: false,
        })?;
        client.write(WriteRequest {
            object_id: a.id,
            data: b"lost".to_vec(),
            ..Default::default()
        })?;
        assert_eq!(
            code(
                &client
                    .fsync(ObjectRequest { object_id: a.id })
                    .err()
                    .context("unlink failure")?
            ),
            ErrorCode::NotFound
        );
        assert!(
            client
                .write(WriteRequest {
                    object_id: a.id,
                    data: vec![1],
                    ..Default::default()
                })
                .is_err()
        );
        assert_eq!(
            code(
                &observer
                    .stat_one(ObjectRequest { object_id: a.id })
                    .err()
                    .context("no resurrection")?
            ),
            ErrorCode::NotFound
        );
        assert!(client.drain().is_err());
        Ok(())
    })
    .await?;
    let _ = stop.send(());
    task.await??;
    result
}

fn directory_absence_contracts(endpoint: &str, key: &str, root: &ObjectRef) -> Result<()> {
    let observer = ::dfs_client::BlockingClient::connect(endpoint, key)?;
    let client = ::dfs_client::CachedClient::connect(
        endpoint,
        key,
        ::dfs_client::CacheConfig {
            write_delay_ms: 125,
            ..Default::default()
        },
    )?;
    let create = |parent: &ObjectRef, name: &str, directory| CreateRequest {
        parent_id: parent.into(),
        name: name.into(),
        directory,
        mode: 0o755,
        ..Default::default()
    };
    let lookup = |parent: &ObjectRef, name: &str| LookupRequest {
        parent_id: parent.into(),
        name: name.into(),
    };
    let calls = || {
        client.metrics()["dfs_client_metrics"]["rpc.lookup"]["calls"]
            .as_u64()
            .unwrap_or(0)
    };
    let directory = observer
        .create(create(root, "absence", true))?
        .object
        .context("directory")?;
    let listing = ListRequest {
        directory_id: directory.id,
        after: None,
        limit: 64,
    };
    assert!(client.list(listing.clone())?.entries.is_empty());
    let before = calls();
    let a = client
        .create(create(&directory.id, "a", false))?
        .object
        .context("a")?;
    let folder = client
        .create(create(&directory.id, "folder", true))?
        .object
        .context("folder")?;
    let child = client
        .create(create(&folder.id, "child", false))?
        .object
        .context("child")?;
    assert_eq!(client.lookup(lookup(&folder.id, "child"))?.id, child.id);
    assert_eq!(
        code(
            &client
                .create(create(&folder.id, "child", false))
                .err()
                .context("duplicate")?
        ),
        ErrorCode::AlreadyExists
    );
    client.rename_from(
        directory.id,
        "a".into(),
        RenameRequest {
            object_id: a.id,
            parent_id: directory.id,
            name: "renamed".into(),
            replace: false,
        },
    )?;
    assert_eq!(client.lookup(lookup(&directory.id, "renamed"))?.id, a.id);
    assert_eq!(
        code(
            &client
                .lookup(lookup(&directory.id, "a"))
                .err()
                .context("old name")?
        ),
        ErrorCode::NotFound
    );
    client.remove_at(
        directory.id,
        "renamed".into(),
        RemoveRequest {
            object_id: a.id,
            directory: false,
        },
    )?;
    client.drain()?;
    assert_eq!(
        code(
            &client
                .lookup(lookup(&directory.id, "another-missing"))
                .err()
                .context("missing")?
        ),
        ErrorCode::NotFound
    );
    assert_eq!(
        calls(),
        before,
        "listings and new directories must eliminate missing-name RPCs"
    );

    // An external create can be hidden only until the original listing deadline, even after a hit.
    client.list(listing.clone())?;
    let external = observer
        .create(create(&directory.id, "external", false))?
        .object
        .context("external")?;
    assert_eq!(
        code(
            &client
                .lookup(lookup(&directory.id, "external"))
                .err()
                .context("cached absence")?
        ),
        ErrorCode::NotFound
    );
    std::thread::sleep(std::time::Duration::from_millis(1050));
    assert_eq!(
        client.lookup(lookup(&directory.id, "external"))?.id,
        external.id
    );
    assert_eq!(
        calls(),
        before,
        "a listing refresh resolves the external create without point lookups"
    );

    // The commit still checks uniqueness when the cached absence races with another writer.
    client.list(listing)?;
    let external = observer
        .create(create(&directory.id, "collision", false))?
        .object
        .context("winner")?;
    let tentative = client
        .create(create(&directory.id, "collision", false))?
        .object
        .context("tentative")?;
    assert_eq!(
        code(
            &client
                .fsync(ObjectRequest {
                    object_id: tentative.id
                })
                .err()
                .context("collision")?
        ),
        ErrorCode::AlreadyExists
    );
    assert_eq!(
        observer.lookup(lookup(&directory.id, "collision"))?.id,
        external.id
    );
    assert!(client.drain().is_err());
    Ok(())
}

fn same_attr(left: &Attr, right: &Attr) {
    let mut left = left.clone();
    let mut right = right.clone();
    left.read_version = 0;
    right.read_version = 0;
    assert_eq!(left, right);
}
