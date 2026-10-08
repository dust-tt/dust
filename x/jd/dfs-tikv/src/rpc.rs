use crate::engine::Engine;
use crate::model::*;
use crate::wire::{
    Frame,
    dfs_server::{Dfs, DfsServer},
};
use bincode::Options;
use futures::Stream;
use serde::{Serialize, de::DeserializeOwned};
use std::{collections::HashMap, pin::Pin, sync::Arc, time::Duration};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc, watch};
use tonic::{Request, Response, Status};

pub fn initialize_crypto() {
    static INITIALIZED: std::sync::Once = std::sync::Once::new();
    INITIALIZED.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

pub fn encode<T: Serialize>(value: &T) -> Result<Frame> {
    Ok(Frame {
        payload: bincode::DefaultOptions::new()
            .with_fixint_encoding()
            .with_limit(MAX_MESSAGE_BYTES as u64)
            .serialize(value)?,
    })
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

struct Admission {
    global: Arc<Semaphore>,
    tenants: HashMap<Id, Arc<Semaphore>>,
}

impl Admission {
    fn new(tenants: &[Id], global: usize, per_tenant: usize) -> Self {
        Self {
            global: Arc::new(Semaphore::new(global)),
            tenants: tenants
                .iter()
                .map(|id| (id.clone(), Arc::new(Semaphore::new(per_tenant))))
                .collect(),
        }
    }

    fn acquire(&self, tenant: &str) -> Result<(OwnedSemaphorePermit, OwnedSemaphorePermit)> {
        let semaphore = self
            .tenants
            .get(tenant)
            .ok_or_else(|| err(libc::EACCES, "tenant not configured"))?;
        let tenant = semaphore
            .clone()
            .try_acquire_owned()
            .map_err(|_| err(libc::EAGAIN, "tenant admission"))?;
        let global = self
            .global
            .clone()
            .try_acquire_owned()
            .map_err(|_| err(libc::EAGAIN, "global admission"))?;
        Ok((tenant, global))
    }
}

#[derive(Clone)]
pub struct Service {
    engine: Arc<Engine>,
    calls: Arc<Admission>,
    snapshots: Arc<Admission>,
    stopping: Arc<watch::Sender<bool>>,
    publication_pause: Option<(u64, std::path::PathBuf)>,
}

impl Service {
    pub fn new(engine: Arc<Engine>) -> Self {
        let tenants = engine.tenants();
        let (stopping, _) = watch::channel(false);
        Self {
            engine,
            calls: Arc::new(Admission::new(&tenants, 64, 8)),
            snapshots: Arc::new(Admission::new(&tenants, 8, 2)),
            stopping: Arc::new(stopping),
            publication_pause: None,
        }
    }

    pub fn with_publication_pause(mut self, head: u64, signal_file: std::path::PathBuf) -> Self {
        self.publication_pause = Some((head, signal_file));
        self
    }

    pub fn server(self) -> DfsServer<Self> {
        DfsServer::new(self)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES)
    }

    pub fn stop(&self) {
        self.stopping.send_replace(true);
    }

    async fn execute(&self, envelope: Envelope) -> Result<Reply> {
        let session = &envelope.session;
        match envelope.call {
            Call::Login { token } => self.engine.login(&token).await.map(Reply::Session),
            Call::Logout => self.engine.logout(session).await.map(|()| Reply::Unit),
            Call::CheckSession => self.engine.session(session).await.map(|_| Reply::Unit),
            Call::Head => {
                let (head, auth_generation) = self.engine.head(session).await?;
                Ok(Reply::Head {
                    head,
                    auth_generation,
                    incarnation: self.engine.incarnation.clone(),
                })
            }
            Call::Metrics => self.engine.metrics(session).await.map(Reply::Metrics),
            Call::Stat { node, handle } => self
                .engine
                .stat(session, &node, handle.as_deref())
                .await
                .map(Reply::Node),
            Call::Lookup { parent, name } => self
                .engine
                .lookup(session, &parent, &name)
                .await
                .map(|(node, entry)| Reply::Lookup(node, entry)),
            Call::Read {
                node,
                version,
                offset,
                size,
                handle,
            } => self
                .engine
                .read(
                    session,
                    &node,
                    version.as_deref(),
                    offset,
                    size,
                    handle.as_deref(),
                )
                .await
                .map(Reply::Data),
            Call::ReadBlocks { ranges } => self
                .engine
                .read_blocks(session, &ranges)
                .await
                .map(Reply::Blocks),
            Call::ReadPack { ranges } => self
                .engine
                .read_pack(session, &ranges)
                .await
                .map(Reply::Pack),
            Call::Open { node, write } => self
                .engine
                .open_handle(session, &node, write)
                .await
                .map(|(id, node)| Reply::Handle(id, node)),
            Call::Close { handle } => self
                .engine
                .close_handle(session, &handle)
                .await
                .map(|()| Reply::Unit),
            Call::Mutate { request, mutation } => {
                let outcome = self.engine.mutate(session, request, mutation).await?;
                if let Some((head, signal_file)) = &self.publication_pause
                    && outcome.head >= *head
                {
                    tokio::fs::write(signal_file, outcome.head.to_string())
                        .await
                        .map_err(|error| err(libc::EIO, error.to_string()))?;
                    std::future::pending::<()>().await;
                }
                Ok(Reply::Outcome(outcome))
            }
            Call::Changes { cursor } => {
                self.engine.changes(session, cursor).await.map(Reply::Delta)
            }
            Call::ResolvePublication { publication } => self
                .engine
                .resolve_publication(session, publication)
                .await
                .map(Reply::Publication),
            Call::PersistThrough { receipt, level } => self
                .engine
                .persist_through(session, receipt, level)
                .await
                .map(Reply::Persisted),
            Call::Barrier => self.engine.session(session).await.map(|_| Reply::Unit),
            Call::ValidateSearch { nodes } => self
                .engine
                .validate_search(session, &nodes)
                .await
                .map(Reply::SearchNodes),
            Call::BeginIndexSnapshot { .. }
            | Call::ListIndexNodes { .. }
            | Call::ReadIndexContent { .. }
            | Call::EndIndexSnapshot { .. }
            | Call::ListIndexGrants { .. }
            | Call::SearchGrants
            | Call::SearchContext { .. }
            | Call::RenewIndexSnapshot { .. }
            | Call::OpenWriteback { .. }
            | Call::RenewWriteback { .. } => {
                self.engine.session(session).await?;
                Err(err(libc::EOPNOTSUPP, "operation not implemented"))
            }
        }
    }
}

type FrameStream = Pin<Box<dyn Stream<Item = std::result::Result<Frame, Status>> + Send>>;

#[tonic::async_trait]
#[allow(clippy::result_large_err)]
impl Dfs for Service {
    async fn call(&self, request: Request<Frame>) -> std::result::Result<Response<Frame>, Status> {
        if *self.stopping.borrow() {
            return Err(Status::unavailable("frontend draining"));
        }
        let envelope: Envelope = decode(request.into_inner()).map_err(status)?;
        let tenant = match &envelope.call {
            Call::Login { token } => self.engine.tenant_for_token(token),
            _ => crate::engine::session_tenant(&envelope.session),
        };
        let result = async {
            let _permits = self.calls.acquire(tenant.as_ref().map_err(Clone::clone)?)?;
            tokio::time::timeout(Duration::from_secs(10), self.execute(envelope))
                .await
                .map_err(|_| {
                    err(
                        libc::ETIMEDOUT,
                        "request deadline; publication may be uncertain",
                    )
                })?
        }
        .await;
        let mut response = Response::new(encode(&result).map_err(status)?);
        if result.is_ok()
            && let Ok(tenant) = tenant
        {
            let bytes = self.engine.store.tenant_cache_bytes(&tenant).to_string();
            if let Ok(value) = bytes.parse() {
                response.metadata_mut().insert("x-dfs-cache-bytes", value);
            }
        }
        Ok(response)
    }

    type SnapshotStream = FrameStream;

    async fn snapshot(
        &self,
        request: Request<Frame>,
    ) -> std::result::Result<Response<FrameStream>, Status> {
        if *self.stopping.borrow() {
            return Err(Status::unavailable("frontend draining"));
        }
        let session: Id = decode(request.into_inner()).map_err(status)?;
        let tenant = crate::engine::session_tenant(&session).map_err(status)?;
        let permits = self.snapshots.acquire(&tenant).map_err(status)?;
        let engine = self.engine.clone();
        let mut stopping = self.stopping.subscribe();
        let (sender, receiver) = mpsc::channel(2);
        tokio::spawn(async move {
            let _permits = permits;
            let operation = async {
                let view = engine.view(&session).await?;
                let generation = view.auth_generation;
                let begin = SnapshotPart::Begin {
                    incarnation: view.incarnation,
                    head: view.head,
                    auth_generation: generation,
                };
                let mut nodes = view.nodes.into_iter();
                let chunks = std::iter::from_fn(move || {
                    let nodes: Vec<_> = nodes.by_ref().take(256).collect();
                    (!nodes.is_empty()).then_some(SnapshotPart::Nodes(nodes))
                });
                for part in std::iter::once(begin)
                    .chain(chunks)
                    .chain(std::iter::once(SnapshotPart::End))
                {
                    if engine.head(&session).await?.1 != generation {
                        return Err(err(libc::ESTALE, "snapshot authority changed"));
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
            };
            let result = tokio::select! {
                result = tokio::time::timeout(Duration::from_secs(120), operation) => result.unwrap_or_else(|_| Err(err(libc::ETIMEDOUT, "snapshot deadline"))),
                _ = stopping.changed() => Err(err(libc::EIO, "frontend draining")),
                _ = sender.closed() => return,
            };
            if let Err(error) = result {
                let _ = tokio::time::timeout(
                    Duration::from_secs(2),
                    sender.send(encode(&Result::<SnapshotPart>::Err(error)).map_err(status)),
                )
                .await;
            }
        });
        Ok(Response::new(Box::pin(
            tokio_stream::wrappers::ReceiverStream::new(receiver),
        )))
    }
}
