use crate::engine::Engine;
use crate::model::*;
use crate::wire::{
    Frame,
    dfs_server::{Dfs, DfsServer},
};
use bincode::Options;
use futures::Stream;
use parking_lot::Mutex;
use serde::{Serialize, de::DeserializeOwned};
use std::{
    collections::HashMap,
    pin::Pin,
    sync::{Arc, Weak},
    time::Duration,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc};
use tonic::{Request, Response, Status};

pub fn initialize_crypto() {
    static INITIALIZED: std::sync::Once = std::sync::Once::new();
    INITIALIZED.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

pub fn encode<T: Serialize>(value: &T) -> Result<Frame> {
    let payload = bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_limit(MAX_MESSAGE_BYTES as u64)
        .serialize(value)?;
    Ok(Frame { payload })
}
pub fn decode<T: DeserializeOwned>(frame: Frame) -> Result<T> {
    if frame.payload.len() > MAX_MESSAGE_BYTES {
        return Err(err(libc::E2BIG, "message size"));
    }
    Ok(bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_limit(MAX_MESSAGE_BYTES as u64)
        .reject_trailing_bytes()
        .deserialize(&frame.payload)?)
}
fn status(error: Error) -> Status {
    Status::internal(error.to_string())
}
type FrameStream = Pin<Box<dyn Stream<Item = std::result::Result<Frame, Status>> + Send>>;

#[derive(Clone, Copy)]
pub struct StreamLimits {
    pub snapshots: usize,
    pub tenant_snapshots: usize,
    pub watches: usize,
    pub tenant_watches: usize,
}

impl Default for StreamLimits {
    fn default() -> Self {
        Self {
            snapshots: 8,
            tenant_snapshots: 2,
            watches: 64,
            tenant_watches: 8,
        }
    }
}

#[derive(Clone)]
struct StreamAdmission {
    global: Arc<Semaphore>,
    tenants: Arc<Mutex<HashMap<Id, Weak<Semaphore>>>>,
    tenant_limit: usize,
}

impl StreamAdmission {
    fn new(global: usize, tenant_limit: usize) -> Self {
        Self {
            global: Arc::new(Semaphore::new(global)),
            tenants: Arc::default(),
            tenant_limit,
        }
    }

    fn acquire(
        &self,
        tenant: &str,
    ) -> std::result::Result<(OwnedSemaphorePermit, OwnedSemaphorePermit), &'static str> {
        let mut tenants = self.tenants.lock();
        tenants.retain(|_, semaphore| semaphore.strong_count() > 0);
        let admission = tenants
            .get(tenant)
            .and_then(Weak::upgrade)
            .unwrap_or_else(|| {
                let admission = Arc::new(Semaphore::new(self.tenant_limit));
                tenants.insert(tenant.to_owned(), Arc::downgrade(&admission));
                admission
            });
        let tenant_permit = admission
            .try_acquire_owned()
            .map_err(|_| "tenant stream admission")?;
        let global_permit = self
            .global
            .clone()
            .try_acquire_owned()
            .map_err(|_| "global stream admission")?;
        Ok((tenant_permit, global_permit))
    }
}

