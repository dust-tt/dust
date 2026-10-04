use crate::{
    State, auth,
    keys::Keys,
    model::{self, Record, WorkspaceRecord},
    mutation::{Change, Edit, prefetch_read},
    read::View,
    storage::{encode, failed, measured},
};
use dfs_protocol::{
    MAX_GRANTS,
    error::status,
    rpc::{dfs_server::Dfs, *},
    validate,
};
use std::{collections::BTreeSet, future::Future, sync::Arc};
use tonic::{Request, Response, Status};
use tracing::Instrument;

type Result<T> = std::result::Result<T, Status>;
#[derive(Clone)]
pub struct Api(pub Arc<State>);
impl Api {
    /// @cc [owner:spolu,label:concurrency] cancellation-keeps-publication-guards
    /// Accepted RPC work MUST retain its admission permit and publication guards even if its caller
    /// disconnects. At most 64 requests may execute; shutdown MUST await those accepted requests.
    async fn call<T, F, Fut>(&self, operation: F) -> Result<Response<T>>
    where
        T: Send + 'static,
        F: FnOnce(Arc<State>) -> Fut + Send + 'static,
        Fut: Future<Output = Result<T>> + Send + 'static,
    {
        let permit = self
            .0
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| status(ErrorCode::Capacity))?;
        let state = self.0.clone();
        let value = tokio::spawn(async move {
            let _permit = permit;
            operation(state).await
        })
        .await
        .map_err(failed)??;
        Ok(Response::new(value))
    }
    async fn change<T: Send + Sync + 'static>(
        &self,
        request: Request<T>,
        change: impl FnOnce(T) -> Change + Send + 'static,
    ) -> Result<Response<Mutation>> {
        self.call(move |state| async move {
            let waiting = std::time::Instant::now();
            let session = state.sessions.get(&request).await?;
            let _session_guard = session.gate.read().await;
            let change = change(request.into_inner());
            let hint_parent = match &change {
                Change::Create(r) => Some((r.parent_id.clone(), r.name.clone())),
                Change::Rename(r) => Some((r.parent_id.clone(), r.name.clone())),
                _ => None,
            };
            let locks = state.locks(&session.info.workspace_id).await;
            let file = change.file()?;
            let _topology_write = if file.is_none() {
                Some(locks.topology.write().await)
            } else {
                None
            };
            let _topology_read = if file.is_some() {
                Some(locks.topology.read().await)
            } else {
                None
            };
            let file_lock = match file {
                Some(id) => Some(locks.file(&id).await),
                None => None,
            };
            let _file_guard = match &file_lock {
                Some(lock) => Some(lock.lock().await),
                None => None,
            };
            tracing::debug!(target: "dfs_server_v2::profile", operation = change.name(),
                elapsed_us = waiting.elapsed().as_micros() as u64, phase = "locks",
                "filesystem phase");
            let response = state
                .storage
                .transact(|snapshot| {
                    let session = &session;
                    let change = change.clone();
                    let ancestry = state.ancestry.clone();
                    async move {
                        session.active()?;
                        let (view, candidate) = tokio::join!(
                            measured(
                                "workspace",
                                View::prefetch(
                                    snapshot.clone(),
                                    &session.info.workspace_id,
                                    session.grants.clone(),
                                    change.primary_id(),
                                    change.child_name(),
                                    ancestry,
                                ),
                            ),
                            change.prefetch(&snapshot, &session.info.workspace_id),
                        );
                        let (edit, response) = change.prepare(&view?, candidate).await?;
                        session.active()?;
                        Ok((edit.batch, response))
                    }
                })
                .instrument(tracing::debug_span!(target: "dfs_server_v2::profile",
                    "mutation", operation = change.name()))
                .await?;
            if let (Some((parent, name)), Some(object)) = (hint_parent, &response.object) {
                let keys = Keys::new(&session.info.workspace_id)?;
                state.ancestry.remember(&keys, &object.id, &parent).await;
                state
                    .ancestry
                    .remember_child(&keys, &parent, &name, &object.id)
                    .await;
            }
            Ok(response)
        })
        .await
    }
    async fn read_call<T, U, F, Fut>(
        &self,
        request: Request<T>,
        target: fn(&T) -> (&str, Option<&str>),
        operation: F,
    ) -> Result<Response<U>>
    where
        T: Send + Sync + 'static,
        U: Send + 'static,
        F: FnOnce(View, T) -> Fut + Send + 'static,
        Fut: Future<Output = Result<U>> + Send + 'static,
    {
        self.call(move |state| async move {
            let session = state.sessions.get(&request).await?;
            let (id, child_name) = target(request.get_ref());
            let view = View::prefetch(
                state.storage.snapshot().await?,
                &session.info.workspace_id,
                session.grants.clone(),
                id,
                child_name,
                state.ancestry.clone(),
            )
            .await?;
            let response = operation(view, request.into_inner()).await?;
            session.active()?;
            Ok(response)
        })
        .await
    }
}
#[tonic::async_trait]
impl Dfs for Api {
    async fn search_files(
        &self,
        request: Request<SearchFilesRequest>,
    ) -> Result<Response<SearchFilesResponse>> {
        self.call(move |state| async move {
            let session = state.sessions.get(&request).await?;
            dfs_protocol::validate::search(request.get_ref())?;
            let search = state
                .search
                .get()
                .ok_or_else(|| status(ErrorCode::Unavailable))?;
            let response = search
                .files(
                    &state,
                    &session.info.workspace_id,
                    session.grants.clone(),
                    request.into_inner(),
                )
                .await?;
            session.active()?;
            Ok(response)
        })
        .await
    }
    async fn get_index_status(
        &self,
        request: Request<IndexStatusRequest>,
    ) -> Result<Response<IndexStatus>> {
        self.call(move |state| async move {
            state
                .workspace_authority(&request, &request.get_ref().workspace_id)
                .await?;
            let search = state
                .search
                .get()
                .ok_or_else(|| status(ErrorCode::Unavailable))?;
            tokio::time::timeout(
                std::time::Duration::from_secs(10),
                search.status(&state, &request.get_ref().workspace_id),
            )
            .await
            .map_err(|_| status(ErrorCode::Capacity))?
        })
        .await
    }

