use super::*;
use anyhow::{Context, Result};
use dfs_protocol::{
    BLOCK_SIZE,
    error::code,
    rpc::{dfs_server::Dfs, *},
};
use futures::TryStreamExt;
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
        let config = storage::StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v4-test-{}", uuid::Uuid::new_v4().simple()),
        };
        let key = "ab".repeat(32);
        let api = api::Api(State::new(storage::Storage::open(&config).await?, &key)?);
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
        let api = api::Api(State::new(
            storage::Storage::open(&self.config).await?,
            &"ab".repeat(32),
        )?);
        let session = Self::session(&api, &self.tenant, &["owner"]).await?;
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
    async fn read(&self, id: &str) -> Result<ReadResponse> {
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
fn write(id: &str, offset: u64, data: &[u8]) -> Edit {
    edit(edit::Operation::Write(WriteRequest {
        object_id: id.into(),
        offset,
        data: data.into(),
        append: false,
    }))
}
fn truncate(id: &str, size: u64) -> Edit {
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
        let id = uuid::Uuid::new_v4().simple().to_string();
        let create = edit(edit::Operation::Create(CreateRequest {
            object_id: id.clone(),
            parent_id: dir.id.clone(),
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
            .stat(request(
                &peer_session.session_key,
                ObjectRequest {
                    object_id: id.clone(),
                },
            )?)
            .await?
            .into_inner();
        assert_eq!(observed, *committed);
        f.api
            .write(request(
                &f.owner.session_key,
                WriteRequest {
                    object_id: id.clone(),
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
                    object_id: id.clone(),
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
        assert_eq!(f.read(&id).await?, before);
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
            let id = other.id.clone();
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
                    object_id: dir.id.clone(),
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
                    directory_id: "shared".into(),
                    limit: 64,
                    after: None,
                },
            )?)
            .await?
            .into_inner();
        assert_eq!(shared.entries.len(), 1);
        assert_eq!(shared.entries[0].name, format!("work--{}", dir.id));
        peer.stat(request(
            &reader.session_key,
            ObjectRequest {
                object_id: id.clone(),
            },
        )?)
        .await?;
        let hidden = f.create(&f.tenant.root_id, "private", true).await?;
        f.api
            .rename(request(
                &f.owner.session_key,
                RenameRequest {
                    object_id: id.clone(),
                    parent_id: hidden.id,
                    name: "moved".into(),
                    replace: false,
                },
            )?)
            .await?;
        assert_eq!(
            code(
                &peer
                    .stat(request(
                        &reader.session_key,
                        ObjectRequest {
                            object_id: id.clone()
                        }
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
                    object_id: dir.id.clone(),
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
                    .stat(request(
                        &reader.session_key,
                        ObjectRequest {
                            object_id: other.id.clone()
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
                    object_id: other.id.clone(),
                    parent_id: dir.id.clone(),
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
                        parent_id: dir.id.clone(),
                        name: "victim".into(),
                    }
                )?)
                .await?
                .into_inner()
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
                    .stat(request(
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
                object_id: other.id.clone(),
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
                    object_id: f.tenant.root_id.clone(),
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
        Ok(())
    })
}
