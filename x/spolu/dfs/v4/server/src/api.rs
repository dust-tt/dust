use crate::{
    State, auth,
    keys::Keys,
    model::{self, Record, TenantRecord},
    mutation::{Change, Edit},
    profile::{Guard, Phase},
    read::View,
    storage::{encode, failed},
};
use dfs_protocol::{
    MAX_GRANTS,
    error::status,
    rpc::{dfs_server::Dfs, *},
    validate,
};
use futures::StreamExt;
use std::{collections::BTreeSet, future::Future, sync::Arc};
use tonic::{Request, Response, Status};
type Result<T> = std::result::Result<T, Status>;
#[derive(Clone)]
pub struct Api(pub Arc<State>);
impl Api {
    /// Accepted work MUST finish its commit decision even when the RPC caller disconnects.
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
            .acquire_owned()
            .await
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
            let mut change = change(request.into_inner());
            if let Change::Create(r) = &mut change
                && r.object_id.is_empty()
            {
                r.object_id = uuid::Uuid::new_v4().simple().to_string();
            }
            apply_group(state, session, vec![change]).await
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
        T: Clone + Send + Sync + 'static,
        U: Send + 'static,
        F: Fn(View, T) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<U>> + Send + 'static,
    {
        self.call(move |state| async move {
            let session = state.sessions.get(&request).await?;
            let snapshot = state.storage.snapshot().await?;
            let (id, child) = target(request.get_ref());
            let view = View::prefetch(
                snapshot,
                &session.info.tenant_id,
                session.grants.clone(),
                id,
                child,
                state.ancestry.clone(),
            )
            .await?;
            let result = operation(view, request.into_inner()).await;
            session.active()?;
            result
        })
        .await
    }
}

/// @cc [owner:spolu,label:backend;concurrency] one-group-one-commit
/// Each group MUST commit independently after transactional authorization of every edit. Its response
/// MUST carry revisions actually written by that commit. Failed groups MUST publish no partial state.
async fn apply_group(
    state: Arc<State>,
    session: Arc<auth::SessionState>,
    changes: Vec<Change>,
) -> Result<Mutation> {
    #[cfg(test)]
    crate::tests::pause(&state, &changes).await;
    let _profile = Guard::new(Phase::Batch);
    let first = changes
        .first()
        .ok_or_else(|| status(ErrorCode::InvalidInput))?;
    validate::id_ref(first.primary_id())?;
    let scheduling = state.schedule(&session.info.tenant_id, first.primary_id());
    let _scheduled = scheduling.lock().await;
    let _gate = session.gate.read().await;
    state
        .storage
        .transact(|snapshot| {
            let changes = &changes;
            let session = &session;
            let ancestry = state.ancestry.clone();
            async move {
                session.active()?;
                let first = changes
                    .first()
                    .ok_or_else(|| status(ErrorCode::InvalidInput))?;
                let view = View::prefetch(
                    snapshot.clone(),
                    &session.info.tenant_id,
                    session.grants.clone(),
                    first.primary_id(),
                    first.child_name(),
                    ancestry,
                )
                .await?;
                let mut result = Mutation::default();
                let mut related = BTreeSet::new();
                let mut bytes = 0;
                for change in changes {
                    let (edit, response) = change.clone().prepare(&view).await?;
                    bytes += edit.batch.bytes();
                    if bytes > dfs_protocol::MAX_IO {
                        return Err(status(ErrorCode::Capacity));
                    }
                    edit.batch.apply(&snapshot)?;
                    related.extend(response.related.iter().map(|v| v.id.clone()));
                    result.object = response.object;
                }
                if let Some(object) = &mut result.object {
                    *object = view.object(&object.id).await?.object;
                }
                for id in related {
                    result.related.push(view.object(&id).await?.object);
                }
                session.active()?;
                Ok((crate::storage::WriteBatch::new(), result))
            }
        })
        .await
}

