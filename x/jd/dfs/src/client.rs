use crate::{
    model::*,
    rpc::{decode, encode},
    wire::dfs_client::DfsClient,
};
use sha2::{Digest, Sha256};
use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tonic::transport::{Certificate, Channel, ClientTlsConfig, Endpoint};

const CALL_KINDS: [&str; 9] = [
    "create",
    "write",
    "truncate",
    "setattr",
    "unlink",
    "put_files",
    "changes",
    "data",
    "other",
];

#[derive(Default)]
struct CallTiming {
    count: AtomicU64,
    elapsed_us: AtomicU64,
    max_us: AtomicU64,
}

struct TimedCall<'a> {
    timing: &'a CallTiming,
    started: std::time::Instant,
}

impl Drop for TimedCall<'_> {
    fn drop(&mut self) {
        let elapsed = self.started.elapsed().as_micros().min(u64::MAX as u128) as u64;
        self.timing.count.fetch_add(1, Ordering::Relaxed);
        self.timing.elapsed_us.fetch_add(elapsed, Ordering::Relaxed);
        self.timing.max_us.fetch_max(elapsed, Ordering::Relaxed);
    }
}

#[derive(Default)]
pub struct Counters {
    timings: [CallTiming; 9],
    pub calls: AtomicU64,
    pub sent_bytes: AtomicU64,
    pub received_bytes: AtomicU64,
    pub data_calls: AtomicU64,
    pub metadata_calls: AtomicU64,
    pub mutation_calls: AtomicU64,
    pub head_calls: AtomicU64,
    pub snapshot_calls: AtomicU64,
    pub block_batches: AtomicU64,
    pub block_ranges: AtomicU64,
    pub block_chunk_bytes: AtomicU64,
}
#[derive(Clone)]
pub struct Client {
    pub rpc: DfsClient<Channel>,
    pub session: Session,
    pub counters: Arc<Counters>,
}
impl Client {
    pub async fn connect(endpoint: &str, token: &str, ca: Option<Vec<u8>>) -> anyhow::Result<Self> {
        crate::rpc::initialize_crypto();
        let mut endpoint = Endpoint::from_shared(endpoint.to_owned())?
            .initial_stream_window_size(Some(2 << 20))
            .initial_connection_window_size(Some(8 << 20))
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(5));
        if let Some(ca) = ca {
            endpoint = endpoint
                .tls_config(ClientTlsConfig::new().ca_certificate(Certificate::from_pem(ca)))?;
        }
        let mut rpc = DfsClient::new(
            tokio::time::timeout(Duration::from_secs(3), endpoint.connect()).await??,
        )
        .max_decoding_message_size(MAX_MESSAGE_BYTES)
        .max_encoding_message_size(MAX_MESSAGE_BYTES);
        let reply: Result<Reply> = decode(
            tokio::time::timeout(
                Duration::from_secs(5),
                rpc.call(encode(&Envelope {
                    session: String::new(),
                    call: Call::Login {
                        token: token.to_owned(),
                    },
                })?),
            )
            .await??
            .into_inner(),
        )?;
        let Reply::Session(session) = reply? else {
            anyhow::bail!("invalid login reply")
        };
        Ok(Self {
            rpc,
            session,
            counters: Arc::new(Counters::default()),
        })
    }
    pub async fn call(&self, call: Call) -> Result<Reply> {
        let kind = match &call {
            Call::Mutate { mutation, .. } => match mutation {
                Mutation::Create { .. } => 0,
                Mutation::Write { .. } => 1,
                Mutation::Truncate { .. } => 2,
                Mutation::SetAttr { .. } => 3,
                Mutation::Unlink { .. } => 4,
                Mutation::PutFiles { .. } => 5,
                _ => 8,
            },
            Call::Changes { .. } | Call::Head => 6,
            Call::Read { .. } | Call::ReadBlocks { .. } | Call::ReadPack { .. } => 7,
            _ => 8,
        };
        let _timing = TimedCall {
            timing: &self.counters.timings[kind],
            started: std::time::Instant::now(),
        };
        let mutation = matches!(&call, Call::Mutate { .. });
        let mut uncertain = false;
        let category = match &call {
            Call::Read { .. } | Call::ReadPack { .. } | Call::ReadBlocks { .. } => {
                &self.counters.data_calls
            }
            Call::Mutate { .. } => &self.counters.mutation_calls,
            Call::Head | Call::Changes { .. } => &self.counters.head_calls,
            _ => &self.counters.metadata_calls,
        };
        let block_ranges = match &call {
            Call::ReadBlocks { ranges } => ranges.len(),
            _ => 0,
        };
        let frame = encode(&Envelope {
            session: self.session.id.clone(),
            call,
        })?;
        for attempt in 0..3 {
            self.counters.calls.fetch_add(1, Ordering::Relaxed);
            if block_ranges > 0 {
                self.counters.block_batches.fetch_add(1, Ordering::Relaxed);
                self.counters
                    .block_ranges
                    .fetch_add(block_ranges as u64, Ordering::Relaxed);
            }
            category.fetch_add(1, Ordering::Relaxed);
            self.counters
                .sent_bytes
                .fetch_add(frame.payload.len() as u64, Ordering::Relaxed);
            let result = match tokio::time::timeout(
                Duration::from_secs(5),
                self.rpc.clone().call(frame.clone()),
            )
            .await
            {
                Ok(result) => result,
                Err(_) => Err(tonic::Status::deadline_exceeded("complete RPC deadline")),
            };
            match result {
                Ok(response) => {
                    let frame = response.into_inner();
                    self.counters
                        .received_bytes
                        .fetch_add(frame.payload.len() as u64, Ordering::Relaxed);
                    let reply: Result<Reply> = match decode(frame) {
                        Ok(reply) => reply,
                        Err(error) if mutation => {
                            return Err(err(
                                libc::ETIMEDOUT,
                                format!("publication reply unavailable: {error}"),
                            ));
                        }
                        Err(error) => return Err(error),
                    };
                    if mutation && uncertain && reply.is_err() {
                        return Err(err(
                            libc::ETIMEDOUT,
                            "publication outcome unknown after reconnect",
                        ));
                    }
                    if let Ok(Reply::Blocks(pages)) = &reply {
                        let bytes: usize = pages
                            .iter()
                            .filter_map(|p| p.as_ref().ok())
                            .flat_map(|p| &p.chunks)
                            .map(|(_, bytes)| bytes.len())
                            .sum();
                        self.counters
                            .block_chunk_bytes
                            .fetch_add(bytes as u64, Ordering::Relaxed);
                    }
                    return reply;
                }
                Err(error)
                    if matches!(
                        error.code(),
                        tonic::Code::Unavailable
                            | tonic::Code::DeadlineExceeded
                            | tonic::Code::ResourceExhausted
                            | tonic::Code::Cancelled
                    ) =>
                {
                    uncertain |= error.code() != tonic::Code::ResourceExhausted;
                    if attempt == 2 {
                        if mutation && !uncertain && error.code() == tonic::Code::ResourceExhausted
                        {
                            return Err(err(libc::EAGAIN, "publication admission exhausted"));
                        }
                        return Err(err(libc::ETIMEDOUT, "bounded reconnect exhausted"));
                    }
                    tokio::time::sleep(Duration::from_millis(20 * (attempt + 1))).await;
                }
                Err(error) => {
                    return Err(err(
                        if mutation { libc::ETIMEDOUT } else { libc::EIO },
                        error.to_string(),
                    ));
                }
            }
        }
        Err(err(libc::EIO, "unreachable retry state"))
    }
    pub async fn mutate(&self, mutation: Mutation) -> Result<Outcome> {
        match self
            .call(Call::Mutate {
                request: self.session.request_id(),
                mutation,
            })
            .await?
        {
            Reply::Outcome(outcome) => Ok(outcome),
            _ => Err(err(libc::EIO, "invalid mutation reply")),
        }
    }
    pub fn prepare_publication(&self, mutation: &Mutation) -> Result<PublicationId> {
        let request = self.session.request_id();
        let digest = Sha256::digest(bincode::serialize(&(&request, mutation))?).into();
        Ok(PublicationId {
            tenant: self.session.tenant.clone(),
            request,
            digest,
        })
    }
    pub async fn publish(
        &self,
        publication: PublicationId,
        mutation: Mutation,
    ) -> Result<Publication> {
        let digest: [u8; 32] =
            Sha256::digest(bincode::serialize(&(&publication.request, &mutation))?).into();
        if publication.tenant != self.session.tenant || publication.digest != digest {
            return Err(err(libc::EINVAL, "publication payload mismatch"));
        }
        let Reply::Outcome(outcome) = self
            .call(Call::Mutate {
                request: publication.request.clone(),
                mutation,
            })
            .await?
        else {
            return Err(err(libc::EIO, "invalid publication reply"));
        };
        Ok(Publication {
            receipt: PublicationReceipt {
                publication,
                tenant_head: outcome.head,
            },
            outcome,
        })
    }
    pub async fn resolve_publication(
        &self,
        publication: PublicationId,
    ) -> Result<Option<Publication>> {
        match self.call(Call::ResolvePublication { publication }).await? {
            Reply::Publication(publication) => Ok(publication),
            _ => Err(err(libc::EIO, "invalid publication resolution")),
        }
    }
    pub async fn persist_through(
        &self,
        receipt: PublicationReceipt,
    ) -> Result<PersistenceConfirmation> {
        match self
            .call(Call::PersistThrough {
                receipt,
                level: DurabilityLevel::Local,
            })
            .await?
        {
            Reply::Persisted(confirmation) if confirmation.level == DurabilityLevel::Local => {
                Ok(confirmation)
            }
            _ => Err(err(libc::EIO, "invalid persistence confirmation")),
        }
    }
    pub async fn view(&self) -> Result<View> {
        self.view_with_limit(100_000).await
    }
    pub async fn view_with_limit(&self, max_nodes: usize) -> Result<View> {
        self.view_with_limits(max_nodes, 128 << 20).await
    }
    pub async fn view_with_limits(&self, max_nodes: usize, max_bytes: usize) -> Result<View> {
        if max_nodes == 0 || max_bytes == 0 {
            return Err(err(libc::EOVERFLOW, "client metadata capacity"));
        }
        self.counters.snapshot_calls.fetch_add(1, Ordering::Relaxed);
        self.counters.calls.fetch_add(1, Ordering::Relaxed);
        let mut stream = tokio::time::timeout(
            Duration::from_secs(5),
            self.rpc.clone().snapshot(encode(&self.session.id)?),
        )
        .await
        .map_err(|_| err(libc::ETIMEDOUT, "snapshot deadline"))?
        .map_err(|e| err(libc::EIO, e.to_string()))?
        .into_inner();
        let mut view = None;
        let mut bytes = 0usize;
        while let Some(frame) = tokio::time::timeout(Duration::from_secs(5), stream.message())
            .await
            .map_err(|_| err(libc::ETIMEDOUT, "snapshot part deadline"))?
            .map_err(|e| err(libc::EIO, e.to_string()))?
        {
            self.counters
                .received_bytes
                .fetch_add(frame.payload.len() as u64, Ordering::Relaxed);
            let part: Result<SnapshotPart> = decode(frame)?;
            match part? {
                SnapshotPart::Begin {
                    incarnation,
                    head,
                    auth_generation,
                } => {
                    if view.is_some() {
                        return Err(err(libc::EIO, "duplicate snapshot begin"));
                    }
                    view = Some(View {
                        incarnation,
                        head,
                        auth_generation,
                        nodes: Vec::new(),
                    });
                }
                SnapshotPart::Nodes(nodes) => {
                    let view = view
                        .as_mut()
                        .ok_or_else(|| err(libc::EIO, "snapshot missing begin"))?;
                    if view.nodes.len() + nodes.len() > max_nodes {
                        return Err(err(libc::EOVERFLOW, "client metadata capacity"));
                    }
                    for item in &nodes {
                        bytes = bytes
                            .checked_add(item.namespace_bytes())
                            .filter(|bytes| *bytes <= max_bytes)
                            .ok_or_else(|| err(libc::EOVERFLOW, "client metadata byte capacity"))?;
                    }
                    view.nodes.extend(nodes);
                }
                SnapshotPart::End => {
                    return view.ok_or_else(|| err(libc::EIO, "snapshot missing begin"));
                }
            }
        }
        Err(err(libc::EIO, "incomplete snapshot"))
    }
}

