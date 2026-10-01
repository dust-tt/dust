use crate::{
    State, auth,
    keys::Keys,
    model::{self, Record, WorkspaceRecord},
    mutation::{Change, Edit},
    read::View,
    storage::{encode, failed},
};
use dfs_protocol::{
    MAX_GRANTS,
    error::status,
    rpc::{dfs_server::Dfs, *},
    validate,
};
use std::{collections::BTreeSet, future::Future, sync::Arc};
use tonic::{Request, Response, Status};

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
            let session = state.sessions.get(&request).await?;
            let _session_guard = session.gate.read().await;
            let change = change(request.into_inner());
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
            session.active()?;
            let view = View::new(
                &state.storage,
                &session.info.workspace_id,
                session.grants.clone(),
            )
            .await?;
            let (edit, response) = change.prepare(&view).await?;
            session.active()?;
            state.storage.publish(edit.batch).await?;
            Ok(response)
        })
        .await
    }
    async fn read_call<T, U, F, Fut>(
        &self,
        request: Request<T>,
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
            let view = View::new(
                &state.storage,
                &session.info.workspace_id,
                session.grants.clone(),
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
            if state
                .storage
                .db
                .get(keys.workspace())
                .await
                .map_err(failed)?
                .is_some()
            {
                return Err(status(ErrorCode::AlreadyExists));
            }
            let key = auth::secret()?;
            let root = Record {
                object: model::new_object(true, 0o755)?,
                parent: None,
            };
            let workspace = WorkspaceRecord {
                root: root.object.id.clone(),
                key_hash: auth::hash(&key),
            };
            let mut edit = Edit::new();
            edit.record(&keys, &root)?;
            edit.put(keys.workspace(), encode(&workspace)?)?;
            for grant in grants {
                edit.grant(&keys, &root.object.id, &grant, true)?;
            }
            state.storage.publish(edit.batch).await?;
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
            let view = View::new(&state.storage, &request.workspace_id, BTreeSet::new()).await?;
            let (edit, object) = view.update_grants(request).await?;
            state.storage.publish(edit.batch).await?;
            Ok(object)
        })
        .await
    }
    async fn stat(&self, request: Request<ObjectRequest>) -> Result<Response<Object>> {
        self.read_call(request, |view, request| async move {
            view.session_stat(&request.object_id).await
        })
        .await
    }
    async fn lookup(&self, request: Request<LookupRequest>) -> Result<Response<Object>> {
        self.read_call(request, |view, request| async move {
            view.lookup(&request.parent_id, &request.name).await
        })
        .await
    }
    async fn list(&self, request: Request<ListRequest>) -> Result<Response<Page>> {
        self.read_call(request, |view, request| async move {
            view.list(
                &request.directory_id,
                request.after.as_deref(),
                request.limit,
            )
            .await
        })
        .await
    }
    async fn read(&self, request: Request<ReadRequest>) -> Result<Response<ReadResponse>> {
        self.read_call(
            request,
            |view, request| async move { view.read(request).await },
        )
        .await
    }
    async fn fsync(&self, request: Request<ObjectRequest>) -> Result<Response<Object>> {
        self.read_call(request, |view, request| async move {
            view.session_stat(&request.object_id).await
        })
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
