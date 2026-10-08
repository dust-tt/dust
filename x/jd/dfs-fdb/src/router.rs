use crate::{
    engine::{session_tenant, token_hash},
    model::*,
    objects::hash,
    rpc::{decode, encode},
    wire::{
        Frame,
        dfs_client::DfsClient,
        dfs_server::{Dfs, DfsServer},
    },
};
use futures::{Stream, StreamExt};
use parking_lot::Mutex;
use std::{
    collections::{BTreeSet, HashMap},
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Semaphore, mpsc, watch};
use tonic::{
    Request, Response, Status,
    transport::{Certificate, Channel, ClientTlsConfig, Endpoint},
};

struct Peer {
    endpoint: String,
    client: DfsClient<Channel>,
}

#[derive(Clone, Copy)]
struct Hint {
    bytes: u64,
    updated: Instant,
}

struct Health {
    available_after: Instant,
    active: usize,
}

struct State {
    health: Vec<Health>,
    hints: HashMap<Id, Vec<Hint>>,
    sessions: HashMap<Id, (Id, Instant)>,
}

struct Inner {
    id: Id,
    peers: Vec<Peer>,
    tokens: HashMap<String, Id>,
    state: Mutex<State>,
    calls: Arc<Semaphore>,
    streams: Arc<Semaphore>,
    stopping: watch::Sender<bool>,
}

#[derive(Clone)]
pub struct Router(Arc<Inner>);

struct Selection {
    inner: Arc<Inner>,
    index: usize,
}

impl Drop for Selection {
    fn drop(&mut self) {
        self.inner.state.lock().health[self.index].active -= 1;
    }
}

