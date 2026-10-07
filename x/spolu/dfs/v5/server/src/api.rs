use crate::{
    State, auth,
    keys::Keys,
    model::{self, Record, TenantRecord},
    mutation::{Change, Edit},
    profile::{Guard, Phase},
    read::View,
    storage::{encode, failed},
};
#[cfg(test)]
use dfs_protocol::ObjectRef;
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
    pub async fn filter_search_candidates(
        &self,
        request: Request<Vec<dfs_protocol::ObjectId>>,
    ) -> Result<Response<Vec<dfs_protocol::ObjectId>>> {
        self.call(move |state| async move {
            let session = state.sessions.get(&request).await?;
            let ids = request.into_inner();
            if ids.len() > dfs_core::tree::MAX_AUTH_BATCH {
                return Err(status(ErrorCode::InvalidInput));
            }
            if let Some(authority) = state.permissions.pin(&session.info.tenant_id) {
                let result = authority.filter_candidates(ids.clone(), &session.grants);
                session.active()?;
                if authority.check().is_ok() {
                    return result;
                }
            }
            let view = View::for_grants(
                state.storage.snapshot().await?,
                &session.info.tenant_id,
                session.grants.clone(),
            )
            .await?;
            let result = view.filter_search_candidates(ids).await;
            session.active()?;
            result
        })
        .await
    }

    /// Accepted work MUST finish its commit decision even when the RPC caller disconnects.
    async fn call<T, F, Fut>(&self, operation: F) -> Result<Response<T>>
    where
        T: Send + 'static,
        F: FnOnce(Arc<State>) -> Fut + Send + 'static,
        Fut: Future<Output = Result<T>> + Send + 'static,
    {
        let admission_wait = Guard::new(Phase::Admission);
        let permit = self
            .0
            .admission
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| status(ErrorCode::Capacity))?;
        drop(admission_wait);
        let state = self.0.clone();
        let value = tokio::spawn(async move {
            let _permit = permit;
            operation(state).await
        })
        .await
        .map_err(failed)??;
        Ok(Response::new(value))
    }
    #[cfg(test)]
    async fn change<T: Send + Sync + 'static>(
        &self,
        request: Request<T>,
        change: impl FnOnce(T) -> Change + Send + 'static,
    ) -> Result<Response<Mutation>> {
        let session = self.0.sessions.get(&request).await?;
        let mut change = change(request.into_inner());
        if let Change::Create(r) = &mut change
            && r.object_id.is_empty()
        {
            r.object_id = ObjectRef::new_v4();
        }
        self.mutate_group(session, vec![change])
            .await
            .map(Response::new)
    }
    /// @cc [owner:spolu,label:concurrency] bounded-independent-mutation-admission
    /// Queued groups MUST be bounded separately from active transactions. A single global gate MUST
    /// bound transaction execution. Accepted groups MUST finish after disconnection.
    async fn mutate_group(
        &self,
        session: Arc<auth::SessionState>,
        changes: Vec<Change>,
    ) -> Result<Mutation> {
        let waiting = Guard::new(Phase::MutationQueue);
        let queued = self
            .0
            .mutations
            .clone()
            .acquire_owned()
            .await
            .map_err(failed)?;
        drop(waiting);
        let state = self.0.clone();
        tokio::spawn(async move {
            let _queued = queued;
            apply_group(state, session, changes).await
        })
        .await
        .map_err(failed)?
    }
    pub(crate) async fn read_call<T, U, F, Fut>(
        &self,
        request: Request<T>,
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
            let body = request.into_inner();
            for use_ram in [true, false] {
                let snapshot = state.storage.snapshot().await?;
                let mut view =
                    View::for_grants(snapshot, &session.info.tenant_id, session.grants.clone())
                        .await?;
                let authority = use_ram
                    .then(|| state.permissions.pin(&session.info.tenant_id))
                    .flatten();
                if let Some(authority) = &authority {
                    if let Err(error) = view.bind_ram_authority(authority.clone()) {
                        if dfs_protocol::error::code(&error) == ErrorCode::StaleView {
                            continue;
                        }
                        return Err(error);
                    }
                } else {
                    view.bind_fdb_authority(state.incarnation).await?;
                }
                let result = operation(view, body.clone()).await;
                session.active()?;
                if authority.is_some_and(|a| a.check().is_err()) {
                    continue;
                }
                return result;
            }
            Err(status(ErrorCode::Unavailable))
        })
        .await
    }
}