/// Only same-target file edits, or a create followed by edits of its new target, may coalesce.
fn changes(group: MutationGroup) -> Result<Vec<Change>> {
    use edit::Operation;
    if group.edits.is_empty() || group.edits.len() > 128 {
        return Err(status(ErrorCode::InvalidInput));
    }
    let edits: Vec<_> = group
        .edits
        .into_iter()
        .map(|e| match e.operation {
            Some(Operation::Create(r)) => Ok(Change::Create(r)),
            Some(Operation::Update(r)) => Ok(Change::Update(r)),
            Some(Operation::Write(r)) => Ok(Change::Write(r)),
            Some(Operation::Rename(r)) => Ok(Change::Rename(r)),
            Some(Operation::Remove(r)) => Ok(Change::Remove(r)),
            None => Err(status(ErrorCode::InvalidInput)),
        })
        .collect::<Result<_>>()?;
    let first = &edits[0];
    let target = match first {
        Change::Create(r) => {
            validate::id(&r.object_id)?;
            &r.object_id
        }
        Change::Update(r) => &r.object_id,
        Change::Write(r) => &r.object_id,
        _ if edits.len() == 1 => return Ok(edits),
        _ => return Err(status(ErrorCode::InvalidInput)),
    };
    for edit in edits.iter().skip(1) {
        match edit {
            Change::Update(r) if r.object_id == *target => (),
            Change::Write(r) if r.object_id == *target => (),
            _ => return Err(status(ErrorCode::InvalidInput)),
        }
    }
    Ok(edits)
}
#[tonic::async_trait]
impl Dfs for Api {
    async fn create_tenant(
        &self,
        request: Request<CreateTenantRequest>,
    ) -> Result<Response<Tenant>> {
        self.call(move |state| async move {
            state.server_authority(&request)?;
            let request = request.into_inner();
            let keys = Keys::new(&request.tenant_id)?;
            let grants = validate::grants(request.root_grants)?;
            let _guard = state.creation.lock().await;
            let key = auth::secret()?;
            let root = Record {
                object: model::new_object(true, 0o755)?,
                parent: None,
                revision: uuid::Uuid::new_v4().into_bytes(),
            };
            let tenant = TenantRecord {
                root: root.object.id.clone(),
                key_hash: auth::hash(&key),
            };
            state
                .storage
                .transact(|snapshot| {
                    let (keys, root, tenant, grants) = (&keys, &root, &tenant, &grants);
                    async move {
                        if snapshot.get(keys.tenant()).await?.is_some() {
                            return Err(status(ErrorCode::AlreadyExists));
                        }
                        let mut edit = Edit::new();
                        edit.record(keys, root)?;
                        edit.put(keys.tenant(), encode(tenant)?)?;
                        for grant in grants {
                            edit.grant(keys, &root.object.id, grant, true)?;
                        }
                        Ok((edit.batch, ()))
                    }
                })
                .await?;
            Ok(Tenant {
                tenant_id: request.tenant_id,
                root_id: root.object.id,
                tenant_key: key,
            })
        })
        .await
    }
    async fn create_session(
        &self,
        request: Request<CreateSessionRequest>,
    ) -> Result<Response<Session>> {
        self.call(move |state| async move {
            let tenant = state
                .tenant_authority(&request, &request.get_ref().tenant_id)
                .await?;
            let request = request.into_inner();
            let grants = validate::grants(request.grants)?;
            state
                .sessions
                .create(
                    Session {
                        id: uuid::Uuid::new_v4().simple().to_string(),
                        tenant_id: request.tenant_id,
                        grants: grants.iter().cloned().collect(),
                        session_key: String::new(),
                        expires_at: model::now()?.seconds as u64 + 3600,
                        root_id: tenant.root,
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
            let session = state.sessions.get(&request).await?;
            let _guard = session.gate.write().await;
            state.sessions.close(&request, &session).await?;
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
                .tenant_authority(&request, &request.get_ref().tenant_id)
                .await?;
            let request = request.into_inner();
            if !(1..=512).contains(&request.limit) {
                return Err(status(ErrorCode::InvalidInput));
            }
            if let Some(after) = &request.after {
                validate::grant(after)?;
            }
            let snapshot = state.storage.snapshot().await?;
            let view =
                View::from_snapshot(snapshot.clone(), &request.tenant_id, BTreeSet::new()).await?;
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
                .map(|(k, _)| String::from_utf8(k[prefix.len()..].to_vec()).map_err(failed))
                .collect::<Result<Vec<_>>>()?;
            let next_after = if grants.len() > request.limit as usize {
                grants.pop();
                grants.last().cloned()
            } else {
                None
            };
            Ok(GrantPage { grants, next_after })
        })
        .await
    }
    async fn update_grants(
        &self,
        request: Request<UpdateGrantsRequest>,
    ) -> Result<Response<Object>> {
        self.call(move |state| async move {
            state
                .tenant_authority(&request, &request.get_ref().tenant_id)
                .await?;
            let request = request.into_inner();
            if request.changes.len() > MAX_GRANTS {
                return Err(status(ErrorCode::InvalidInput));
            }
            state
                .storage
                .transact(|snapshot| {
                    let request = request.clone();
                    async move {
                        let view = View::from_snapshot(
                            snapshot.clone(),
                            &request.tenant_id,
                            BTreeSet::new(),
                        )
                        .await?;
                        let (edit, object) = view.update_grants(request).await?;
                        edit.batch.apply(&snapshot)?;
                        Ok((
                            crate::storage::WriteBatch::new(),
                            view.object(&object.id).await?.object,
                        ))
                    }
                })
                .await
        })
        .await
    }
    async fn stat(&self, r: Request<ObjectRequest>) -> Result<Response<Object>> {
        let _profile = Guard::new(Phase::Stat);
        self.read_call(
            r,
            |r| (&r.object_id, None),
            |v, r| async move { v.session_stat(&r.object_id).await },
        )
        .await
    }
    async fn lookup(&self, r: Request<LookupRequest>) -> Result<Response<Object>> {
        let _profile = Guard::new(Phase::Lookup);
        self.read_call(
            r,
            |r| (&r.parent_id, Some(&r.name)),
            |v, r| async move { v.lookup(&r.parent_id, &r.name).await },
        )
        .await
    }
    async fn list(&self, r: Request<ListRequest>) -> Result<Response<Page>> {
        let _profile = Guard::new(Phase::List);
        self.read_call(
            r,
            |r| (&r.directory_id, None),
            |v, r| async move { v.list(&r.directory_id, r.after.as_deref(), r.limit).await },
        )
        .await
    }
    async fn read(&self, r: Request<ReadRequest>) -> Result<Response<ReadResponse>> {
        let _profile = Guard::new(Phase::Read);
        self.read_call(
            r,
            |r| (&r.object_id, None),
            |v, r| async move { v.read(r).await },
        )
        .await
    }
    // All preceding mutation responses already confirmed commits; this only refreshes the target.
    async fn fsync(&self, r: Request<ObjectRequest>) -> Result<Response<Object>> {
        self.stat(r).await
    }
    async fn stat_many(&self, r: Request<StatManyRequest>) -> Result<Response<StatManyResponse>> {
        self.read_call(
            r,
            |_| ("root", None),
            |v, r| async move {
                if r.object_ids.len() > 64 {
                    return Err(status(ErrorCode::InvalidInput));
                }
                let results = futures::stream::iter(r.object_ids)
                    .map(|id| {
                        let view = &v;
                        async move {
                            let mut result = StatResult {
                                object_id: id.clone(),
                                ..Default::default()
                            };
                            match view.session_stat(&id).await {
                                Ok(object) => result.object = Some(object),
                                Err(e) => {
                                    result.error = Some(ErrorDetails {
                                        code: dfs_protocol::error::code(&e).into(),
                                    })
                                }
                            }
                            result
                        }
                    })
                    .buffered(16)
                    .collect()
                    .await;
                Ok(StatManyResponse { results })
            },
        )
        .await
    }
    type MutateBatchStream =
        std::pin::Pin<Box<dyn futures::Stream<Item = Result<GroupResult>> + Send>>;
    async fn mutate_batch(
        &self,
        r: Request<MutateBatchRequest>,
    ) -> Result<Response<Self::MutateBatchStream>> {
        let session = self.0.sessions.get(&r).await?;
        let request = r.into_inner();
        if request.groups.is_empty() || request.groups.len() > 64 {
            return Err(status(ErrorCode::InvalidInput));
        }
        let mut ids = BTreeSet::new();
        if request.groups.iter().any(|g| !ids.insert(g.id)) {
            return Err(status(ErrorCode::InvalidInput));
        }
        let (tx, rx) = tokio::sync::mpsc::channel(64);
        let api = self.clone();
        tokio::spawn(async move {
            let tasks = futures::stream::iter(request.groups)
                .map(|group| {
                    let api = api.clone();
                    let session = session.clone();
                    async move {
                        let id = group.id;
                        let result = match changes(group) {
                            Ok(edits) => api
                                .call(move |state| apply_group(state, session, edits))
                                .await
                                .map(Response::into_inner),
                            Err(e) => Err(e),
                        };
                        match result {
                            Ok(mutation) => GroupResult {
                                id,
                                mutation: Some(mutation),
                                error: None,
                            },
                            Err(e) => GroupResult {
                                id,
                                mutation: None,
                                error: Some(ErrorDetails {
                                    code: dfs_protocol::error::code(&e).into(),
                                }),
                            },
                        }
                    }
                })
                .buffer_unordered(16);
            futures::pin_mut!(tasks);
            while let Some(result) = tasks.next().await {
                let _ = tx.send(Ok(result)).await;
            }
        });
        let stream = futures::stream::unfold(rx, |mut rx| async move {
            rx.recv().await.map(|item| (item, rx))
        });
        Ok(Response::new(Box::pin(stream)))
    }
    async fn create(&self, r: Request<CreateRequest>) -> Result<Response<Mutation>> {
        let _profile = Guard::new(Phase::Create);
        self.change(r, Change::Create).await
    }
    async fn update(&self, r: Request<UpdateRequest>) -> Result<Response<Mutation>> {
        let _profile = Guard::new(Phase::Update);
        self.change(r, Change::Update).await
    }
    async fn rename(&self, r: Request<RenameRequest>) -> Result<Response<Mutation>> {
        let _profile = Guard::new(Phase::Rename);
        self.change(r, Change::Rename).await
    }
    async fn remove(&self, r: Request<RemoveRequest>) -> Result<Response<Mutation>> {
        let _profile = Guard::new(Phase::Remove);
        self.change(r, Change::Remove).await
    }
    async fn write(&self, r: Request<WriteRequest>) -> Result<Response<Mutation>> {
        let _profile = Guard::new(Phase::Write);
        self.change(r, Change::Write).await
    }
}
