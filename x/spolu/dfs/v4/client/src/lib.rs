use anyhow::{Result, ensure};
pub mod cache;
pub use cache::{CacheConfig, CacheReservation, CachedClient};
use dfs_protocol::{
    MAX_MESSAGE,
    rpc::{dfs_client::DfsClient, *},
};
use parking_lot::Mutex;
use std::{
    collections::BTreeMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::runtime::Runtime;
use tonic::{
    Request, Status,
    metadata::{Ascii, MetadataValue},
    transport::{Channel, ClientTlsConfig, Endpoint},
};

/// @cc [owner:spolu,label:api;concurrency] one-attempt-rpcs
/// Each client call MUST issue exactly one RPC attempt. Binary I/O MUST remain bounded by the protocol
/// limit. Cloned clients MUST share a channel without serializing unrelated calls behind a mutex.
#[derive(Clone)]
pub struct Client {
    rpc: DfsClient<Channel>,
    authorization: MetadataValue<Ascii>,
    metrics: Arc<Mutex<BTreeMap<&'static str, Metric>>>,
}
#[derive(Default)]
struct Metric {
    calls: u64,
    errors: u64,
    elapsed_ns: u128,
}
/// @cc [owner:spolu,label:performance;security] aggregate-client-timing
/// Timers MUST record only fixed operation names and aggregate durations, without paths or payloads.
/// They MUST measure existing execution without changing admission, ordering, or retry behavior.
/// Nested and concurrent durations MUST NOT be interpreted as additive wall time.
#[must_use]
pub struct MetricTimer {
    metrics: Arc<Mutex<BTreeMap<&'static str, Metric>>>,
    name: &'static str,
    started: Instant,
}
impl Drop for MetricTimer {
    fn drop(&mut self) {
        let elapsed = self.started.elapsed();
        let mut metrics = self.metrics.lock();
        let metric = metrics.entry(self.name).or_default();
        metric.calls += 1;
        metric.elapsed_ns += elapsed.as_nanos();
    }
}
impl Client {
    fn measure(&self, name: &'static str) -> MetricTimer {
        MetricTimer {
            metrics: self.metrics.clone(),
            name,
            started: Instant::now(),
        }
    }
    pub async fn connect(endpoint: &str, key: &str) -> Result<Self> {
        let uri: tonic::codegen::http::Uri = endpoint.parse()?;
        ensure!(
            matches!(uri.scheme_str(), Some("http" | "https"))
                && uri.path() == "/"
                && uri.query().is_none()
                && uri.authority().is_some_and(|a| !a.as_str().contains('@')),
            "endpoint must be an http(s) origin without credentials"
        );
        ensure!(
            key.len() == 64 && key.bytes().all(|b| b.is_ascii_hexdigit()),
            "invalid authentication key"
        );
        let mut endpoint = Endpoint::from_shared(endpoint.to_owned())?
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(30))
            .concurrency_limit(64)
            .buffer_size(64);
        if uri.scheme_str() == Some("https") {
            endpoint = endpoint.tls_config(ClientTlsConfig::new().with_native_roots())?;
        }
        let rpc = DfsClient::new(endpoint.connect().await?)
            .max_encoding_message_size(MAX_MESSAGE)
            .max_decoding_message_size(MAX_MESSAGE);
        let mut authorization = format!("Bearer {key}").parse::<MetadataValue<Ascii>>()?;
        authorization.set_sensitive(true);
        Ok(Self {
            rpc,
            authorization,
            metrics: Default::default(),
        })
    }
    fn request<T>(&self, value: T) -> Request<T> {
        let mut request = Request::new(value);
        request
            .metadata_mut()
            .insert("authorization", self.authorization.clone());
        request
    }
    fn record(&self, name: &'static str, elapsed: Duration, failed: bool) {
        let mut metrics = self.metrics.lock();
        let metric = metrics.entry(name).or_default();
        metric.calls += 1;
        metric.errors += u64::from(failed);
        metric.elapsed_ns += elapsed.as_nanos();
    }
}
#[derive(Clone)]
pub struct BlockingClient {
    runtime: Arc<Runtime>,
    client: Client,
}
impl BlockingClient {
    pub fn connect(endpoint: &str, key: &str) -> Result<Self> {
        let runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()?,
        );
        let client = runtime.block_on(Client::connect(endpoint, key))?;
        Ok(Self { runtime, client })
    }
    pub fn measure_fuse_call(&self, name: &'static str) -> MetricTimer {
        self.client.measure(name)
    }
    /// Only operation names, counts, and durations are recorded; no credentials, paths, or payloads.
    pub fn metrics(&self) -> serde_json::Value {
        let metrics = self.client.metrics.lock();
        let values: BTreeMap<_, _> = metrics
            .iter()
            .map(|(name, metric)| {
                (
                    *name,
                    serde_json::json!({
                        "calls": metric.calls, "errors": metric.errors,
                        "elapsed_ms": metric.elapsed_ns as f64 / 1_000_000.0,
                    }),
                )
            })
            .collect();
        serde_json::json!({"dfs_client_metrics": values})
    }
}
macro_rules! methods {
    ($($method:ident: $request:ty => $response:ty),* $(,)?) => {
        impl Client { $(pub async fn $method(&self, value: $request) -> Result<$response, Status> {
            let start = Instant::now();
            let result = self.rpc.clone().$method(self.request(value)).await.map(tonic::Response::into_inner);
            self.record(concat!("rpc.", stringify!($method)), start.elapsed(), result.is_err());
            result
        })* }
        impl BlockingClient { $(pub fn $method(&self, value: $request) -> Result<$response, Status> {
            self.runtime.block_on(self.client.$method(value))
        })* }
    }
}
methods! {
    create_tenant: CreateTenantRequest => Tenant,
    create_session: CreateSessionRequest => Session,
    current_session: Empty => Session,
    close_session: Empty => Empty,
    list_grants: ListGrantsRequest => GrantPage,
    update_grants: UpdateGrantsRequest => Object,
    stat: ObjectRequest => Object,
    stat_many: StatManyRequest => StatManyResponse,
    lookup: LookupRequest => Object,
    list: ListRequest => Page,
    create: CreateRequest => Mutation,
    update: UpdateRequest => Mutation,
    rename: RenameRequest => Mutation,
    remove: RemoveRequest => Mutation,
    fsync: ObjectRequest => Object,
}

