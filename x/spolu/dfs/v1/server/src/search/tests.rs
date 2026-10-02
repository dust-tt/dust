use super::*;
use crate::{
    api::Api,
    mutation::Edit,
    read::View,
    storage::{CacheConfig, Storage, decode},
};
use anyhow::{Context, Result};
use dfs_protocol::{
    error::code,
    rpc::{dfs_server::Dfs, *},
};
use slatedb::object_store::memory::InMemory;
use std::collections::BTreeSet;
use tonic::Request;

const KEY: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
fn request<T>(key: &str, value: T) -> Result<Request<T>> {
    let mut r = Request::new(value);
    r.metadata_mut()
        .insert("authorization", format!("Bearer {key}").parse()?);
    Ok(r)
}
struct Fixture {
    api: Api,
    workspace: Workspace,
    session: Session,
    search: Arc<Search>,
    _dir: tempfile::TempDir,
}
impl Fixture {
    async fn new() -> Result<Self> {
        let _ = tracing_subscriber::fmt()
            .with_env_filter("error")
            .with_test_writer()
            .try_init();
        let dir = tempfile::tempdir()?;
        let storage = Storage::open(
            Arc::new(InMemory::new()),
            "test",
            "search-test",
            &CacheConfig {
                cache_dir: dir.path().join("cache"),
                cache_memory_mib: 16,
                cache_disk_gib: 0,
                max_unflushed_mib: 16,
            },
        )
        .await?;
        let api = Api(State::new(storage, KEY)?);
        let search = Search::open(
            dir.path().join("index").to_str().context("index path")?,
            None,
            SearchConfig {
                cache_mib: 32,
                tables: 2,
            },
        )
        .await?;
        api.0
            .search
            .set(search.clone())
            .map_err(|_| anyhow::anyhow!("already initialized"))?;
        let workspace = api
            .create_workspace(request(
                KEY,
                CreateWorkspaceRequest {
                    workspace_id: "test".into(),
                    root_grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let session = api
            .create_session(request(
                &workspace.workspace_key,
                CreateSessionRequest {
                    workspace_id: "test".into(),
                    grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        Ok(Self {
            api,
            workspace,
            session,
            search,
            _dir: dir,
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
        self.api
            .create(request(
                &self.session.session_key,
                CreateRequest {
                    parent_id: parent.into(),
                    expected_parent_version: self.stat(parent).await?.version,
                    name: name.into(),
                    directory,
                    mode: 0o755,
                    mime_type: (!directory).then(|| "text/plain".into()),
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner()
            .object
            .context("object")
    }
    async fn write(&self, file: &Object, text: &[u8]) -> Result<Object> {
        self.api
            .write(request(
                &self.session.session_key,
                WriteRequest {
                    object_id: file.id.clone(),
                    expected_version: file.version,
                    data: text.into(),
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner()
            .object
            .context("object")
    }
    async fn find(
        &self,
        key: &str,
        query: &str,
        filter: Option<SearchFilter>,
    ) -> Result<SearchFilesResponse> {
        Ok(self
            .api
            .search_files(request(
                key,
                SearchFilesRequest {
                    query: query.into(),
                    filter,
                    limit: 100,
                },
            )?)
            .await?
            .into_inner())
    }
    async fn index(&self) -> Result<()> {
        for _ in 0..20 {
            tokio::time::timeout(
                std::time::Duration::from_secs(30),
                self.search.process(&self.api.0, "test"),
            )
            .await??;
            let status = self.search.status(&self.api.0, "test").await?;
            if status.pending == 0 && !status.backfilling {
                return Ok(());
            }
        }
        anyhow::bail!("index did not drain")
    }
    async fn grants(&self, id: &str, attached: bool) -> Result<()> {
        self.api
            .update_grants(request(
                &self.workspace.workspace_key,
                UpdateGrantsRequest {
                    workspace_id: "test".into(),
                    object_id: id.into(),
                    expected_version: self.stat(id).await?.version,
                    changes: vec![GrantChange {
                        grant: "reader".into(),
                        attached,
                    }],
                },
            )?)
            .await?;
        Ok(())
    }
    async fn view(&self) -> Result<View> {
        Ok(View::new(&self.api.0.storage, "test", BTreeSet::new()).await?)
    }
}

#[tokio::test]
async fn live_grants_filters_stale_rows_and_idempotent_replay() -> Result<()> {
    let f = Fixture::new().await?;
    let folder = f.create(&f.workspace.root_id, "private", true).await?;
    let file = f.create(&folder.id, "code.txt", false).await?;
    let file = f
        .write(&file, b"Quokka initial_token searchable content")
        .await?;
    let file = f
        .api
        .update(request(
            &f.session.session_key,
            UpdateRequest {
                object_id: file.id.clone(),
                expected_version: file.version,
                xattrs: vec![
                    XattrChange {
                        name: "bin' OR true".into(),
                        value: Some(vec![0, 255]),
                    },
                    XattrChange {
                        name: "empty".into(),
                        value: Some(vec![]),
                    },
                ],
                ..Default::default()
            },
        )?)
        .await?
        .into_inner()
        .object
        .context("updated")?;
    f.index().await?;
    let found = f.find(&f.session.session_key, "quokka", None).await?;
    assert_eq!(found.hits.len(), 1);
    assert_eq!(found.hits[0].uri, format!("dfs://{}", file.id));
    assert_eq!(found.hits[0].name, "code.txt");
    for (name, value) in [
        ("bin' OR true", Some(vec![0, 255])),
        ("empty", Some(vec![])),
        ("empty", None),
    ] {
        let filter = SearchFilter {
            mime_types: vec!["text/plain".into()],
            name_prefix: Some("code".into()),
            min_size: Some(1),
            max_size: Some(100),
            xattrs: vec![SearchXattr {
                name: name.into(),
                value,
            }],
            ..Default::default()
        };
        assert_eq!(
            f.find(&f.session.session_key, "quokka", Some(filter))
                .await?
                .hits
                .len(),
            1
        );
    }
    assert!(
        f.find(
            &f.session.session_key,
            "",
            Some(SearchFilter {
                name: Some("' OR true".into()),
                ..Default::default()
            })
        )
        .await?
        .hits
        .is_empty()
    );
    let reader = f
        .api
        .create_session(request(
            &f.workspace.workspace_key,
            CreateSessionRequest {
                workspace_id: "test".into(),
                grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    assert!(
        f.find(&reader.session_key, "quokka", None)
            .await?
            .hits
            .is_empty()
    );
    f.grants(&folder.id, true).await?;
    assert_eq!(f.search.status(&f.api.0, "test").await?.pending, 0);
    assert_eq!(
        f.find(&reader.session_key, "quokka", None)
            .await?
            .hits
            .len(),
        1
    );
    f.grants(&folder.id, false).await?;
    assert!(
        f.find(&reader.session_key, "quokka", None)
            .await?
            .hits
            .is_empty()
    );
    assert_eq!(f.search.status(&f.api.0, "test").await?.pending, 0);
    let file = f
        .write(&file, b"Zebrafish novelword post-update text   ")
        .await?;
    assert!(
        f.find(&f.session.session_key, "quokka", None)
            .await?
            .hits
            .is_empty()
    );
    // Simulate a crash after LanceDB commit, before queue completion or index optimization.
    f.api.0.storage.flush().await?;
    let view = f.view().await?;
    let document = index::extract(&view, view.object(&file.id).await?).await?;
    let table = f.search.table("test").await?;
    // Reopening during an in-flight commit can leave a different cached table handle behind.
    f.search.tables.lock().await.clear();
    let _reopened = f.search.table("test").await?;
    index::commit(&table, &[document], &[]).await?;
    f.search.publish_table("test", table.clone()).await;
    assert_eq!(
        f.find(&f.session.session_key, "novelword", None)
            .await?
            .hits
            .len(),
        1
    );
    f.index().await?;
    assert_eq!(table.count_rows(None).await?, 1);
    assert_eq!(
        f.find(&f.session.session_key, "novelword", None)
            .await?
            .hits
            .len(),
        1
    );
    let parent = f.stat(&folder.id).await?;
    f.api
        .remove(request(
            &f.session.session_key,
            RemoveRequest {
                object_id: file.id.clone(),
                directory: false,
                expected: vec![
                    Expected {
                        id: file.id.clone(),
                        version: file.version,
                    },
                    Expected {
                        id: parent.id,
                        version: parent.version,
                    },
                ],
            },
        )?)
        .await?;
    assert!(
        f.find(&f.session.session_key, "novelword", None)
            .await?
            .hits
            .is_empty()
    );
    f.index().await?;
    assert_eq!(table.count_rows(None).await?, 0);
    f.api
        .close_session(request(&reader.session_key, Empty {})?)
        .await?;
    assert!(f.find(&reader.session_key, "", None).await.is_err());
    f.api.0.storage.close().await
}

#[tokio::test]
async fn rejected_writes_and_old_completions_preserve_new_work() -> Result<()> {
    let f = Fixture::new().await?;
    let file = f.create(&f.workspace.root_id, "queued", false).await?;
    let old: queue::Pending = decode(
        &f.view()
            .await?
            .get(&f.view().await?.keys.pending_file(&file.id)?)
            .await?
            .context("pending")?,
    )?;
    let file = f.write(&file, b"new content").await?;
    let before = f.view().await?;
    let key = before.keys.pending_file(&file.id)?;
    let pending = before.get(&key).await?.context("pending")?;
    let error = f
        .api
        .write(request(
            &f.session.session_key,
            WriteRequest {
                object_id: file.id.clone(),
                expected_version: file.version - 1,
                data: b"rejected".to_vec(),
                ..Default::default()
            },
        )?)
        .await
        .err()
        .context("conflict expected")?;
    assert_eq!(code(&error), ErrorCode::VersionConflict);
    assert_eq!(
        f.view().await?.get(&key).await?.context("pending")?,
        pending
    );
    let locks = f.api.0.locks("test").await;
    {
        let _guard = locks.topology.write().await;
        let view = f.view().await?;
        let mut edit = Edit::new();
        assert!(!queue::complete(&view, &mut edit, &file.id, &old.token, None).await?);
        f.api.0.storage.publish(edit.batch).await?;
    }
    assert_eq!(
        f.view().await?.get(&key).await?.context("pending")?,
        pending
    );
    let file = f.write(&file, &[0, 255, 1]).await?;
    f.index().await?;
    assert_eq!(f.search.status(&f.api.0, "test").await?.skipped, 1);
    assert_eq!(
        f.find(&f.session.session_key, "", None).await?.hits.len(),
        1
    );
    assert!(
        f.find(&f.session.session_key, "new", None)
            .await?
            .hits
            .is_empty()
    );
    let _ = file;
    f.api.0.storage.close().await
}

#[tokio::test]
async fn oversampling_cross_workspace_and_directory_moves() -> Result<()> {
    let f = Fixture::new().await?;
    let directory = f.create(&f.workspace.root_id, "hidden", true).await?;
    for index in 0..80 {
        let file = f
            .create(&directory.id, &format!("private{index}"), false)
            .await?;
        f.write(&file, b"selective").await?;
    }
    let file = f.create(&directory.id, "accessible", false).await?;
    let file = f
        .write(
            &file,
            format!("selective {}", "filler ".repeat(400)).as_bytes(),
        )
        .await?;
    f.grants(&file.id, true).await?;
    f.index().await?;
    let reader = f
        .api
        .create_session(request(
            &f.workspace.workspace_key,
            CreateSessionRequest {
                workspace_id: "test".into(),
                grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    let result = f
        .api
        .search_files(request(
            &reader.session_key,
            SearchFilesRequest {
                query: "selective".into(),
                limit: 1,
                ..Default::default()
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].object.as_ref().context("hit")?.id, file.id);
    assert!(!result.partial);
    let public = f.create(&f.workspace.root_id, "public", true).await?;
    f.grants(&public.id, true).await?;
    let mut expected = Vec::new();
    for id in [&directory.id, &f.workspace.root_id, &public.id] {
        let object = f.stat(id).await?;
        expected.push(Expected {
            id: object.id,
            version: object.version,
        });
    }
    f.api
        .rename(request(
            &f.session.session_key,
            RenameRequest {
                object_id: directory.id.clone(),
                parent_id: public.id.clone(),
                name: "moved".into(),
                expected,
                replace: false,
            },
        )?)
        .await?;
    assert_eq!(f.search.status(&f.api.0, "test").await?.pending, 0);
    assert_eq!(
        f.find(&reader.session_key, "selective", None)
            .await?
            .hits
            .len(),
        81
    );
    f.grants(&public.id, false).await?;
    assert_eq!(
        f.find(&reader.session_key, "selective", None)
            .await?
            .hits
            .len(),
        1
    );
    let other = f
        .api
        .create_workspace(request(
            KEY,
            CreateWorkspaceRequest {
                workspace_id: "other".into(),
                root_grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    let other_session = f
        .api
        .create_session(request(
            &other.workspace_key,
            CreateSessionRequest {
                workspace_id: "other".into(),
                grants: vec!["reader".into()],
            },
        )?)
        .await?
        .into_inner();
    // A missing index must be unavailable, not expose another workspace or pretend to be empty.
    let result = f
        .api
        .search_files(request(
            &other_session.session_key,
            SearchFilesRequest {
                query: "selective".into(),
                ..Default::default()
            },
        )?)
        .await;
    assert_eq!(
        code(&result.err().context("unavailable")?),
        ErrorCode::Unavailable
    );
    let denied = f
        .api
        .get_index_status(request(
            &reader.session_key,
            IndexStatusRequest {
                workspace_id: "test".into(),
            },
        )?)
        .await;
    assert!(denied.is_err());
    f.api.0.storage.close().await
}

#[tokio::test]
async fn discarded_index_rebuilds_and_candidate_exhaustion_is_partial() -> Result<()> {
    let f = Fixture::new().await?;
    let file = f.create(&f.workspace.root_id, "rebuild", false).await?;
    f.write(&file, b"rebuiltneedle").await?;
    f.index().await?;
    f.search
        .connection
        .drop_table(Search::name("test"), &[])
        .await?;
    f.search.tables.lock().await.clear();
    f.index().await?;
    assert_eq!(
        f.find(&f.session.session_key, "rebuiltneedle", None)
            .await?
            .hits
            .len(),
        1
    );
    // This batch is deliberately larger than the request budget, with no accessible candidates.
    for index in 0..4100 {
        f.create(&f.workspace.root_id, &format!("candidate{index}"), false)
            .await?;
    }
    f.api.0.storage.flush().await?;
    let view = f.view().await?;
    let records = view.rows(view.keys.objects(), None, 5000).await?;
    let mut documents = Vec::new();
    for (_, bytes) in records {
        let record: crate::model::Record = decode(&bytes)?;
        if !record.object.directory {
            documents.push(index::extract(&view, record).await?);
        }
    }
    index::commit(&f.search.table("test").await?, &documents, &[]).await?;
    let none = f
        .api
        .create_session(request(
            &f.workspace.workspace_key,
            CreateSessionRequest {
                workspace_id: "test".into(),
                grants: vec![],
            },
        )?)
        .await?
        .into_inner();
    let result = f.find(&none.session_key, "", None).await?;
    assert!(result.hits.is_empty());
    assert!(result.partial);
    f.api.0.storage.close().await
}

#[tokio::test]
async fn backfill_does_not_requeue_completed_files_and_full_batch_is_maintained() -> Result<()> {
    let f = Fixture::new().await?;
    for i in 0..2048 {
        f.create(&f.workspace.root_id, &format!("file{i}"), false)
            .await?;
    }
    // Two full object scans cannot yet finish the backfill, which also includes the root.
    for _ in 0..2 {
        f.search.process(&f.api.0, "test").await?;
        assert_eq!(f.search.table("test").await?.count_rows(None).await?, 0);
    }
    f.search.process(&f.api.0, "test").await?;
    assert_eq!(f.search.status(&f.api.0, "test").await?.pending, 1024);
    f.search.process(&f.api.0, "test").await?;
    assert_eq!(f.search.status(&f.api.0, "test").await?.pending, 0);
    let table = f.search.table("test").await?;
    assert_eq!(table.count_rows(None).await?, 2048);
    let version = table.version().await?;
    assert!(!f.search.process(&f.api.0, "test").await?);
    assert_eq!(f.search.table("test").await?.version().await?, version);
    // The final full batch already ran maintenance before its pending jobs were cleared.
    let view = f.view().await?;
    let meta: queue::Meta = decode(
        &view
            .get(&view.keys.search_meta())
            .await?
            .context("search meta")?,
    )?;
    assert!(meta.pending_after.is_none());
    assert!(meta.last_optimized_seconds >= meta.last_commit_seconds);
    f.api.0.storage.close().await
}
