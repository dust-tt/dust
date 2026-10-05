use super::*;
use anyhow::{Context, Result};
use dfs_protocol::{
    BLOCK_SIZE,
    error::code,
    rpc::{dfs_server::Dfs, *},
};
use std::{sync::atomic::Ordering, time::Duration};
use tonic::Request;

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
        Self::configured(cache::CacheConfig::default()).await
    }
    async fn configured(cache_config: cache::CacheConfig) -> Result<Self> {
        let config = storage::StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v3-test-{}", uuid::Uuid::new_v4().simple()),
        };
        let server_key = "ab".repeat(32);
        let state = State::new(
            storage::Storage::open(&config).await?,
            &server_key,
            cache_config,
        )?;
        let api = api::Api(state);
        let tenant = api
            .create_tenant(request(
                &server_key,
                CreateTenantRequest {
                    tenant_id: "test".into(),
                    root_grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let owner = api
            .create_session(request(
                &tenant.tenant_key,
                CreateSessionRequest {
                    tenant_id: tenant.tenant_id.clone(),
                    grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        Ok(Self {
            api,
            owner,
            tenant,
            config,
        })
    }
    async fn peer(&self) -> Result<(api::Api, Session)> {
        let state = State::new(
            storage::Storage::open(&self.config).await?,
            &"ab".repeat(32),
            cache::CacheConfig::default(),
        )?;
        let api = api::Api(state);
        let session = api
            .create_session(request(
                &self.tenant.tenant_key,
                CreateSessionRequest {
                    tenant_id: self.tenant.tenant_id.clone(),
                    grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        Ok((api, session))
    }
    async fn create(&self, parent: &str, name: &str, directory: bool) -> Result<Object> {
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
            .context("create object")
    }
    async fn write(&self, id: &str, offset: u64, data: Vec<u8>) -> Result<Object> {
        self.api
            .write(request(
                &self.owner.session_key,
                WriteRequest {
                    object_id: id.into(),
                    offset,
                    data,
                    append: false,
                },
            )?)
            .await?
            .into_inner()
            .object
            .context("write object")
    }
    async fn read(&self, id: &str) -> Result<ReadResponse> {
        Ok(self
            .api
            .read(request(
                &self.owner.session_key,
                ReadRequest {
                    object_id: id.into(),
                    offset: 0,
                    length: 3 * BLOCK_SIZE as u32,
                },
            )?)
            .await?
            .into_inner())
    }
    async fn sync(&self, id: &str) -> Result<Object> {
        Ok(self
            .api
            .fsync(request(
                &self.owner.session_key,
                ObjectRequest {
                    object_id: id.into(),
                },
            )?)
            .await?
            .into_inner())
    }
    async fn clean(self) -> Result<()> {
        self.api
            .0
            .storage
            .transact(|_| async {
                let mut b = storage::WriteBatch::new();
                b.clear(vec![], vec![255]);
                Ok((b, ()))
            })
            .await?;
        Ok(())
    }
}

#[test]
fn local_filesystem_contracts() -> Result<()> {
    network::run(async {
        ram_acceptance_and_sparse_publication()
            .await
            .context("RAM/sparse")?;
        grants_namespace_and_tenant_isolation()
            .await
            .context("grants/namespace")?;
        independent_servers_and_deleted_writer()
            .await
            .context("independent writers")?;
        create_bundles_initial_writes_without_merging_siblings()
            .await
            .context("create bundling")?;
        lost_commit_reply_is_not_replayed()
            .await
            .context("ambiguous publication")?;
        expired_fdb_read_refreshes_before_cache_ttl()
            .await
            .context("early FDB expiry")?;
        capacity_and_cold_recovery()
            .await
            .context("capacity/restart")?;
        remote_namespace_and_grants_expire()
            .await
            .context("remote namespace/grants")?;
        expired_pending_is_discarded()
            .await
            .context("publication deadline")?;
        Ok(())
    })
}
async fn ram_acceptance_and_sparse_publication() -> Result<()> {
    let f = Fixture::new().await?;
    f.api.0.cache.paused.store(true, Ordering::Release);
    let file = f.create(&f.tenant.root_id, "ram", false).await?;
    f.write(&file.id, 0, b"prefix".to_vec()).await?;
    f.write(&file.id, BLOCK_SIZE as u64 + 2, b"tail".to_vec())
        .await?;
    let accepted = f.sync(&file.id).await?;
    assert_eq!(accepted.size, BLOCK_SIZE as u64 + 6);
    let data = f.read(&file.id).await?;
    assert_eq!(data.data.len(), data.size as usize);
    assert_eq!(&data.data[..6], b"prefix");
    assert!(data.data[6..BLOCK_SIZE + 2].iter().all(|v| *v == 0));
    assert_eq!(&data.data[BLOCK_SIZE + 2..], b"tail");
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    assert!(
        f.api.0.storage.get(keys.object(&file.id)?).await?.is_none(),
        "fsync persisted despite paused publisher"
    );
    f.api
        .update(request(
            &f.owner.session_key,
            UpdateRequest {
                object_id: file.id.clone(),
                size: Some(3),
                ..Default::default()
            },
        )?)
        .await?;
    f.api
        .update(request(
            &f.owner.session_key,
            UpdateRequest {
                object_id: file.id.clone(),
                size: Some(BLOCK_SIZE as u64 + 9),
                ..Default::default()
            },
        )?)
        .await?;
    let data = f.read(&file.id).await?;
    assert_eq!(&data.data[..3], b"pre");
    assert!(data.data[3..].iter().all(|v| *v == 0));
    f.api.0.cache.paused.store(false, Ordering::Release);
    f.api.0.cache.drain().await?;
    let (peer, session) = f.peer().await?;
    let committed = peer
        .read(request(
            &session.session_key,
            ReadRequest {
                object_id: file.id.clone(),
                offset: 0,
                length: 3 * BLOCK_SIZE as u32,
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(committed, data);
    peer.0.drain().await?;
    f.clean().await
}
async fn grants_namespace_and_tenant_isolation() -> Result<()> {
    let f = Fixture::new().await?;
    let directory = f.create(&f.tenant.root_id, "folder", true).await?;
    let file = f.create(&directory.id, "file", false).await?;
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: directory.id.clone(),
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached: true,
                }],
            },
        )?)
        .await?;
    let reader = f
        .api
        .create_session(request(
            &f.tenant.tenant_key,
            CreateSessionRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    let shared = f
        .api
        .list(request(
            &reader.session_key,
            ListRequest {
                directory_id: "shared".into(),
                limit: 100,
                ..Default::default()
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(shared.entries.len(), 1);
    assert_eq!(shared.entries[0].name, format!("folder--{}", directory.id));
    f.api
        .stat(request(
            &reader.session_key,
            ObjectRequest {
                object_id: file.id.clone(),
            },
        )?)
        .await?;
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: directory.id.clone(),
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached: false,
                }],
            },
        )?)
        .await?;
    let denied = f
        .api
        .stat(request(
            &reader.session_key,
            ObjectRequest {
                object_id: file.id.clone(),
            },
        )?)
        .await
        .err()
        .context("revocation ignored")?;
    assert_eq!(code(&denied), ErrorCode::NotFound);
    f.api
        .rename(request(
            &f.owner.session_key,
            RenameRequest {
                object_id: file.id.clone(),
                parent_id: f.tenant.root_id.clone(),
                name: "moved".into(),
                replace: false,
            },
        )?)
        .await?;
    let moved = f
        .api
        .lookup(request(
            &f.owner.session_key,
            LookupRequest {
                parent_id: f.tenant.root_id.clone(),
                name: "moved".into(),
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(moved.id, file.id);
    f.api
        .remove(request(
            &f.owner.session_key,
            RemoveRequest {
                object_id: directory.id,
                directory: true,
            },
        )?)
        .await?;
    f.api.0.cache.drain().await?;
    let other = f
        .api
        .create_tenant(request(
            &"ab".repeat(32),
            CreateTenantRequest {
                tenant_id: "other".into(),
                root_grants: vec!["owner".into()],
            },
        )?)
        .await?
        .into_inner();
    let other_session = f
        .api
        .create_session(request(
            &other.tenant_key,
            CreateSessionRequest {
                tenant_id: other.tenant_id,
                grants: vec!["owner".into()],
            },
        )?)
        .await?
        .into_inner();
    let denied = f
        .api
        .stat(request(
            &other_session.session_key,
            ObjectRequest { object_id: file.id },
        )?)
        .await
        .err()
        .context("cross tenant access")?;
    assert_eq!(code(&denied), ErrorCode::NotFound);
    f.clean().await
}
async fn independent_servers_and_deleted_writer() -> Result<()> {
    let f = Fixture::new().await?;
    let file = f.create(&f.tenant.root_id, "race", false).await?;
    f.write(&file.id, 0, b"first".to_vec()).await?;
    f.api.0.cache.drain().await?;
    let (peer, session) = f.peer().await?;
    peer.read(request(
        &session.session_key,
        ReadRequest {
            object_id: file.id.clone(),
            offset: 0,
            length: 100,
        },
    )?)
    .await?;
    f.write(&file.id, 0, b"other".to_vec()).await?;
    f.api.0.cache.drain().await?;
    tokio::time::sleep(Duration::from_millis(510)).await;
    let updated = peer
        .read(request(
            &session.session_key,
            ReadRequest {
                object_id: file.id.clone(),
                offset: 0,
                length: 100,
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(updated.data, b"other");
    f.api.0.cache.paused.store(true, Ordering::Release);
    f.write(&file.id, 0, b"loser".to_vec()).await?;
    f.sync(&file.id).await?;
    peer.remove(request(
        &session.session_key,
        RemoveRequest {
            object_id: file.id.clone(),
            directory: false,
        },
    )?)
    .await?;
    peer.0.cache.drain().await?;
    f.api.0.cache.paused.store(false, Ordering::Release);
    assert!(f.api.0.cache.drain().await.is_err());
    assert!(f.sync(&file.id).await.is_err());
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    assert!(f.api.0.storage.get(keys.object(&file.id)?).await?.is_none());
    let absent = f
        .api
        .stat(request(
            &f.owner.session_key,
            ObjectRequest { object_id: file.id },
        )?)
        .await
        .err()
        .context("resurrected object")?;
    assert_eq!(code(&absent), ErrorCode::NotFound);
    f.clean().await
}
async fn expired_pending_is_discarded() -> Result<()> {
    let f = Fixture::new().await?;
    let file = f.create(&f.tenant.root_id, "deadline", false).await?;
    f.api.0.cache.drain().await?;
    f.api.0.cache.paused.store(true, Ordering::Release);
    f.write(&file.id, 0, b"tentative".to_vec()).await?;
    f.sync(&file.id).await?;
    tokio::time::sleep(Duration::from_millis(520)).await;
    assert!(f.sync(&file.id).await.is_err());
    assert!(f.read(&file.id).await?.data.is_empty());
    f.api.0.cache.paused.store(false, Ordering::Release);
    f.clean().await
}

async fn create_bundles_initial_writes_without_merging_siblings() -> Result<()> {
    let f = Fixture::new().await?;
    f.api.0.cache.paused.store(true, Ordering::Release);
    let first = f.create(&f.tenant.root_id, "first", false).await?;
    f.write(&first.id, 0, b"one".to_vec()).await?;
    f.write(&first.id, 3, b"two".to_vec()).await?;
    f.sync(&first.id).await?;
    let second = f.create(&f.tenant.root_id, "second", false).await?;
    f.write(&second.id, 0, b"other".to_vec()).await?;
    assert_eq!(f.api.0.cache.commits(), 0);
    f.api.0.cache.paused.store(false, Ordering::Release);
    f.api.0.cache.drain().await?;
    assert_eq!(
        f.api.0.cache.commits(),
        2,
        "Each create absorbs only its own initial writes."
    );
    assert_eq!(f.read(&first.id).await?.data, b"onetwo");
    assert_eq!(f.read(&second.id).await?.data, b"other");
    // A file edit's authorization may read the parent while a sibling create modifies that parent.
    f.api.0.cache.paused.store(true, Ordering::Release);
    f.write(&first.id, 0, b"new".to_vec()).await?;
    f.create(&f.tenant.root_id, "third", false).await?;
    f.api.0.cache.paused.store(false, Ordering::Release);
    f.api.0.cache.drain().await?;
    assert_eq!(f.read(&first.id).await?.data, b"newtwo");
    f.clean().await
}

async fn lost_commit_reply_is_not_replayed() -> Result<()> {
    let f = Fixture::new().await?;
    let file = f.create(&f.tenant.root_id, "unknown", false).await?;
    let other = f.create(&f.tenant.root_id, "independent", false).await?;
    f.api.0.cache.drain().await?;
    f.api.0.cache.paused.store(true, Ordering::Release);
    f.write(&file.id, 0, b"committed".to_vec()).await?;
    f.sync(&file.id).await?;
    f.api
        .0
        .cache
        .lose_commit_reply
        .store(true, Ordering::Release);
    f.api.0.cache.paused.store(false, Ordering::Release);
    assert!(f.api.0.cache.drain().await.is_err());
    assert!(f.sync(&file.id).await.is_err());
    // An unknown reply forces an authoritative reload, not replay or resurrection of the overlay.
    assert_eq!(f.read(&file.id).await?.data, b"committed");
    let before = f.api.0.cache.commits();
    f.write(&other.id, 0, b"unaffected".to_vec()).await?;
    f.sync(&other.id).await?;
    assert!(
        f.api.0.cache.drain().await.is_err(),
        "The original receipt remains."
    );
    assert_eq!(f.api.0.cache.commits(), before + 1);
    let (peer, session) = f.peer().await?;
    assert_eq!(
        peer.read(request(
            &session.session_key,
            ReadRequest {
                object_id: file.id,
                offset: 0,
                length: 100,
            }
        )?)
        .await?
        .into_inner()
        .data,
        b"committed"
    );
    f.clean().await
}

async fn capacity_and_cold_recovery() -> Result<()> {
    let f = Fixture::configured(cache::CacheConfig {
        cache_mib: 16,
        dirty_mib: 1,
        ..Default::default()
    })
    .await?;
    let file = f.create(&f.tenant.root_id, "durable", false).await?;
    f.api.0.cache.drain().await?;
    f.api.0.cache.paused.store(true, Ordering::Release);
    assert!(
        f.write(&file.id, 0, vec![1; dfs_protocol::MAX_IO])
            .await
            .is_err()
    );
    assert_eq!(
        f.sync(&file.id).await?.size,
        0,
        "Capacity fails before acceptance."
    );
    let pending = f.create(&f.tenant.root_id, "ram-only", false).await?;
    f.write(&pending.id, 0, b"lost".to_vec()).await?;
    f.sync(&pending.id).await?;
    let (peer, session) = f.peer().await?;
    drop(f);
    let result = peer
        .stat(request(
            &session.session_key,
            ObjectRequest {
                object_id: pending.id,
            },
        )?)
        .await;
    assert_eq!(
        code(&result.err().context("Recovered uncommitted RAM")?),
        ErrorCode::NotFound
    );
    assert_eq!(
        peer.stat(request(
            &session.session_key,
            ObjectRequest { object_id: file.id }
        )?)
        .await?
        .into_inner()
        .size,
        0
    );
    peer.0
        .storage
        .transact(|_| async {
            let mut b = storage::WriteBatch::new();
            b.clear(vec![], vec![255]);
            Ok((b, ()))
        })
        .await?;
    Ok(())
}
async fn remote_namespace_and_grants_expire() -> Result<()> {
    let f = Fixture::new().await?;
    let directory = f.create(&f.tenant.root_id, "visible", true).await?;
    let file = f.create(&directory.id, "file", false).await?;
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: directory.id.clone(),
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached: true,
                }],
            },
        )?)
        .await?;
    f.api.0.cache.drain().await?;
    let (peer, owner) = f.peer().await?;
    let reader = peer
        .create_session(request(
            &f.tenant.tenant_key,
            CreateSessionRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    peer.stat(request(
        &reader.session_key,
        ObjectRequest {
            object_id: file.id.clone(),
        },
    )?)
    .await?;
    assert!(
        peer.lookup(request(
            &owner.session_key,
            LookupRequest {
                parent_id: f.tenant.root_id.clone(),
                name: "moved".into(),
            }
        )?)
        .await
        .is_err()
    );
    f.api
        .rename(request(
            &f.owner.session_key,
            RenameRequest {
                object_id: directory.id.clone(),
                parent_id: f.tenant.root_id.clone(),
                name: "moved".into(),
                replace: false,
            },
        )?)
        .await?;
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: directory.id.clone(),
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached: false,
                }],
            },
        )?)
        .await?;
    f.api.0.cache.drain().await?;
    tokio::time::sleep(Duration::from_millis(510)).await;
    assert_eq!(
        peer.lookup(request(
            &owner.session_key,
            LookupRequest {
                parent_id: f.tenant.root_id.clone(),
                name: "moved".into(),
            }
        )?)
        .await?
        .into_inner()
        .id,
        directory.id
    );
    assert_eq!(
        code(
            &peer
                .stat(request(
                    &reader.session_key,
                    ObjectRequest { object_id: file.id }
                )?)
                .await
                .err()
                .context("Stale inherited grant")?
        ),
        ErrorCode::NotFound
    );
    assert!(
        peer.list(request(
            &reader.session_key,
            ListRequest {
                directory_id: "shared".into(),
                limit: 100,
                ..Default::default()
            }
        )?)
        .await?
        .into_inner()
        .entries
        .is_empty()
    );
    f.clean().await
}

async fn expired_fdb_read_refreshes_before_cache_ttl() -> Result<()> {
    let f = Fixture::configured(cache::CacheConfig {
        max_eventual_consistency_delay_ms: 8000,
        ..Default::default()
    })
    .await?;
    let warm = f.create(&f.tenant.root_id, "warm", false).await?;
    let cold = f.create(&f.tenant.root_id, "cold", false).await?;
    f.api.0.cache.drain().await?;
    f.api.0.cache.invalidate_base().await;
    f.sync(&warm.id).await?;
    let old = f.api.0.cache.expire_read_transaction().await?;
    assert!(
        !old.expired(),
        "The native error has not been observed yet."
    );
    let object = f
        .api
        .stat(request(
            &f.owner.session_key,
            ObjectRequest {
                object_id: cold.id.clone(),
            },
        )?)
        .await?
        .into_inner();
    assert!(
        old.expired(),
        "The cold read must encounter native FDB expiry."
    );
    assert_eq!(object.id, cold.id);
    f.clean().await
}
