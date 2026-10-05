use anyhow::{Result, ensure};
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
impl Client {
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
    pub fn record_fuse_call(&self, name: &'static str) {
        self.client.record(name, Duration::ZERO, false);
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
    create_workspace: CreateWorkspaceRequest => Workspace,
    create_session: CreateSessionRequest => Session,
    current_session: Empty => Session,
    close_session: Empty => Empty,
    list_grants: ListGrantsRequest => GrantPage,
    update_grants: UpdateGrantsRequest => Object,
    stat: ObjectRequest => Object,
    lookup: LookupRequest => Object,
    list: ListRequest => Page,
    create: CreateRequest => Mutation,
    update: UpdateRequest => Mutation,
    rename: RenameRequest => Mutation,
    remove: RemoveRequest => Mutation,
    fsync: ObjectRequest => Object,
    search_files: SearchFilesRequest => SearchFilesResponse,
    get_index_status: IndexStatusRequest => IndexStatus,
}

impl Client {
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