impl Router {
    pub fn new(
        endpoints: Vec<String>,
        credentials: &[Credential],
        ca: Option<Vec<u8>>,
        tls_name: Option<String>,
    ) -> anyhow::Result<Self> {
        anyhow::ensure!(
            !endpoints.is_empty() && endpoints.len() <= 16,
            "router needs 1 to 16 frontends"
        );
        anyhow::ensure!(
            !credentials.is_empty() && credentials.len() <= 4096,
            "router credential capacity"
        );
        anyhow::ensure!(
            endpoints.iter().collect::<BTreeSet<_>>().len() == endpoints.len(),
            "duplicate frontend"
        );
        let mut peers = Vec::new();
        for endpoint in endpoints {
            let mut transport = Endpoint::from_shared(endpoint.clone())?
                .connect_timeout(Duration::from_millis(300));
            let host = transport
                .uri()
                .host()
                .ok_or_else(|| anyhow::anyhow!("frontend host absent"))?;
            let loopback = host == "localhost"
                || host
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback());
            anyhow::ensure!(
                transport.uri().scheme_str() == Some("https") || loopback,
                "remote frontend requires TLS"
            );
            if let Some(ca) = &ca {
                let mut tls = ClientTlsConfig::new().ca_certificate(Certificate::from_pem(ca));
                if let Some(name) = &tls_name {
                    tls = tls.domain_name(name.clone());
                }
                transport = transport.tls_config(tls)?;
            }
            let client = DfsClient::new(transport.connect_lazy())
                .max_decoding_message_size(MAX_MESSAGE_BYTES)
                .max_encoding_message_size(MAX_MESSAGE_BYTES);
            peers.push(Peer { endpoint, client });
        }
        let now = Instant::now();
        let tokens: HashMap<_, _> = credentials
            .iter()
            .map(|credential| (credential.token_hash.clone(), credential.tenant.clone()))
            .collect();
        let hints = tokens
            .values()
            .map(|tenant| {
                (
                    tenant.clone(),
                    vec![
                        Hint {
                            bytes: 0,
                            updated: now
                        };
                        peers.len()
                    ],
                )
            })
            .collect();
        let health = peers
            .iter()
            .map(|_| Health {
                available_after: now,
                active: 0,
            })
            .collect();
        let (stopping, _) = watch::channel(false);
        Ok(Self(Arc::new(Inner {
            id: id(),
            peers,
            tokens,
            state: Mutex::new(State {
                health,
                hints,
                sessions: HashMap::new(),
            }),
            calls: Arc::new(Semaphore::new(128)),
            streams: Arc::new(Semaphore::new(64)),
            stopping,
        })))
    }

    pub fn server(self) -> DfsServer<Self> {
        DfsServer::new(self)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES)
    }

    pub fn stop(&self) {
        self.0.stopping.send_replace(true);
    }

    pub fn spawn_discovery(&self) -> tokio::task::JoinHandle<()> {
        let router = self.clone();
        tokio::spawn(async move {
            let mut stopping = router.0.stopping.subscribe();
            let mut interval = tokio::time::interval(Duration::from_secs(2));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            let mut offset = 0;
            loop {
                tokio::select! { _ = interval.tick() => {}, _ = stopping.changed() => break }
                let sessions = {
                    let mut state = router.0.state.lock();
                    state
                        .sessions
                        .retain(|_, (_, seen)| seen.elapsed() < Duration::from_secs(60));
                    if offset >= state.sessions.len() {
                        offset = 0;
                    }
                    let sessions: Vec<_> = state
                        .sessions
                        .iter()
                        .skip(offset)
                        .take(32)
                        .map(|(tenant, (session, _))| (tenant.clone(), session.clone()))
                        .collect();
                    offset += sessions.len();
                    sessions
                };
                let jobs: Vec<_> = sessions
                    .into_iter()
                    .flat_map(|(tenant, session)| {
                        (0..router.0.peers.len())
                            .map(move |index| (tenant.clone(), session.clone(), index))
                    })
                    .collect();
                let refresh = futures::stream::iter(jobs)
                    .map(|(tenant, session, index)| {
                        let router = router.clone();
                        async move {
                            let Ok(frame) = encode(&Envelope {
                                session,
                                call: Call::Head,
                            }) else {
                                return;
                            };
                            let result = tokio::time::timeout(
                                Duration::from_millis(750),
                                router.0.peers[index].client.clone().call(frame),
                            )
                            .await;
                            if let Ok(Ok(response)) = result {
                                router.observed(&tenant, index, response.metadata());
                            }
                        }
                    })
                    .buffer_unordered(8)
                    .collect::<Vec<_>>();
                tokio::select! {
                    _ = tokio::time::timeout(Duration::from_secs(3), refresh) => {},
                    _ = stopping.changed() => break,
                }
            }
        })
    }

    fn tenant(&self, envelope: &Envelope) -> Result<Id> {
        match &envelope.call {
            Call::Login { token } => self
                .0
                .tokens
                .get(&token_hash(token))
                .cloned()
                .ok_or_else(|| err(libc::EACCES, "credential rejected")),
            _ => session_tenant(&envelope.session),
        }
    }

    fn select(&self, tenant: &str, attempted: &BTreeSet<usize>) -> Result<Selection> {
        let now = Instant::now();
        let mut state = self.0.state.lock();
        let hints = state
            .hints
            .get(tenant)
            .ok_or_else(|| err(libc::EACCES, "tenant not configured"))?;
        let best = self
            .0
            .peers
            .iter()
            .enumerate()
            .filter(|(index, _)| {
                !attempted.contains(index) && state.health[*index].available_after <= now
            })
            .max_by_key(|(index, peer)| {
                let health = &state.health[*index];
                let hint = hints[*index];
                let bytes = if now.duration_since(hint.updated) < Duration::from_secs(30) {
                    hint.bytes
                } else {
                    0
                };
                let rendezvous = hash(format!("{tenant}\0{}", peer.endpoint).as_bytes());
                (
                    health.active < 8,
                    bytes / (health.active as u64 + 1),
                    std::cmp::Reverse(health.active),
                    rendezvous,
                )
            })
            .map(|(index, _)| index);
        let index = best.ok_or_else(|| err(libc::EAGAIN, "no available frontend"))?;
        state.health[index].active += 1;
        Ok(Selection {
            inner: self.0.clone(),
            index,
        })
    }

    fn failed(&self, index: usize) {
        let mut state = self.0.state.lock();
        state.health[index].available_after = Instant::now() + Duration::from_secs(1);
        for hints in state.hints.values_mut() {
            hints[index].bytes = 0;
        }
    }

    fn observed(&self, tenant: &str, index: usize, metadata: &tonic::metadata::MetadataMap) {
        let bytes = metadata
            .get("x-dfs-cache-bytes")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        if let Some(bytes) = bytes {
            let mut state = self.0.state.lock();
            if let Some(hints) = state.hints.get_mut(tenant) {
                hints[index] = Hint {
                    bytes,
                    updated: Instant::now(),
                };
            }
        }
    }

    async fn forward(
        &self,
        frame: Frame,
        tenant: &str,
        session: &str,
    ) -> std::result::Result<Response<Frame>, Status> {
        let mut attempted = BTreeSet::new();
        let mut failure = Status::unavailable("no available frontend");
        while attempted.len() < self.0.peers.len() {
            let selection = match self.select(tenant, &attempted) {
                Ok(selection) => selection,
                Err(error) if error.code == libc::EACCES => {
                    return Err(Status::permission_denied(error.to_string()));
                }
                Err(_) => break,
            };
            let index = selection.index;
            attempted.insert(index);
            let mut request = Request::new(frame.clone());
            request.set_timeout(Duration::from_secs(2));
            let result = self.0.peers[index].client.clone().call(request).await;
            match result {
                Ok(mut response) => {
                    let decoded = decode::<Result<Reply>>(response.get_ref().clone());
                    if matches!(
                        decoded,
                        Ok(Err(Error {
                            code: libc::EAGAIN,
                            ..
                        }))
                    ) {
                        failure = Status::resource_exhausted(
                            "frontend admission or publication contention",
                        );
                        continue;
                    }
                    let observed_session = match &decoded {
                        Ok(Ok(Reply::Session(session))) => Some(session.id.clone()),
                        Ok(Ok(_)) if !session.is_empty() => Some(session.to_owned()),
                        _ => None,
                    };
                    if let Some(session) = observed_session {
                        self.0
                            .state
                            .lock()
                            .sessions
                            .insert(tenant.to_owned(), (session, Instant::now()));
                    }
                    self.observed(tenant, index, response.metadata());
                    response.metadata_mut().insert(
                        "x-dfs-route",
                        index.to_string().parse().expect("numeric route"),
                    );
                    return Ok(response);
                }
                Err(error)
                    if matches!(
                        error.code(),
                        tonic::Code::Unavailable
                            | tonic::Code::DeadlineExceeded
                            | tonic::Code::Cancelled
                            | tonic::Code::Unknown
                    ) =>
                {
                    self.failed(index);
                    failure = error;
                }
                Err(error) => return Err(error),
            }
        }
        Err(failure)
    }

    async fn open_stream(
        &self,
        frame: Frame,
        tenant: &str,
    ) -> std::result::Result<(Selection, tonic::Streaming<Frame>), Status> {
        let mut attempted = BTreeSet::new();
        let mut failure = Status::unavailable("no available frontend");
        while attempted.len() < self.0.peers.len() {
            let selection = self
                .select(tenant, &attempted)
                .map_err(|error| Status::unavailable(error.to_string()))?;
            let index = selection.index;
            attempted.insert(index);
            let mut client = self.0.peers[index].client.clone();
            let result =
                tokio::time::timeout(Duration::from_secs(2), client.snapshot(frame.clone()))
                    .await
                    .unwrap_or_else(|_| Err(Status::deadline_exceeded("stream setup deadline")));
            match result {
                Ok(response) => return Ok((selection, response.into_inner())),
                Err(error)
                    if matches!(
                        error.code(),
                        tonic::Code::Unavailable
                            | tonic::Code::DeadlineExceeded
                            | tonic::Code::Cancelled
                    ) =>
                {
                    self.failed(index);
                    failure = error;
                }
                Err(error) => return Err(error),
            }
        }
        Err(failure)
    }

    async fn stream(&self, frame: Frame) -> std::result::Result<Response<FrameStream>, Status> {
        let session: Id =
            decode(frame.clone()).map_err(|error| Status::invalid_argument(error.to_string()))?;
        let tenant = session_tenant(&session)
            .map_err(|error| Status::permission_denied(error.to_string()))?;
        let permit = self
            .0
            .streams
            .clone()
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("stream admission"))?;
        let (selection, mut upstream) = self.open_stream(frame, &tenant).await?;
        let mut stopping = self.0.stopping.subscribe();
        let router = self.clone();
        let (sender, receiver) = mpsc::channel(2);
        tokio::spawn(async move {
            let _permit = permit;
            let _selection = selection;
            loop {
                let item = tokio::select! {
                    item = upstream.message() => item,
                    _ = stopping.changed() => break,
                    _ = sender.closed() => break,
                };
                let item = match item {
                    Ok(Some(frame)) => Ok(frame),
                    Ok(None) => break,
                    Err(error) => {
                        router.failed(_selection.index);
                        Err(error)
                    }
                };
                let terminal = item.is_err();
                if !matches!(
                    tokio::time::timeout(Duration::from_secs(5), sender.send(item)).await,
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

type FrameStream = Pin<Box<dyn Stream<Item = std::result::Result<Frame, Status>> + Send>>;

#[tonic::async_trait]
#[allow(clippy::result_large_err)]
impl Dfs for Router {
    async fn call(&self, request: Request<Frame>) -> std::result::Result<Response<Frame>, Status> {
        if *self.0.stopping.borrow() {
            return Err(Status::unavailable("router draining"));
        }
        let _permit = self
            .0
            .calls
            .clone()
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("router admission"))?;
        let frame = request.into_inner();
        let envelope: Envelope =
            decode(frame.clone()).map_err(|error| Status::invalid_argument(error.to_string()))?;
        let tenant = match self.tenant(&envelope) {
            Ok(tenant) => tenant,
            Err(error) => {
                return Ok(Response::new(
                    encode(&Result::<Reply>::Err(error))
                        .map_err(|error| Status::internal(error.to_string()))?,
                ));
            }
        };
        let mut response = tokio::time::timeout(
            Duration::from_secs(5),
            self.forward(frame, &tenant, &envelope.session),
        )
        .await
        .unwrap_or_else(|_| Err(Status::deadline_exceeded("router request deadline")))?;
        response.metadata_mut().insert(
            "x-dfs-router",
            self.0
                .id
                .parse()
                .map_err(|_| Status::internal("router identity"))?,
        );
        Ok(response)
    }

    type SnapshotStream = FrameStream;
    async fn snapshot(
        &self,
        request: Request<Frame>,
    ) -> std::result::Result<Response<FrameStream>, Status> {
        if *self.0.stopping.borrow() {
            return Err(Status::unavailable("router draining"));
        }
        self.stream(request.into_inner()).await
    }
}
