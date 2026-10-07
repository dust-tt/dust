use crate::{
    State, auth, cache,
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
use std::{
    collections::BTreeSet,
    future::Future,
    sync::Arc,
    time::{Duration, Instant},
};
use tonic::{Request, Response, Status};
type Result<T> = std::result::Result<T, Status>;
#[derive(Clone)]
pub struct Api(pub Arc<State>);
impl Api {
    /// Accepted work MUST finish its RAM decision even when the RPC caller disconnects.
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
            let _guard = session.gate.read().await;
            let change = change(request.into_inner());
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                let result = async {
                    session.active()?;
                    let snapshot = state.cache.snapshot().await?;
                    let view = View::prefetch(
                        snapshot.clone(),
                        &session.info.tenant_id,
                        session.grants.clone(),
                        change.primary_id(),
                        change.child_name(),
                        state.ancestry.clone(),
                    )
                    .await?;
                    state
                        .cache
                        .error(&session, &view.keys.object(change.primary_id())?)?;
                    let (edit, response) = change.clone().prepare(&view).await?;
                    let scope = scope(&view.keys, &edit);
                    let created = if matches!(change, Change::Create(_)) {
                        response
                            .object
                            .as_ref()
                            .map(|o| view.keys.object(&o.id))
                            .transpose()?
                    } else {
                        None
                    };
                    state.cache.accept(
                        &snapshot,
                        edit.batch,
                        scope,
                        change.file()?.is_some(),
                        created,
                        &session,
                    )?;
                    Ok(response)
                }
                .await;
                match result {
                    Err(e) if cache::is_retry(&e) && Instant::now() < deadline => {
                        tokio::time::sleep(Duration::from_millis(1)).await
                    }
                    Err(e) if cache::is_retry(&e) => return Err(status(ErrorCode::Unavailable)),
                    result => return result,
                }
            }
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
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                let snapshot = state.cache.snapshot().await?;
                let (id, child) = target(request.get_ref());
                let result = async {
                    let view = View::prefetch(
                        snapshot.clone(),
                        &session.info.tenant_id,
                        session.grants.clone(),
                        id,
                        child,
                        state.ancestry.clone(),
                    )
                    .await?;
                    operation(view, request.get_ref().clone()).await
                }
                .await;
                session.active()?;
                let result = snapshot.valid().and(result);
                match result {
                    Err(e) if cache::is_retry(&e) && Instant::now() < deadline => {
                        tokio::time::sleep(Duration::from_millis(1)).await
                    }
                    Err(e) if cache::is_retry(&e) => return Err(status(ErrorCode::Unavailable)),
                    result => return result,
                }
            }
        })
        .await
    }
}
fn scope(keys: &Keys, edit: &Edit) -> BTreeSet<Vec<u8>> {
    edit.batch
        .0
        .iter()
        .filter_map(|m| match m {
            crate::storage::Mutation::Put(k, _) | crate::storage::Mutation::Delete(k)
                if keys.owns_object_key(k) =>
            {
                Some(k.clone())
            }
            _ => None,
        })
        .collect()
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
            state.cache.invalidate_base().await;
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
            let snapshot = state.cache.snapshot().await?;
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
            snapshot.valid()?;
            Ok(GrantPage { grants, next_after })
        })
        .await
    }
    async fn update_grants(
        &self,
        request: Request<UpdateGrantsRequest>,
    ) -> Result<Response<Object>> {
        self.call(move |state| async move {
            let tenant = state
                .tenant_authority(&request, &request.get_ref().tenant_id)
                .await?;
            let request = request.into_inner();
            if request.changes.len() > MAX_GRANTS {
                return Err(status(ErrorCode::InvalidInput));
            }
            let session = state
                .admin_session(&request.tenant_id, &tenant.root)
                .await?;
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                let result = async {
                    let snapshot = state.cache.snapshot().await?;
                    let view =
                        View::from_snapshot(snapshot.clone(), &request.tenant_id, BTreeSet::new())
                            .await?;
                    let (edit, object) = view.update_grants(request.clone()).await?;
                    state.cache.accept(
                        &snapshot,
                        edit.batch,
                        BTreeSet::from([view.keys.object(&object.id)?]),
                        false,
                        None,
                        &session,
                    )?;
                    Ok(object)
                }
                .await;
                match result {
                    Err(e) if cache::is_retry(&e) && Instant::now() < deadline => {
                        tokio::time::sleep(Duration::from_millis(1)).await
                    }
                    Err(e) if cache::is_retry(&e) => return Err(status(ErrorCode::Unavailable)),
                    result => return result,
                }
            }
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
    /// @cc [owner:spolu,label:backend] ram-fsync
    /// Fsync MUST confirm current complete RAM visibility and report known errors without forcing
    /// or awaiting publication. Client write RPCs preceding the barrier must already be complete.
    async fn fsync(&self, r: Request<ObjectRequest>) -> Result<Response<Object>> {
        let _profile = Guard::new(Phase::Fsync);
        let session = self.0.sessions.get(&r).await?;
        let key = Keys::new(&session.info.tenant_id)?.object(&r.get_ref().object_id)?;
        self.0.cache.error(&session, &key)?;
        let response = self
            .read_call(
                r,
                |r| (&r.object_id, None),
                |v, r| async move { v.session_stat(&r.object_id).await },
            )
            .await?;
        self.0.cache.error(&session, &key)?;
        Ok(response)
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
