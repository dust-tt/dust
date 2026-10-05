use ::dfs_server::{
    State,
    api::Api,
    storage::{CacheConfig, Storage},
};
use anyhow::{Context, Result};
use dfs_protocol::{
    BLOCK_SIZE,
    error::code,
    rpc::{dfs_server::Dfs, *},
};
use slatedb::object_store::{ObjectStore, local::LocalFileSystem, memory::InMemory};
use std::{collections::BTreeSet, sync::Arc};
use tonic::Request;

const SERVER_KEY: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
struct Fixture {
    api: Api,
    workspace: Workspace,
    session: Session,
    _cache: tempfile::TempDir,
}
fn request<T>(key: &str, value: T) -> Result<Request<T>> {
    let mut request = Request::new(value);
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
fn object(response: Mutation) -> Result<Object> {
    response.object.context("mutation object")
}
impl Fixture {
    async fn new() -> Result<Self> {
        Self::open(Arc::new(InMemory::new())).await
    }
    async fn open(store: Arc<dyn ObjectStore>) -> Result<Self> {
        let cache = tempfile::tempdir()?;
        let config = CacheConfig {
            cache_dir: cache.path().to_owned(),
            cache_memory_mib: 16,
            cache_disk_gib: 0,
            max_unflushed_mib: 16,
        };
        let storage = Storage::open(store, "test", "fixture", &config).await?;
        let api = Api(State::new(storage, SERVER_KEY)?);
        let workspace = api
            .create_workspace(request(
                SERVER_KEY,
                CreateWorkspaceRequest {
                    workspace_id: "workspace".into(),
                    root_grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let session = api
            .create_session(request(
                &workspace.workspace_key,
                CreateSessionRequest {
                    workspace_id: workspace.workspace_id.clone(),
                    grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        Ok(Self {
            api,
            workspace,
            session,
            _cache: cache,
        })
    }
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
    async fn create(&self, parent: &str, name: &str, directory: bool) -> Result<Object> {
        object(
            self.api
                .create(request(
                    &self.session.session_key,
                    CreateRequest {
                        parent_id: parent.into(),
                        name: name.into(),
                        directory,
                        expected_parent_version: self.stat(parent).await?.version,
                        mode: 0o755,
                        ..Default::default()
                    },
                )?)
                .await?
                .into_inner(),
        )
    }
    async fn write(&self, target: &Object, offset: u64, bytes: &[u8]) -> Result<Object> {
        object(
            self.api
                .write(request(
                    &self.session.session_key,
                    WriteRequest {
                        object_id: target.id.clone(),
                        expected_version: target.version,
                        offset,
                        data: bytes.to_vec(),
                        append: false,
                    },
                )?)
                .await?
                .into_inner(),
        )
    }
    async fn read(&self, target: &Object, offset: u64, length: u32) -> Result<Vec<u8>> {
        Ok(Dfs::read(
            &self.api,
            request(
                &self.session.session_key,
                ReadRequest {
                    object_id: target.id.clone(),
                    offset,
                    length,
                    version: None,
                },
            )?,
        )
        .await?
        .into_inner()
        .data)
    }
    async fn resize(&self, target: &Object, size: u64) -> Result<Object> {
        object(
            self.api
                .update(request(
                    &self.session.session_key,
                    UpdateRequest {
                        object_id: target.id.clone(),
                        expected_version: target.version,
                        size: Some(size),
                        ..Default::default()
                    },
                )?)
                .await?
                .into_inner(),
        )
    }
    async fn share(&self, target: &Object, grants: &[(&str, bool)]) -> Result<Object> {
        Ok(self
            .api
            .update_grants(request(
                &self.workspace.workspace_key,
                UpdateGrantsRequest {
                    workspace_id: self.workspace.workspace_id.clone(),
                    object_id: target.id.clone(),
                    expected_version: target.version,
                    changes: grants
                        .iter()
                        .map(|(grant, attached)| GrantChange {
                            grant: (*grant).into(),
                            attached: *attached,
                        })
                        .collect(),
                },
            )?)
            .await?
            .into_inner())
    }
    async fn session(&self, grants: &[&str]) -> Result<Session> {
        Ok(self
            .api
            .create_session(request(
                &self.workspace.workspace_key,
                CreateSessionRequest {
                    workspace_id: self.workspace.workspace_id.clone(),
                    grants: grants.iter().map(|s| (*s).into()).collect(),
                },
            )?)
            .await?
            .into_inner())
    }
    async fn list(&self, session: &Session, directory: &str, limit: u32) -> Result<Vec<Entry>> {
        let mut entries = Vec::new();
        let mut after = None;
        let mut cursors = BTreeSet::new();
        loop {
            let page = self
                .api
                .list(request(
                    &session.session_key,
                    ListRequest {
                        directory_id: directory.into(),
                        after,
                        limit,
                    },
                )?)
                .await?
                .into_inner();
            entries.extend(page.entries);
            after = page.next_after;
            let Some(cursor) = &after else {
                break;
            };
            anyhow::ensure!(cursors.insert(cursor.clone()), "pagination repeated cursor");
        }
        Ok(entries)
    }
}

#[tokio::test]
async fn blocks_sparse_truncate_append_and_stale_writes() -> Result<()> {
    let fixture = Fixture::new().await?;
    let file = fixture
        .create(&fixture.workspace.root_id, "file", false)
        .await?;
    let bytes = vec![7; BLOCK_SIZE * 2 + 11];
    let written = fixture.write(&file, 3, &bytes).await?;
    assert_eq!(fixture.read(&written, 0, 3).await?, vec![0; 3]);
    assert_eq!(fixture.read(&written, 3, bytes.len() as u32).await?, bytes);
    let error = fixture
        .api
        .write(request(
            &fixture.session.session_key,
            WriteRequest {
                object_id: file.id.clone(),
                expected_version: file.version,
                offset: 0,
                data: vec![1],
                ..Default::default()
            },
        )?)
        .await
        .err()
        .context("stale write accepted")?;
    assert_eq!(code(&error), ErrorCode::VersionConflict);
    let shrunk = fixture.resize(&written, BLOCK_SIZE as u64 + 2).await?;
    let grown = fixture.resize(&shrunk, BLOCK_SIZE as u64 * 3).await?;
    let tail = fixture
        .read(&grown, BLOCK_SIZE as u64, BLOCK_SIZE as u32 * 2)
        .await?;
    assert_eq!(&tail[..2], &[7, 7]);
    assert!(tail[2..].iter().all(|b| *b == 0));
    let empty = fixture.resize(&grown, 0).await?;
    let sparse = fixture.write(&empty, (1u64 << 40) + 9, b"end").await?;
    assert_eq!(
        fixture.read(&sparse, 1u64 << 40, 12).await?,
        [vec![0; 9], b"end".to_vec()].concat()
    );
    let appended = object(
        fixture
            .api
            .write(request(
                &fixture.session.session_key,
                WriteRequest {
                    object_id: sparse.id.clone(),
                    expected_version: sparse.version,
                    data: b"!".to_vec(),
                    append: true,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner(),
    )?;
    assert_eq!(appended.size, sparse.size + 1);
    let synced = fixture
        .api
        .fsync(request(
            &fixture.session.session_key,
            ObjectRequest {
                object_id: appended.id.clone(),
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(synced.version, appended.version);
    fixture.api.0.storage.close().await
}

#[tokio::test]
async fn grants_private_projection_pagination_revocation_and_workspace_isolation() -> Result<()> {
    let f = Fixture::new().await?;
    let private = f.create(&f.workspace.root_id, "private", true).await?;
    let visible = f.create(&private.id, "conversation", true).await?;
    let visible = f
        .share(&visible, &[("reader", true), ("other", true)])
        .await?;
    let child = f.create(&visible.id, "child", false).await?;
    let child = f.share(&child, &[("reader", true)]).await?;
    let root_visible = f.create(&f.workspace.root_id, "root-visible", true).await?;
    f.share(&root_visible, &[("reader", true)]).await?;
    let reserved = f.create(&f.workspace.root_id, "shared", false).await?;
    let reserved = f.share(&reserved, &[("reader", true)]).await?;
    let session = f.session(&["reader", "other"]).await?;
    let root = f.list(&session, "root", 1).await?;
    assert_eq!(
        root.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
        ["root-visible", "shared"]
    );
    let shared = f.list(&session, "shared", 1).await?;
    let names: BTreeSet<_> = shared.iter().map(|e| e.name.clone()).collect();
    assert_eq!(
        names,
        BTreeSet::from([
            format!("conversation--{}", visible.id),
            format!("shared--{}", reserved.id)
        ])
    );
    let hidden = f
        .api
        .stat(request(
            &session.session_key,
            ObjectRequest {
                object_id: private.id.clone(),
            },
        )?)
        .await
        .err()
        .context("private parent exposed")?;
    let absent = f
        .api
        .stat(request(
            &session.session_key,
            ObjectRequest {
                object_id: "00000000000000000000000000000000".into(),
            },
        )?)
        .await
        .err()
        .context("missing object exposed")?;
    assert_eq!(hidden.code(), absent.code());
    assert_eq!(hidden.message(), absent.message());
    let current = f.stat(&visible.id).await?;
    f.share(&current, &[("reader", false), ("other", false)])
        .await?;
    let shared = f.list(&session, "shared", 2).await?;
    assert!(
        shared
            .iter()
            .any(|e| e.name == format!("child--{}", child.id))
    );
    let grant_page = f
        .api
        .list_grants(request(
            &f.workspace.workspace_key,
            ListGrantsRequest {
                workspace_id: f.workspace.workspace_id.clone(),
                object_id: visible.id.clone(),
                limit: 10,
                after: None,
            },
        )?)
        .await?
        .into_inner();
    assert!(grant_page.grants.is_empty());
    let other_workspace = f
        .api
        .create_workspace(request(
            SERVER_KEY,
            CreateWorkspaceRequest {
                workspace_id: "workspace\0other".into(),
                root_grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    let foreign = f
        .api
        .create_session(request(
            &other_workspace.workspace_key,
            CreateSessionRequest {
                workspace_id: other_workspace.workspace_id,
                grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    let error = f
        .api
        .stat(request(
            &foreign.session_key,
            ObjectRequest {
                object_id: child.id.clone(),
            },
        )?)
        .await
        .err()
        .context("cross-workspace read allowed")?;
    assert_eq!(code(&error), ErrorCode::NotFound);
    let error = f
        .api
        .update_grants(request(
            &session.session_key,
            UpdateGrantsRequest {
                workspace_id: f.workspace.workspace_id.clone(),
                object_id: child.id.clone(),
                ..Default::default()
            },
        )?)
        .await
        .err()
        .context("session administered grants")?;
    assert_eq!(code(&error), ErrorCode::Unauthenticated);
    f.api
        .close_session(request(&session.session_key, Empty {})?)
        .await?;
    let error = f
        .api
        .stat(request(
            &session.session_key,
            ObjectRequest {
                object_id: child.id,
            },
        )?)
        .await
        .err()
        .context("closed session accepted")?;
    assert_eq!(code(&error), ErrorCode::Unauthenticated);
    f.api.0.storage.close().await
}

#[tokio::test]
async fn rename_preserves_identity_and_rejects_cycles_and_stale_parents() -> Result<()> {
    let f = Fixture::new().await?;
    let a = f.create(&f.workspace.root_id, "a", true).await?;
    let b = f.create(&f.workspace.root_id, "b", true).await?;
    let file = f.create(&a.id, "file", false).await?;
    let file = f.write(&file, 0, b"content").await?;
    let replacement = f.create(&b.id, "destination", false).await?;
    let source_parent = f.stat(&a.id).await?;
    let destination_parent = f.stat(&b.id).await?;
    let request_body = RenameRequest {
        object_id: file.id.clone(),
        parent_id: b.id.clone(),
        name: "destination".into(),
        replace: true,
        expected: vec![
            expected(&file),
            expected(&source_parent),
            expected(&destination_parent),
            expected(&replacement),
        ],
    };
    let mut stale = request_body.clone();
    stale.expected[1].version -= 1;
    let error = f
        .api
        .rename(request(&f.session.session_key, stale)?)
        .await
        .err()
        .context("stale parent accepted")?;
    assert_eq!(code(&error), ErrorCode::VersionConflict);
    assert_eq!(f.stat(&replacement.id).await?.id, replacement.id);
    let moved = object(
        f.api
            .rename(request(&f.session.session_key, request_body)?)
            .await?
            .into_inner(),
    )?;
    assert_eq!(moved.id, file.id);
    assert_eq!(f.read(&moved, 0, 7).await?, b"content");
    assert!(f.stat(&replacement.id).await.is_err());
    let sub = f.create(&a.id, "sub", true).await?;
    let a = f.stat(&a.id).await?;
    let root = f.stat(&f.workspace.root_id).await?;
    let cycle = f
        .api
        .rename(request(
            &f.session.session_key,
            RenameRequest {
                object_id: a.id.clone(),
                parent_id: sub.id.clone(),
                name: "cycle".into(),
                replace: false,
                expected: vec![expected(&a), expected(&root), expected(&sub)],
            },
        )?)
        .await
        .err()
        .context("cycle accepted")?;
    assert_eq!(code(&cycle), ErrorCode::InvalidInput);
    let parent = f.stat(&b.id).await?;
    f.api
        .remove(request(
            &f.session.session_key,
            RemoveRequest {
                object_id: moved.id.clone(),
                directory: false,
                expected: vec![expected(&moved), expected(&parent)],
            },
        )?)
        .await?;
    assert!(f.stat(&moved.id).await.is_err());
    f.api.0.storage.close().await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn competing_writers_publish_once_and_independent_files_keep_parent_version() -> Result<()> {
    let f = Fixture::new().await?;
    let file = f.create(&f.workspace.root_id, "contended", false).await?;
    let mut tasks = tokio::task::JoinSet::new();
    for value in 0..32u8 {
        let api = f.api.clone();
        let request = request(
            &f.session.session_key,
            WriteRequest {
                object_id: file.id.clone(),
                expected_version: file.version,
                data: vec![value],
                ..Default::default()
            },
        )?;
        tasks.spawn(async move { api.write(request).await });
    }
    let mut accepted = 0;
    while let Some(result) = tasks.join_next().await {
        match result? {
            Ok(_) => accepted += 1,
            Err(error) => assert_eq!(code(&error), ErrorCode::VersionConflict),
        }
    }
    assert_eq!(accepted, 1);
    let mut files = Vec::new();
    for index in 0..32 {
        files.push(
            f.create(&f.workspace.root_id, &format!("file-{index}"), false)
                .await?,
        );
    }
    let parent = f.stat(&f.workspace.root_id).await?;
    for file in files {
        let api = f.api.clone();
        let request = request(
            &f.session.session_key,
            WriteRequest {
                object_id: file.id,
                expected_version: file.version,
                data: vec![1; BLOCK_SIZE],
                ..Default::default()
            },
        )?;
        tasks.spawn(async move { api.write(request).await });
    }
    while let Some(result) = tasks.join_next().await {
        result??;
    }
    assert_eq!(f.stat(&parent.id).await?.version, parent.version);
    f.api.0.storage.close().await
}

#[tokio::test]
async fn durable_reopen_recovers_blocks_grants_and_indexes_without_local_cache() -> Result<()> {
    let remote = tempfile::tempdir()?;
    let store: Arc<dyn ObjectStore> = Arc::new(LocalFileSystem::new_with_prefix(remote.path())?);
    let f = Fixture::open(store.clone()).await?;
    let directory = f.create(&f.workspace.root_id, "private", true).await?;
    let file = f.create(&directory.id, "file", false).await?;
    let file = f
        .write(&file, BLOCK_SIZE as u64 - 2, b"across-blocks")
        .await?;
    let file = f.share(&file, &[("reader", true)]).await?;
    f.api.0.drain().await?;
    f.api.0.storage.close().await?;
    let cache = tempfile::tempdir()?;
    let storage = Storage::open(
        store,
        "test",
        "fixture",
        &CacheConfig {
            cache_dir: cache.path().to_owned(),
            cache_memory_mib: 0,
            cache_disk_gib: 0,
            max_unflushed_mib: 16,
        },
    )
    .await?;
    let api = Api(State::new(storage, SERVER_KEY)?);
    let old_session = api
        .current_session(request(&f.session.session_key, Empty {})?)
        .await
        .err()
        .context("old session survived restart")?;
    assert_eq!(code(&old_session), ErrorCode::Unauthenticated);
    let session = api
        .create_session(request(
            &f.workspace.workspace_key,
            CreateSessionRequest {
                workspace_id: f.workspace.workspace_id.clone(),
                grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    let page = api
        .list(request(
            &session.session_key,
            ListRequest {
                directory_id: "shared".into(),
                limit: 10,
                after: None,
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(page.entries.len(), 1);
    assert_eq!(page.entries[0].name, format!("file--{}", file.id));
    let read = Dfs::read(
        &api,
        request(
            &session.session_key,
            ReadRequest {
                object_id: file.id,
                offset: BLOCK_SIZE as u64 - 2,
                length: 13,
                version: Some(file.version),
            },
        )?,
    )
    .await?
    .into_inner();
    assert_eq!(read.data, b"across-blocks");
    api.0.storage.close().await
}