/// @cc [owner:spolu,label:backend;concurrency] one-group-one-commit
/// Each group MUST commit independently after transactional authorization of every edit. Its response
/// MUST carry revisions actually written by that commit. Failed groups MUST publish no partial state.
/// Collision reads MUST remain conflict-tracked and preserve validation/error ordering.
async fn apply_group(
    state: Arc<State>,
    session: Arc<auth::SessionState>,
    changes: Vec<Change>,
) -> Result<Mutation> {
    let _profile = Guard::new(Phase::Batch);
    let first = changes
        .first()
        .ok_or_else(|| status(ErrorCode::InvalidInput))?;
    validate::id_ref(first.primary_id())?;
    #[cfg(test)]
    crate::tests::pause(&state.pauses, &changes).await;
    let waiting = Guard::new(Phase::Admission);
    let _admitted = state
        .admission
        .clone()
        .acquire_owned()
        .await
        .map_err(failed)?;
    drop(waiting);
    let _gate = session.gate.read().await;
    let tree_log_limits = state.tree_log_limits;
    let mut result = Err(status(ErrorCode::Unavailable));
    for use_ram in [true, false] {
        result = state
            .storage
            .transact_versioned(|snapshot| {
                let (changes, session, permissions) = (&changes, &session, &state.permissions);
                #[cfg(test)]
                let pauses = &state.prepare_pauses;
                async move {
                    session.active()?;
                    let mut view = View::for_grants(
                        snapshot.clone(),
                        &session.info.tenant_id,
                        session.grants.clone(),
                    )
                    .await?;
                    view.tree_log_limits = tree_log_limits;
                    if use_ram && let Some(authority) = permissions.pin(&session.info.tenant_id) {
                        view.bind_ram_authority(authority)?;
                    }
                    let result = prepare_group(&view, changes).await?;
                    #[cfg(test)]
                    crate::tests::pause(pauses, changes).await;
                    view.check_authority()?;
                    session.active()?;
                    Ok((crate::storage::WriteBatch::new(), result))
                }
            })
            .await;
        // StaleView here can only come from preparation before commit. Storage maps every commit
        // error, including an unknown outcome, to Unavailable; those outcomes are never replayed.
        if !matches!(&result, Err(error) if dfs_protocol::error::code(error) == ErrorCode::StaleView)
        {
            break;
        }
    }
    if result.is_ok()
        && changes.iter().any(|change| {
            matches!(
                change,
                Change::Create(_) | Change::Rename(_) | Change::Remove(_)
            )
        })
    {
        state.permissions.wake(&session.info.tenant_id);
    }
    #[cfg(test)]
    crate::tests::pause(&state.reply_pauses, &changes).await;
    result.map(|(mut mutation, version)| {
        mutation.commit_version = version.max(0);
        for object in mutation.object.iter_mut().chain(&mut mutation.related) {
            object.read_version = object.read_version.max(version);
        }
        mutation
    })
}