#[derive(Clone)]
pub struct Service {
    engine: Arc<Engine>,
    global: Arc<Semaphore>,
    tenants: Arc<Mutex<HashMap<Id, Arc<Semaphore>>>>,
    snapshots: StreamAdmission,
    watches: StreamAdmission,
    pub tenant_concurrency: usize,
}
impl Service {
    pub fn new(engine: Arc<Engine>) -> Self {
        let limits = StreamLimits::default();
        Self {
            engine,
            global: Arc::new(Semaphore::new(64)),
            tenants: Arc::new(Mutex::new(HashMap::new())),
            snapshots: StreamAdmission::new(limits.snapshots, limits.tenant_snapshots),
            watches: StreamAdmission::new(limits.watches, limits.tenant_watches),
            tenant_concurrency: 8,
        }
    }
    pub fn with_stream_limits(mut self, limits: StreamLimits) -> Result<Self> {
        if [
            limits.snapshots,
            limits.tenant_snapshots,
            limits.watches,
            limits.tenant_watches,
        ]
        .into_iter()
        .any(|limit| limit == 0 || limit > Semaphore::MAX_PERMITS)
        {
            return Err(err(
                libc::EINVAL,
                "stream limits must be positive and fit semaphore capacity",
            ));
        }
        self.snapshots = StreamAdmission::new(limits.snapshots, limits.tenant_snapshots);
        self.watches = StreamAdmission::new(limits.watches, limits.tenant_watches);
        Ok(self)
    }
    pub fn server(self) -> DfsServer<Self> {
        DfsServer::new(self)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES)
    }
    fn execute(engine: &Engine, envelope: Envelope) -> Result<Reply> {
        let session = envelope.session;
        match envelope.call {
            Call::RenewIndexSnapshot { lease } => engine
                .renew_index_snapshot(&session, &lease)
                .map(Reply::IndexLeaseExpiry),
            Call::SearchContext { indexed } => engine
                .search_context(&session, &indexed)
                .map(Reply::SearchContext),
            Call::ListIndexGrants { lease, offset } => engine
                .list_index_grants(&session, &lease, offset)
                .map(Reply::IndexGrants),
            Call::SearchGrants => engine.search_grants(&session).map(Reply::SearchGrants),
            Call::ValidateSearch { nodes } => engine
                .validate_search(&session, &nodes)
                .map(Reply::SearchNodes),
            Call::BeginIndexSnapshot { after } => engine
                .begin_index_snapshot(&session, after)
                .map(Reply::IndexSnapshot),
            Call::ListIndexNodes { lease, offset } => engine
                .list_index_nodes(&session, &lease, offset)
                .map(Reply::IndexNodes),
            Call::ReadIndexContent {
                lease,
                node,
                offset,
                size,
            } => engine
                .read_index_content(&session, &lease, &node, offset, size)
                .map(Reply::Data),
            Call::EndIndexSnapshot { lease } => engine
                .end_index_snapshot(&session, &lease)
                .map(|()| Reply::Unit),
            Call::Changes { cursor } => engine.changes(&session, cursor).map(Reply::Delta),
            Call::Login { token } => engine.login(&token).map(Reply::Session),
            Call::Logout => {
                engine.logout(&session);
                Ok(Reply::Unit)
            }
            Call::Head => {
                let (head, auth_generation) = engine.head(&session)?;
                Ok(Reply::Head {
                    head,
                    auth_generation,
                    incarnation: engine.incarnation.clone(),
                })
            }
            Call::Metrics => engine.metrics(&session).map(Reply::Metrics),
            Call::Stat { node, handle } => engine
                .stat(&session, &node, handle.as_deref())
                .map(Reply::Node),
            Call::Lookup { parent, name } => engine
                .lookup(&session, &parent, &name)
                .map(|(node, entry)| Reply::Lookup(node, entry)),
            Call::Read {
                node,
                version,
                offset,
                size,
                handle,
            } => engine
                .read(
                    &session,
                    &node,
                    version.as_deref(),
                    offset,
                    size,
                    handle.as_deref(),
                )
                .map(Reply::Data),
            Call::ReadPack { ranges } => {
                if ranges.len() > 256
                    || ranges
                        .iter()
                        .map(|range| u64::from(range.size))
                        .sum::<u64>()
                        > MAX_IO_BYTES as u64
                {
                    return Err(err(libc::E2BIG, "pack size"));
                }
                ranges
                    .into_iter()
                    .map(|range| {
                        engine.read(
                            &session,
                            &range.node,
                            Some(&range.version),
                            range.offset,
                            range.size,
                            None,
                        )
                    })
                    .collect::<Result<Vec<_>>>()
                    .map(Reply::Pack)
            }
            Call::Open { node, write } => engine
                .open_handle(&session, &node, write)
                .map(|(handle, node)| Reply::Handle(handle, node)),
            Call::OpenWriteback { node, request } => engine
                .open_writeback(&session, &node, &request)
                .map(Reply::WritebackHandle),
            Call::RenewWriteback { handle } => engine
                .renew_writeback(&session, &handle)
                .map(Reply::WriterLease),
            Call::Close { handle } => engine.close_handle(&session, &handle).map(|()| Reply::Unit),
            Call::Mutate { request, mutation } => engine
                .mutate(&session, request, mutation)
                .map(Reply::Outcome),
            Call::Barrier | Call::CheckSession => {
                engine.session(&session)?;
                Ok(Reply::Unit)
            }
            Call::ResolvePublication { publication } => engine
                .resolve_publication(&session, publication)
                .map(Reply::Publication),
            Call::PersistThrough { receipt, level } => engine
                .persist_through(&session, receipt, level)
                .map(Reply::Persisted),
        }
    }
}
#[tonic::async_trait]
impl Dfs for Service {
    async fn call(&self, request: Request<Frame>) -> std::result::Result<Response<Frame>, Status> {
        let envelope: Envelope = decode(request.into_inner()).map_err(status)?;
        let started = std::time::Instant::now();
        let tenant = if matches!(envelope.call, Call::Login { .. }) {
            "login".to_owned()
        } else {
            match self.engine.session(&envelope.session) {
                Ok(session) => session.tenant,
                Err(error) => {
                    return Ok(Response::new(
                        encode(&Result::<Reply>::Err(error)).map_err(status)?,
                    ));
                }
            }
        };
        let admission = self
            .tenants
            .lock()
            .entry(tenant)
            .or_insert_with(|| Arc::new(Semaphore::new(self.tenant_concurrency)))
            .clone();
        let tenant_permit = admission
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("tenant admission"))?;
        let global_permit = self
            .global
            .clone()
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("global admission"))?;
        let engine = self.engine.clone();
        let result = tokio::task::spawn_blocking(move || {
            let _permits = (tenant_permit, global_permit);
            Self::execute(&engine, envelope)
        })
        .await
        .map_err(|_| Status::internal("worker failed"))?;
        tracing::debug!(
            rpc_us = started.elapsed().as_micros() as u64,
            success = result.is_ok(),
            "rpc"
        );
        Ok(Response::new(encode(&result).map_err(status)?))
    }
    type SnapshotStream = FrameStream;
    async fn snapshot(
        &self,
        request: Request<Frame>,
    ) -> std::result::Result<Response<Self::SnapshotStream>, Status> {
        let session: Id = decode(request.into_inner()).map_err(status)?;
        let authority = self.engine.session(&session).map_err(status)?;
        let permits = self
            .snapshots
            .acquire(&authority.tenant)
            .map_err(Status::resource_exhausted)?;
        let engine = self.engine.clone();
        let (sender, receiver) = mpsc::channel(2);
        tokio::spawn(async move {
            let engine_copy = engine.clone();
            let session_copy = session.clone();
            let view =
                tokio::task::spawn_blocking(move || (permits, engine_copy.view(&session_copy)))
                    .await;
            let result = async {
                let (_permits, view) =
                    view.map_err(|_| err(libc::EIO, "snapshot worker failed"))?;
                let view = view?;
                let generation = view.auth_generation;
                let begin = SnapshotPart::Begin {
                    incarnation: view.incarnation,
                    head: view.head,
                    auth_generation: generation,
                };
                let mut nodes = view.nodes.into_iter();
                let chunks = std::iter::from_fn(move || {
                    let chunk: Vec<_> = nodes.by_ref().take(256).collect();
                    (!chunk.is_empty()).then_some(SnapshotPart::Nodes(chunk))
                });
                let parts = std::iter::once(begin)
                    .chain(chunks)
                    .chain(std::iter::once(SnapshotPart::End));
                for part in parts {
                    let engine_copy = engine.clone();
                    let session_copy = session.clone();
                    let (_, current) =
                        tokio::task::spawn_blocking(move || engine_copy.head(&session_copy))
                            .await
                            .map_err(|_| err(libc::EIO, "snapshot policy worker failed"))??;
                    if current != generation {
                        return Err(err(libc::ESTALE, "policy changed during snapshot"));
                    }
                    tokio::time::timeout(
                        Duration::from_secs(5),
                        sender.send(Ok(encode(&Result::<SnapshotPart>::Ok(part))?)),
                    )
                    .await
                    .map_err(|_| err(libc::ETIMEDOUT, "slow snapshot consumer"))?
                    .map_err(|_| err(libc::EIO, "snapshot consumer closed"))?;
                }
                Ok(())
            }
            .await;
            if let Err(error) = result {
                let _ = tokio::time::timeout(
                    Duration::from_secs(5),
                    sender.send(encode(&Result::<SnapshotPart>::Err(error)).map_err(status)),
                )
                .await;
            }
        });
        Ok(Response::new(Box::pin(
            tokio_stream::wrappers::ReceiverStream::new(receiver),
        )))
    }
    type WatchStream = FrameStream;
    async fn watch(
        &self,
        request: Request<Frame>,
    ) -> std::result::Result<Response<Self::WatchStream>, Status> {
        let session_id: Id = decode(request.into_inner()).map_err(status)?;
        let session = self.engine.session(&session_id).map_err(status)?;
        let permits = self
            .watches
            .acquire(&session.tenant)
            .map_err(Status::resource_exhausted)?;
        let mut notifications = self.engine.notifications.subscribe();
        let engine = self.engine.clone();
        let (sender, receiver) = mpsc::channel(2);
        tokio::spawn(async move {
            let _permits = permits;
            let mut interval = tokio::time::interval(Duration::from_secs(1));
            loop {
                tokio::select! {
                    message = notifications.recv() => {
                        if let Ok(tenant) = message && tenant != session.tenant { continue; }
                    }
                    _ = interval.tick() => {}
                    _ = sender.closed() => break,
                }
                let engine_copy = engine.clone();
                let session_copy = session_id.clone();
                let result = tokio::task::spawn_blocking(move || {
                    Self::execute(
                        &engine_copy,
                        Envelope {
                            session: session_copy,
                            call: Call::Head,
                        },
                    )
                })
                .await;
                let result = match result {
                    Ok(result) => result,
                    Err(_) => Err(err(libc::EIO, "watch worker failed")),
                };
                let terminal = result.is_err();
                let frame = encode(&result).map_err(status);
                if !matches!(
                    tokio::time::timeout(Duration::from_secs(2), sender.send(frame)).await,
                    Ok(Ok(()))
                ) || terminal
                {
                    break;
                }
            }
        });
        Ok(Response::new(Box::pin(
            tokio_stream::wrappers::ReceiverStream::new(receiver),
        )))
    }
}