impl Counters {
    pub fn snapshot(&self) -> serde_json::Value {
        let timings = CALL_KINDS.iter().zip(&self.timings).map(|(name, timing)| {
            (*name, serde_json::json!({"calls": timing.count.load(Ordering::Relaxed), "elapsed_us": timing.elapsed_us.load(Ordering::Relaxed), "max_us": timing.max_us.load(Ordering::Relaxed)}))
        }).collect::<std::collections::BTreeMap<_, _>>();
        serde_json::json!({ "timings": timings, "block_batches": self.block_batches.load(Ordering::Relaxed), "block_ranges": self.block_ranges.load(Ordering::Relaxed), "block_chunk_bytes": self.block_chunk_bytes.load(Ordering::Relaxed), "rpc_calls": self.calls.load(Ordering::Relaxed), "sent_bytes": self.sent_bytes.load(Ordering::Relaxed),
            "received_bytes": self.received_bytes.load(Ordering::Relaxed), "data_calls": self.data_calls.load(Ordering::Relaxed),
            "metadata_calls": self.metadata_calls.load(Ordering::Relaxed), "mutation_calls": self.mutation_calls.load(Ordering::Relaxed),
            "head_calls": self.head_calls.load(Ordering::Relaxed), "snapshot_calls": self.snapshot_calls.load(Ordering::Relaxed) })
    }
}