    async fn create_workspace(
        &self,
        request: Request<CreateWorkspaceRequest>,
    ) -> Result<Response<Workspace>> {
        self.call(move |state| async move {
            state.server_authority(&request)?;
            let request = request.into_inner();
            let keys = Keys::new(&request.workspace_id)?;
            let grants = validate::grants(request.root_grants)?;
            let _guard = state.creation.lock().await;
            let key = auth::secret()?;
            let root = Record {
                object: model::new_object(true, 0o755)?,
                parent: None,
            };
            let workspace = WorkspaceRecord {
                root: root.object.id.clone(),
                key_hash: auth::hash(&key),
            };
            state
                .storage
                .transact(|snapshot| {
                    let (keys, root, workspace, grants) = (&keys, &root, &workspace, &grants);
                    async move {
                        if snapshot.get(keys.workspace()).await?.is_some() {
                            return Err(status(ErrorCode::AlreadyExists));
                        }
                        let mut edit = Edit::new();
                        edit.record(keys, root)?;
                        edit.put(keys.workspace(), encode(workspace)?)?;
                        for grant in grants {
                            edit.grant(keys, &root.object.id, grant, true)?;
                        }
                        Ok((edit.batch, ()))
                    }
                })
                .await?;
            Ok(Workspace {
                workspace_id: request.workspace_id,
                root_id: root.object.id,
                workspace_key: key,
            })
        })
        .await
    }
    async fn create_session(
        &self,
        request: Request<CreateSessionRequest>,
    ) -> Result<Response<Session>> {
        self.call(move |state| async move {
            let workspace = state
                .workspace_authority(&request, &request.get_ref().workspace_id)
                .await?;
            let request = request.into_inner();
            let grants = validate::grants(request.grants)?;
            state
                .sessions
                .create(
                    Session {
                        id: uuid::Uuid::new_v4().simple().to_string(),
                        workspace_id: request.workspace_id,
                        grants: grants.iter().cloned().collect(),
                        session_key: String::new(),
                        expires_at: model::now()?.seconds as u64 + 3600,
                        root_id: workspace.root,
                    },
                    grants,
                )
                .await
        })
        .await
    }
    async fn current_session(&self, request: Request<Empty>) -> Result<Response<Session>> {
        self.call(move |state| async move { Ok(state.sessions.get(&request).await?.info.clone()) })
            .await
    }
    async fn close_session(&self, request: Request<Empty>) -> Result<Response<Empty>> {
        self.call(move |state| async move {
            state.sessions.close(&request).await?;
            Ok(Empty {})
        })
        .await
    }
    async fn list_grants(
        &self,
        request: Request<ListGrantsRequest>,
    ) -> Result<Response<GrantPage>> {
        self.call(move |state| async move {
            state
                .workspace_authority(&request, &request.get_ref().workspace_id)
                .await?;
            let request = request.into_inner();
            if !(1..=512).contains(&request.limit) {
                return Err(status(ErrorCode::InvalidInput));
            }
            if let Some(after) = &request.after {
                validate::grant(after)?;
            }
            let view = View::new(&state.storage, &request.workspace_id, BTreeSet::new()).await?;
            let record = view.object(&request.object_id).await?;
            let prefix = view.keys.grants(&record.object.id)?;
            let rows = view
                .rows(
                    prefix.clone(),
                    request.after.as_deref().map(str::as_bytes),
                    request.limit as usize + 1,
                )
                .await?;
            let mut grants = rows
                .into_iter()
                .map(|(key, _)| String::from_utf8(key[prefix.len()..].to_vec()).map_err(failed))
                .collect::<Result<Vec<_>>>()?;
            let next_after = if grants.len() > request.limit as usize {
                grants.pop();
                grants.last().cloned()
            } else {
                None
            };
            Ok(GrantPage {
                grants,
                next_after,
                version: record.object.version,
            })
        })
        .await
    }
    async fn update_grants(
        &self,
        request: Request<UpdateGrantsRequest>,
    ) -> Result<Response<Object>> {
        self.call(move |state| async move {
            state
                .workspace_authority(&request, &request.get_ref().workspace_id)
                .await?;
            let request = request.into_inner();
            if request.changes.len() > MAX_GRANTS {
                return Err(status(ErrorCode::InvalidInput));
            }
            let locks = state.locks(&request.workspace_id).await;
            let _guard = locks.topology.write().await;
            state
                .storage
                .transact(|snapshot| {
                    let request = request.clone();
                    async move {
                        let view =
                            View::from_snapshot(snapshot, &request.workspace_id, BTreeSet::new())
                                .await?;
                        let (edit, object) = view.update_grants(request).await?;
                        Ok((edit.batch, object))
                    }
                })
                .await
        })
        .await
    }
    async fn stat(&self, request: Request<ObjectRequest>) -> Result<Response<Object>> {
        self.read_call(
            request,
            |r| (&r.object_id, None),
            |view, request| async move { view.session_stat(&request.object_id).await },
        )
        .await
    }
    async fn lookup(&self, request: Request<LookupRequest>) -> Result<Response<Object>> {
        self.read_call(
            request,
            |r| (&r.parent_id, Some(&r.name)),
            |view, request| async move { view.lookup(&request.parent_id, &request.name).await },
        )
        .await
    }
    async fn list(&self, request: Request<ListRequest>) -> Result<Response<Page>> {
        self.read_call(
            request,
            |r| (&r.directory_id, None),
            |view, request| async move {
                view.list(
                    &request.directory_id,
                    request.after.as_deref(),
                    request.limit,
                )
                .await
            },
        )
        .await
    }
    async fn read(&self, request: Request<ReadRequest>) -> Result<Response<ReadResponse>> {
        self.call(move |state| async move {
            let session = state.sessions.get(&request).await?;
            let request = request.into_inner();
            let snapshot = state.storage.snapshot().await?;
            let (view, read_ahead) = tokio::join!(
                View::prefetch(
                    snapshot.clone(),
                    &session.info.workspace_id,
                    session.grants.clone(),
                    &request.object_id,
                    None,
                    state.ancestry.clone(),
                ),
                prefetch_read(&snapshot, &session.info.workspace_id, &request),
            );
            let response = view?.read(request, read_ahead).await?;
            session.active()?;
            Ok(response)
        })
        .await
    }
    async fn fsync(&self, request: Request<ObjectRequest>) -> Result<Response<Object>> {
        self.read_call(
            request,
            |r| (&r.object_id, None),
            |view, request| async move { view.session_stat(&request.object_id).await },
        )
        .await
    }
    async fn create(&self, request: Request<CreateRequest>) -> Result<Response<Mutation>> {
        self.change(request, Change::Create).await
    }
    async fn update(&self, request: Request<UpdateRequest>) -> Result<Response<Mutation>> {
        self.change(request, Change::Update).await
    }
    async fn rename(&self, request: Request<RenameRequest>) -> Result<Response<Mutation>> {
        self.change(request, Change::Rename).await
    }
    async fn remove(&self, request: Request<RemoveRequest>) -> Result<Response<Mutation>> {
        self.change(request, Change::Remove).await
    }
    async fn write(&self, request: Request<WriteRequest>) -> Result<Response<Mutation>> {
        self.change(request, Change::Write).await
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::storage::{Storage, StorageConfig, WriteBatch};
    use anyhow::Context;
    use std::time::Duration;

    fn request<T>(key: &str, body: T) -> anyhow::Result<Request<T>> {
        let mut request = Request::new(body);
        request
            .metadata_mut()
            .insert("authorization", format!("Bearer {key}").parse()?);
        Ok(request)
    }

    pub(crate) async fn cancelled_write_keeps_guards_until_publication_before_close_and_revocation()
    -> anyhow::Result<()> {
        let storage = Storage::open(&StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-cancellation-{}", uuid::Uuid::new_v4().simple()),
        })
        .await?;
        let key = "ab".repeat(32);
        let api = Api(State::new(storage, &key)?);
        let workspace = api
            .create_workspace(request(
                &key,
                CreateWorkspaceRequest {
                    workspace_id: "cancel".into(),
                    root_grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let owner = api
            .create_session(request(
                &workspace.workspace_key,
                CreateSessionRequest {
                    workspace_id: workspace.workspace_id.clone(),
                    grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let file = api
            .create(request(
                &owner.session_key,
                CreateRequest {
                    parent_id: workspace.root_id,
                    name: "file".into(),
                    expected_parent_version: 1,
                    mode: 0o600,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner()
            .object
            .context("created file")?;
        let file = api
            .update_grants(request(
                &workspace.workspace_key,
                UpdateGrantsRequest {
                    workspace_id: workspace.workspace_id.clone(),
                    object_id: file.id,
                    expected_version: file.version,
                    changes: vec![GrantChange {
                        grant: "writer".into(),
                        attached: true,
                    }],
                },
            )?)
            .await?
            .into_inner();
        let writer = api
            .create_session(request(
                &workspace.workspace_key,
                CreateSessionRequest {
                    workspace_id: workspace.workspace_id.clone(),
                    grants: vec!["writer".into()],
                },
            )?)
            .await?
            .into_inner();
        let locks = api.0.locks(&workspace.workspace_id).await;
        let file_lock = locks.file(&file.id).await;
        let blocked_file = file_lock.lock().await;
        let session = api
            .0
            .sessions
            .get(&request(&writer.session_key, Empty {})?)
            .await?;
        let write = request(
            &writer.session_key,
            WriteRequest {
                object_id: file.id.clone(),
                expected_version: file.version,
                data: b"committed".to_vec(),
                ..Default::default()
            },
        )?;
        let caller_api = api.clone();
        let caller = tokio::spawn(async move { caller_api.write(write).await });
        tokio::time::timeout(Duration::from_secs(2), async {
            while session.gate.try_write().is_ok() || locks.topology.try_write().is_ok() {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        })
        .await?;
        caller.abort();
        assert!(caller.await.is_err());
        let close_api = api.clone();
        let close = request(&writer.session_key, Empty {})?;
        let closing = tokio::spawn(async move { close_api.close_session(close).await });
        let revoke_api = api.clone();
        let revoke = request(
            &workspace.workspace_key,
            UpdateGrantsRequest {
                workspace_id: workspace.workspace_id.clone(),
                object_id: file.id.clone(),
                expected_version: file.version,
                changes: vec![GrantChange {
                    grant: "writer".into(),
                    attached: false,
                }],
            },
        )?;
        let revoking = tokio::spawn(async move { revoke_api.update_grants(revoke).await });
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!closing.is_finished());
        assert!(!revoking.is_finished());
        drop(blocked_file);
        tokio::time::timeout(Duration::from_secs(2), closing).await???;
        let revoked = tokio::time::timeout(Duration::from_secs(2), revoking)
            .await??
            .err()
            .context("stale revocation accepted")?;
        assert_eq!(
            dfs_protocol::error::code(&revoked),
            ErrorCode::VersionConflict
        );
        let published = api
            .stat(request(
                &owner.session_key,
                ObjectRequest {
                    object_id: file.id.clone(),
                },
            )?)
            .await?
            .into_inner();
        assert_ne!(published.version, file.version);
        let revoked = api
            .update_grants(request(
                &workspace.workspace_key,
                UpdateGrantsRequest {
                    workspace_id: workspace.workspace_id,
                    object_id: file.id.clone(),
                    expected_version: published.version,
                    changes: vec![GrantChange {
                        grant: "writer".into(),
                        attached: false,
                    }],
                },
            )?)
            .await?
            .into_inner();
        let data = Dfs::read(
            &api,
            request(
                &owner.session_key,
                ReadRequest {
                    object_id: file.id.clone(),
                    length: 9,
                    ..Default::default()
                },
            )?,
        )
        .await?
        .into_inner();
        assert_eq!(data.data, b"committed");
        assert_eq!(data.version, revoked.version);
        let closed = api
            .stat(request(
                &writer.session_key,
                ObjectRequest { object_id: file.id },
            )?)
            .await
            .err()
            .context("closed session accepted")?;
        assert_eq!(
            dfs_protocol::error::code(&closed),
            ErrorCode::Unauthenticated
        );
        api.0
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