impl Client {
    pub async fn mutate_batch(
        &self,
        value: MutateBatchRequest,
    ) -> Result<tonic::Streaming<GroupResult>, Status> {
        let start = Instant::now();
        let result = self
            .rpc
            .clone()
            .mutate_batch(self.request(value))
            .await
            .map(tonic::Response::into_inner);
        self.record("rpc.mutate_batch", start.elapsed(), result.is_err());
        result
    }
    pub async fn read(&self, value: ReadRequest) -> Result<ReadResponse, Status> {
        if value.length as usize > dfs_protocol::MAX_IO {
            return Err(dfs_protocol::error::status(ErrorCode::InvalidInput));
        }
        let start = Instant::now();
        let result = self
            .rpc
            .clone()
            .read(self.request(value))
            .await
            .map(tonic::Response::into_inner);
        self.record("rpc.read", start.elapsed(), result.is_err());
        result
    }
    pub async fn write(&self, value: WriteRequest) -> Result<Mutation, Status> {
        if value.data.len() > dfs_protocol::MAX_IO {
            return Err(dfs_protocol::error::status(ErrorCode::InvalidInput));
        }
        let start = Instant::now();
        let result = self
            .rpc
            .clone()
            .write(self.request(value))
            .await
            .map(tonic::Response::into_inner);
        self.record("rpc.write", start.elapsed(), result.is_err());
        result
    }
}
impl BlockingClient {
    pub fn read(&self, value: ReadRequest) -> Result<ReadResponse, Status> {
        self.runtime.block_on(self.client.read(value))
    }
    pub fn write(&self, value: WriteRequest) -> Result<Mutation, Status> {
        self.runtime.block_on(self.client.write(value))
    }
}