pub(crate) use dfs_core::mutation::prepare_group;

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
    dfs_core::mutation::validate_group(&edits)?;
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
                root: root.object.id,
                key_hash: auth::hash(&key),
            };
            state
                .storage
                .transact(|snapshot| {
                    let (keys, root, tenant, grants) = (&keys, &root, &tenant, &grants);
                    let tenant_id = &request.tenant_id;
                    async move {
                        if snapshot.get(keys.tenant()).await?.is_some() {
                            return Err(status(ErrorCode::AlreadyExists));
                        }
                        let mut edit = Edit::new();
                        edit.record(keys, root)?;
                        edit.put(keys.tenant(), encode(tenant)?)?;
                        let grants = dfs_core::grants::intern(&snapshot, keys, grants).await?;
                        for (name, grant) in grants {
                            edit.grant(keys, &root.object.id, grant, &name, true)?;
                        }
                        edit.put(
                            keys.tree_incarnation(),
                            dfs_protocol::ObjectId::new_v4().as_bytes().to_vec(),
                        )?;
                        edit.put(Keys::registered_tenant(tenant_id)?, Vec::new())?;
                        edit.batch.apply(&snapshot)?;
                        dfs_core::tree_log::publish(&snapshot, keys, &[root.object.id].into())
                            .await?;
                        Ok((crate::storage::WriteBatch::new(), ()))
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
            let keys = Keys::new(&request.tenant_id)?;
            let ids = state
                .storage
                .transact(|snapshot| {
                    let (keys, grants) = (&keys, &grants);
                    async move {
                        let grants = dfs_core::grants::intern(&snapshot, keys, grants).await?;
                        let mut ids: Vec<_> = grants.into_values().collect();
                        ids.sort_unstable();
                        Ok((crate::storage::WriteBatch::new(), Arc::from(ids)))
                    }
                })
                .await?;
            let session = state
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
                    ids,
                )
                .await?;
            state.permissions.wake(&session.tenant_id);
            Ok(session)
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
            state.permissions.wake(&session.info.tenant_id);
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
            let prefix = view.keys.grant_names(&record.object.id)?;
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
    async fn update_grants(&self, request: Request<UpdateGrantsRequest>) -> Result<Response<Attr>> {
        self.call(move |state| async move {
            state
                .tenant_authority(&request, &request.get_ref().tenant_id)
                .await?;
            let request = request.into_inner();
            if request.changes.len() > MAX_GRANTS {
                return Err(status(ErrorCode::InvalidInput));
            }
            let object = state
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
                        let object = view.object(&object.id).await?.object;
                        dfs_core::tree_log::publish(&snapshot, &view.keys, &edit.tree).await?;
                        Ok((crate::storage::WriteBatch::new(), object))
                    }
                })
                .await?;
            state.permissions.wake(&request.tenant_id);
            Ok(object)
        })
        .await
    }
    async fn lookup(&self, r: Request<LookupRequest>) -> Result<Response<LookupResponse>> {
        let _profile = Guard::new(Phase::Lookup);
        self.read_call(r, |v, r| async move {
            Ok(LookupResponse {
                object: v.lookup(&r.parent_id, &r.name).await?,
                view: v.read_view(),
            })
        })
        .await
    }
    async fn list(&self, r: Request<ListRequest>) -> Result<Response<Page>> {
        let _profile = Guard::new(Phase::List);
        #[cfg(test)]
        let directory = r.get_ref().directory_id;
        let response = self
            .read_call(r, |v, r| async move {
                v.list(&r.directory_id, r.after.as_deref(), r.limit).await
            })
            .await?;
        #[cfg(test)]
        crate::tests::pause_listing(&self.0.list_reply_pauses, &directory).await;
        Ok(response)
    }
    async fn read(&self, r: Request<ReadRequest>) -> Result<Response<ReadResponse>> {
        let _profile = Guard::new(Phase::Read);
        self.read_call(r, |v, r| async move { v.read(r).await })
            .await
    }
    async fn stat(&self, r: Request<StatRequest>) -> Result<Response<StatResponse>> {
        let _profile = Guard::new(Phase::Stat);
        self.read_call(r, |v, r| async move {
            if !(1..=dfs_protocol::MAX_STAT).contains(&r.object_ids.len()) {
                return Err(status(ErrorCode::InvalidInput));
            }
            let results = futures::stream::iter(r.object_ids)
                .map(|id| {
                    let view = &v;
                    async move {
                        let mut result = StatResult {
                            object_id: id,
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
            Ok(StatResponse {
                results,
                view: v.read_view(),
            })
        })
        .await
    }
    async fn validate(&self, r: Request<ValidateRequest>) -> Result<Response<ValidateResponse>> {
        let _profile = Guard::new(Phase::Validate);
        self.read_call(r, |v, r| async move { v.validate_batch(r).await })
            .await
    }
    async fn get_metadata(&self, r: Request<ObjectRequest>) -> Result<Response<Metadata>> {
        let _profile = Guard::new(Phase::Metadata);
        self.read_call(r, |v, r| async move { v.metadata(&r.object_id).await })
            .await
    }
    async fn read_files(
        &self,
        r: Request<ReadFilesRequest>,
    ) -> Result<Response<ReadFilesResponse>> {
        let _profile = Guard::new(Phase::ReadFiles);
        #[cfg(test)]
        let target = r.get_ref().object_ids.first().copied();
        let response = self
            .read_call(r, |v, r| async move { v.read_files(r).await })
            .await;
        #[cfg(test)]
        if let Some(target) = target {
            crate::tests::pause_listing(&self.0.content_reply_pauses, &target).await;
        }
        response
    }
    type MutateBatchStream =
        std::pin::Pin<Box<dyn futures::Stream<Item = Result<GroupResult>> + Send>>;
    async fn mutate_batch(
        &self,
        r: Request<MutateBatchRequest>,
    ) -> Result<Response<Self::MutateBatchStream>> {
        let session = self.0.sessions.get(&r).await?;
        let request = r.into_inner();
        if prost::Message::encoded_len(&request) > dfs_protocol::MAX_IO {
            return Err(status(ErrorCode::Capacity));
        }
        if request.groups.is_empty() || request.groups.len() > 64 {
            return Err(status(ErrorCode::InvalidInput));
        }
        let mut ids = BTreeSet::new();
        if request.groups.iter().any(|g| !ids.insert(g.id)) {
            return Err(status(ErrorCode::InvalidInput));
        }
        let waiting = Guard::new(Phase::BatchAdmission);
        let accepted = self
            .0
            .batches
            .clone()
            .acquire_owned()
            .await
            .map_err(failed)?;
        drop(waiting);
        let (tx, rx) = tokio::sync::mpsc::channel(64);
        let received = std::time::Instant::now();
        let api = self.clone();
        tokio::spawn(async move {
            let _accepted = accepted;
            let tasks = futures::stream::iter(request.groups)
                .map(|group| {
                    let api = api.clone();
                    let session = session.clone();
                    async move {
                        crate::profile::record(Phase::BatchQueue, received.elapsed());
                        let id = group.id;
                        let result = match changes(group) {
                            Ok(edits) => api.mutate_group(session, edits).await,
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
                .buffer_unordered(64);
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
}

#[cfg(test)]
impl Api {
    pub async fn stat_one(&self, r: Request<ObjectRequest>) -> Result<Response<Attr>> {
        let _profile = Guard::new(Phase::Stat);
        self.read_call(r, |v, r| async move { v.session_stat(&r.object_id).await })
            .await
    }
    pub async fn create(&self, r: Request<CreateRequest>) -> Result<Response<Mutation>> {
        self.change(r, Change::Create).await
    }
    pub async fn update(&self, r: Request<UpdateRequest>) -> Result<Response<Mutation>> {
        self.change(r, Change::Update).await
    }
    pub async fn rename(&self, r: Request<RenameRequest>) -> Result<Response<Mutation>> {
        self.change(r, Change::Rename).await
    }
    pub async fn remove(&self, r: Request<RemoveRequest>) -> Result<Response<Mutation>> {
        self.change(r, Change::Remove).await
    }
    pub async fn write(&self, r: Request<WriteRequest>) -> Result<Response<Mutation>> {
        self.change(r, Change::Write).await
    }
}
