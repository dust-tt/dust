use super::*;
use crate::{
    api::Api,
    mutation::Edit,
    read::View,
    storage::{Storage, StorageConfig, WriteBatch, decode},
};
use anyhow::{Context, Result};
use dfs_protocol::{
    error::code,
    rpc::{dfs_server::Dfs, *},
};
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
}
impl Fixture {
    async fn new() -> Result<Self> {
        let _ = tracing_subscriber::fmt()
            .with_env_filter("error")
            .with_test_writer()
            .try_init();
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let storage = Storage::open(&StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-search-{suffix}"),
        })
        .await?;
        let api = Api(State::new_durable(storage, KEY)?);
        let search = Search::open(SearchConfig {
            es_url: std::env::var("DFS_ES_URL")?,
            es_index: format!("dfs-v2-search-{suffix}"),
        })?;
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
        })
    }
    async fn cleanup(&self) -> Result<()> {
        self.search
            .json(
                reqwest::Method::DELETE,
                &format!("/{}", self.search.config.es_index),
                &json!({}),
            )
            .await?;
        self.api
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
    async fn publish_uncompleted(&self, id: &str) -> Result<(String, Value)> {
        let base = format!(
            "/{}/_doc/{}?routing={}",
            self.search.config.es_index,
            index::document_id("test", id),
            index::routing("test")
        );
        let (code, current) =
            Search::response(self.search.request(reqwest::Method::GET, &base)).await?;
        let path = if code == 404 {
            format!("{base}&op_type=create&refresh=wait_for")
        } else {
            format!(
                "{base}&if_seq_no={}&if_primary_term={}&refresh=wait_for",
                current["_seq_no"], current["_primary_term"]
            )
        };
        let view = self.view().await?;
        let pending: queue::Pending = decode(
            &view
                .get(&view.keys.pending_file(id)?)
                .await?
                .context("pending")?,
        )?;
        drop(view);
        let doc = index::extract(&self.api.0, "test", id, &pending).await?;
        self.search
            .json(reqwest::Method::PUT, &path, &doc.body)
            .await?;
        Ok((path, doc.body))
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
        for _ in 0..60 {
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
    f.index().await.context("index fixture")?;
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
    // Simulate ES publication succeeding without completing the FDB job.
    let old = f.publish_uncompleted(&file.id).await?;
    assert_eq!(
        f.find(&f.session.session_key, "novelword", None)
            .await?
            .hits
            .len(),
        1
    );
    f.index().await.context("index fixture")?;
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
    f.index().await.context("index fixture")?;
    let (code, _) =
        Search::response(f.search.request(reqwest::Method::PUT, &old.0).json(&old.1)).await?;
    assert_eq!(
        code, 409,
        "late publication must not replace the deletion tombstone"
    );
    assert!(
        f.find(&f.session.session_key, "novelword", None)
            .await?
            .hits
            .is_empty()
    );
    f.api
        .close_session(request(&reader.session_key, Empty {})?)
        .await?;
    assert!(f.find(&reader.session_key, "", None).await.is_err());
    f.cleanup().await
}

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
    f.api
        .0
        .storage
        .transact(|snapshot| {
            let (file, old) = (&file, &old);
            async move {
                let view = View::from_snapshot(snapshot, "test", BTreeSet::new()).await?;
                let mut edit = Edit::new();
                assert!(!queue::complete(&view, &mut edit, &file.id, &old.token, None).await?);
                Ok((edit.batch, ()))
            }
        })
        .await?;
    assert_eq!(
        f.view().await?.get(&key).await?.context("pending")?,
        pending
    );
    let file = f.write(&file, &[0, 255, 1]).await?;
    f.index().await.context("index fixture")?;
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
    f.cleanup().await
}

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
    f.index().await.context("index fixture")?;
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
    // The shared index exists; explicit workspace filtering must still hide all other documents.
    assert!(
        f.find(&other_session.session_key, "selective", None)
            .await?
            .hits
            .is_empty()
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
    f.cleanup().await
}

async fn discarded_index_rebuilds_and_candidate_exhaustion_is_partial() -> Result<()> {
    let f = Fixture::new().await?;
    let file = f.create(&f.workspace.root_id, "rebuild", false).await?;
    f.write(&file, b"rebuiltneedle").await?;
    f.index().await.context("index fixture")?;
    f.search
        .json(
            reqwest::Method::DELETE,
            &format!("/{}", f.search.config.es_index),
            &json!({}),
        )
        .await?;
    f.index().await.context("index fixture")?;
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
    f.index().await.context("index fixture")?;
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
    f.cleanup().await
}

async fn backfill_does_not_requeue_completed_files_and_full_batch_is_maintained() -> Result<()> {
    let f = Fixture::new().await?;
    for i in 0..2048 {
        f.create(&f.workspace.root_id, &format!("file{i}"), false)
            .await?;
    }
    f.search.process(&f.api.0, "test").await?;
    assert_eq!(f.search.status(&f.api.0, "test").await?.pending, 2048);
    f.index().await.context("index fixture")?;
    assert_eq!(f.search.status(&f.api.0, "test").await?.pending, 0);
    assert!(!f.search.process(&f.api.0, "test").await?);
    f.cleanup().await
}

pub(crate) async fn run() -> Result<()> {
    concurrent_chunk_writes_and_unlink_do_not_mix_indexed_versions().await?;
    maximum_xattrs_timestamps_and_many_grants()
        .await
        .context("max xattrs, timestamps, and grants")?;
    live_grants_filters_stale_rows_and_idempotent_replay()
        .await
        .context("live grants and replay")?;
    rejected_writes_and_old_completions_preserve_new_work().await?;
    oversampling_cross_workspace_and_directory_moves()
        .await
        .context("oversampling and workspaces")?;
    discarded_index_rebuilds_and_candidate_exhaustion_is_partial()
        .await
        .context("rebuild and exhaustion")?;
    backfill_does_not_requeue_completed_files_and_full_batch_is_maintained().await?;
    Ok(())
}

async fn maximum_xattrs_timestamps_and_many_grants() -> Result<()> {
    let f = Fixture::new().await?;
    let file = f.create(&f.workspace.root_id, "maximum", false).await?;
    let file = f
        .write(&file, b"The RUNNING quokka BENCH_RARE_NEEDLE caf\xc3\xa9")
        .await?;
    let value = vec![255; dfs_protocol::MAX_XATTRS - 1];
    f.api
        .update(request(
            &f.session.session_key,
            UpdateRequest {
                object_id: file.id.clone(),
                expected_version: file.version,
                xattrs: vec![XattrChange {
                    name: "x".into(),
                    value: Some(value.clone()),
                }],
                mtime: Some(Timestamp {
                    seconds: 12345,
                    nanos: 123456789,
                }),
                ..Default::default()
            },
        )?)
        .await?;
    f.grants(&file.id, true).await?;
    f.index().await?;
    let mut grants: Vec<_> = (0..511).map(|i| format!("missing:{i}")).collect();
    grants.push("reader".into());
    let reader = f
        .api
        .create_session(request(
            &f.workspace.workspace_key,
            CreateSessionRequest {
                workspace_id: "test".into(),
                grants,
            },
        )?)
        .await?
        .into_inner();
    let filter = SearchFilter {
        xattrs: vec![SearchXattr {
            name: "x".into(),
            value: Some(value),
        }],
        modified_after: Some(Timestamp {
            seconds: 12345,
            nanos: 123456789,
        }),
        modified_before: Some(Timestamp {
            seconds: 12345,
            nanos: 123456789,
        }),
        ..Default::default()
    };
    assert_eq!(
        f.find(&reader.session_key, "the", Some(filter.clone()))
            .await?
            .hits
            .len(),
        1
    );
    assert_eq!(
        f.find(&reader.session_key, "café unknown", Some(filter.clone()))
            .await?
            .hits
            .len(),
        1
    );
    assert!(
        f.find(&reader.session_key, "run", Some(filter.clone()))
            .await?
            .hits
            .is_empty()
    );
    assert_eq!(
        f.find(&reader.session_key, "needle", Some(filter.clone()))
            .await?
            .hits
            .len(),
        1
    );
    assert_eq!(
        f.find(&reader.session_key, "cafe", Some(filter.clone()))
            .await?
            .hits
            .len(),
        1
    );
    let mut later = filter;
    later.modified_before = None;
    later.modified_after = Some(Timestamp {
        seconds: 12345,
        nanos: 123456790,
    });
    assert!(
        f.find(&reader.session_key, "", Some(later))
            .await?
            .hits
            .is_empty()
    );
    f.cleanup().await
}

async fn concurrent_chunk_writes_and_unlink_do_not_mix_indexed_versions() -> Result<()> {
    let f = Fixture::new().await?;
    let mut file = f.create(&f.workspace.root_id, "chunks", false).await?;
    f.search.ensure_index().await?;
    let (response_code, _) = Search::response(f.search.request(
        reqwest::Method::GET,
        &format!(
            "/{}/_doc/{}?routing={}",
            f.search.config.es_index,
            index::document_id("test", &file.id),
            index::routing("test")
        ),
    ))
    .await?;
    assert_eq!(response_code, 404);
    let original: Vec<u8> = b"a "
        .iter()
        .copied()
        .cycle()
        .take(dfs_protocol::MAX_IO)
        .collect();
    for chunk in 0..2 {
        file = f
            .api
            .write(request(
                &f.session.session_key,
                WriteRequest {
                    object_id: file.id.clone(),
                    expected_version: file.version,
                    offset: chunk * dfs_protocol::MAX_IO as u64,
                    data: original.clone(),
                    append: false,
                },
            )?)
            .await?
            .into_inner()
            .object
            .context("written")?;
    }
    let view = f.view().await?;
    let pending: queue::Pending = decode(
        &view
            .get(&view.keys.pending_file(&file.id)?)
            .await?
            .context("pending")?,
    )?;
    drop(view);
    let replacement: Vec<u8> = b"b "
        .iter()
        .copied()
        .cycle()
        .take(dfs_protocol::MAX_IO)
        .collect();
    let edited = async {
        let mut current = file.clone();
        for chunk in 0..2 {
            current = f
                .api
                .write(request(
                    &f.session.session_key,
                    WriteRequest {
                        object_id: current.id.clone(),
                        expected_version: current.version,
                        offset: chunk * dfs_protocol::MAX_IO as u64,
                        data: replacement.clone(),
                        append: false,
                    },
                )?)
                .await?
                .into_inner()
                .object
                .context("written")?;
        }
        Ok::<_, anyhow::Error>(current)
    };
    let (extracted, changed) =
        tokio::join!(index::extract(&f.api.0, "test", &file.id, &pending), edited);
    let changed = changed?;
    match extracted {
        Ok(document) => {
            // Completing before the edit is legal; returning bytes from its newer version is not.
            assert_eq!(document.version, file.version);
            assert!(
                document.body["text"]
                    .as_str()
                    .context("text")?
                    .chars()
                    .all(|c| c == 'a' || c == ' ')
            );
        }
        Err(error) => assert!(matches!(
            code(&error),
            ErrorCode::Unavailable | ErrorCode::NotFound
        )),
    }
    let view = f.view().await?;
    let pending: queue::Pending = decode(
        &view
            .get(&view.keys.pending_file(&file.id)?)
            .await?
            .context("pending")?,
    )?;
    drop(view);
    let parent = f.stat(&f.workspace.root_id).await?;
    let removed = f.api.remove(request(
        &f.session.session_key,
        RemoveRequest {
            object_id: changed.id.clone(),
            directory: false,
            expected: vec![
                Expected {
                    id: changed.id.clone(),
                    version: changed.version,
                },
                Expected {
                    id: parent.id,
                    version: parent.version,
                },
            ],
        },
    )?);
    let (extracted, deleted) = tokio::join!(
        index::extract(&f.api.0, "test", &changed.id, &pending),
        removed
    );
    deleted?;
    match extracted {
        Ok(document) => {
            assert_eq!(document.version, changed.version);
            assert!(
                document.body["text"]
                    .as_str()
                    .context("text")?
                    .chars()
                    .all(|c| c == 'b' || c == ' ')
            );
        }
        Err(error) => assert!(matches!(
            code(&error),
            ErrorCode::Unavailable | ErrorCode::NotFound
        )),
    }
    f.index().await?;
    assert!(
        f.find(&f.session.session_key, "", None)
            .await?
            .hits
            .is_empty()
    );
    f.cleanup().await
}
