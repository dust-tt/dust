use std::collections::{HashMap, HashSet};
use std::future::{poll_fn, Future};
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Weak};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use h2::client::{ResponseFuture, SendRequest};
use h2::server::SendResponse;
use h2::{RecvStream, SendStream};
use http::header::{CONTENT_LENGTH, COOKIE, HOST, TE, TRANSFER_ENCODING};
use http::{HeaderMap, HeaderName, HeaderValue, Request, Response, StatusCode};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;
use tracing::warn;

use crate::egress_secrets::SecretTable;

use super::deny_log::{append_deny_log, DenyReason};
use super::http_framing::{
    find_subslice, is_common_bridge_stripped_header, parse_chunk_size, MAX_HEADER_BLOCK_BYTES,
    MAX_HEADER_LINE_BYTES, MAX_TRAILER_BLOCK_BYTES, READ_CHUNK_BYTES,
};
use super::rewrite_policy::{
    deny_entry, process_request_policy, Authority, HeaderPart, RequestParts, RewriteMode,
};

const H2_MAX_CONCURRENT_STREAMS: u32 = 256;
// 1 MiB initial window for h2 streams on both sides. The h2 spec default
// (64 KiB - 1) throttles single uploads to one round-trip per window; 1 MiB
// keeps large request/response bodies flowing without explicit WINDOW_UPDATEs
// dominating wall-clock latency.
const H2_INITIAL_WINDOW_SIZE: u32 = 1_048_576;
// Safety cap for one declared h1 chunk. Forwarding still streams chunks in
// READ_CHUNK_BYTES pieces, so this only bounds the largest single chunk an
// upstream is allowed to declare in its framing. 64 MiB is well above any
// chunk an LB or origin we forward through is expected to emit while still
// keeping a hard ceiling against pathological framing.
const MAX_H1_RESPONSE_CHUNK_BYTES: usize = 64 * 1024 * 1024;

pub(super) trait AsyncReadWrite: AsyncRead + AsyncWrite + Unpin + Send {}

impl<T> AsyncReadWrite for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

pub(super) type BoxedAsyncReadWrite = Box<dyn AsyncReadWrite>;
// The authority is intentionally not a parameter: every h2 stream on a session
// has already been gated by `process_request_policy` to match the session SNI,
// so opening upstream means opening the SNI's upstream. The opener captures
// the SNI itself; passing it back in would be redundant and would invite a
// future relaxation of the policy gate to silently bypass the SNI binding.
#[cfg(test)]
pub(super) type OpenH1Upstream = Arc<
    dyn Fn() -> Pin<Box<dyn Future<Output = Result<BoxedAsyncReadWrite>> + Send>> + Send + Sync,
>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum UpstreamProtocol {
    H2,
    Http1,
}

pub(super) struct OpenedUpstream {
    protocol: UpstreamProtocol,
    io: BoxedAsyncReadWrite,
}

impl OpenedUpstream {
    pub(super) fn new(protocol: UpstreamProtocol, io: BoxedAsyncReadWrite) -> Self {
        Self { protocol, io }
    }
}

pub(super) type OpenUpstream = Arc<
    dyn Fn(H2UpstreamKey) -> Pin<Box<dyn Future<Output = Result<OpenedUpstream>> + Send>>
        + Send
        + Sync,
>;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(super) struct H2UpstreamKey {
    authority: String,
    upstream_socket_addr: SocketAddr,
}

impl H2UpstreamKey {
    pub(super) fn new(authority: String, upstream_socket_addr: SocketAddr) -> Self {
        Self {
            authority,
            upstream_socket_addr,
        }
    }

    pub(super) fn authority(&self) -> &str {
        &self.authority
    }
}

// Evict an idle pooled h2 connection after 5 minutes. Long enough that a
// single agent making sporadic requests reuses the same upstream; short enough
// that an inactive sandbox does not hold sockets indefinitely.
const H2_UPSTREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
// Sweep less often than per-request pruning to keep the idle invariant true
// without waking an inactive sandbox too frequently.
const H2_UPSTREAM_POOL_SWEEP_INTERVAL: Duration = Duration::from_secs(60);
// Cap pooled h2 connections per upstream at 8. Saturation (upstream advertising
// a low SETTINGS_MAX_CONCURRENT_STREAMS) opens additional connections up to
// this cap; bumping it should be paired with a look at `reserve_h2_connection`,
// which is O(n) in the per-key vector length.
const H2_UPSTREAM_MAX_CONNECTIONS_PER_KEY: usize = 8;
const H2_REQUEST_DENY_POLL_TIMEOUT_MS: u64 = 50;

#[derive(Clone)]
pub(super) struct H2UpstreamPool {
    inner: Arc<H2UpstreamPoolInner>,
}

struct H2UpstreamPoolInner {
    open_upstream: OpenUpstream,
    entries: tokio::sync::Mutex<HashMap<H2UpstreamKey, Vec<Arc<PooledH2Connection>>>>,
    sweeper_shutdown: Arc<tokio::sync::Notify>,
}

struct PooledH2Connection {
    send_request: SendRequest<Bytes>,
    active_streams: AtomicUsize,
    draining: AtomicBool,
    closed: AtomicBool,
    started_at: tokio::time::Instant,
    last_used_ms: AtomicU64,
}

pub(super) enum UpstreamLease {
    H2(H2ConnectionLease),
    Http1(BoxedAsyncReadWrite),
}

pub(super) struct H2ConnectionLease {
    reservation: H2ConnectionReservation,
    send_request: SendRequest<Bytes>,
}

struct H2ConnectionReservation {
    connection: Arc<PooledH2Connection>,
}

impl Drop for H2ConnectionReservation {
    fn drop(&mut self) {
        self.connection
            .active_streams
            .fetch_sub(1, Ordering::SeqCst);
        self.connection
            .last_used_ms
            .store(connection_now_millis(&self.connection), Ordering::SeqCst);
    }
}

impl H2ConnectionLease {
    async fn ready(self) -> std::result::Result<Self, h2::Error> {
        let Self {
            reservation,
            send_request,
        } = self;
        let send_request = send_request.ready().await;
        match send_request {
            Ok(send_request) => Ok(Self {
                reservation,
                send_request,
            }),
            Err(error) => {
                reservation
                    .connection
                    .draining
                    .store(true, Ordering::SeqCst);
                Err(error)
            }
        }
    }

    fn send_request(&self) -> SendRequest<Bytes> {
        self.send_request.clone()
    }

    // Closed means the underlying h2 session has gone away and the connection
    // driver task has resolved; the pool entry is eligible for eviction on the
    // next prune.
    fn mark_closed(&self) {
        mark_h2_connection_closed(&self.reservation.connection);
    }
}

#[derive(Clone, Copy)]
struct H2RequestDeny {
    reason: DenyReason,
    reset: h2::Reason,
}

impl H2RequestDeny {
    fn internal(reason: DenyReason) -> Self {
        Self {
            reason,
            reset: h2::Reason::INTERNAL_ERROR,
        }
    }
}

impl H2UpstreamPool {
    pub(super) fn new(open_upstream: OpenUpstream) -> Self {
        let inner = Arc::new(H2UpstreamPoolInner {
            open_upstream,
            entries: tokio::sync::Mutex::new(HashMap::new()),
            sweeper_shutdown: Arc::new(tokio::sync::Notify::new()),
        });
        spawn_h2_pool_sweeper(&inner);
        Self { inner }
    }

    pub(super) async fn lease(&self, key: &H2UpstreamKey) -> Result<UpstreamLease> {
        loop {
            if let Some(lease) = self.try_reserve_existing_h2(key).await {
                match lease.ready().await {
                    Ok(lease) => return Ok(UpstreamLease::H2(lease)),
                    Err(error) => {
                        warn!(error = %error, "pooled h2 upstream connection drained before request");
                        continue;
                    }
                }
            }

            match self.open_or_reserve_new(key).await? {
                LeaseCandidate::Http1(io) => return Ok(UpstreamLease::Http1(io)),
                LeaseCandidate::H2 { lease, is_new } => match lease.ready().await {
                    Ok(lease) => return Ok(UpstreamLease::H2(lease)),
                    Err(error) if !is_new => {
                        warn!(error = %error, "pooled h2 upstream connection drained before request");
                        continue;
                    }
                    Err(error) => {
                        return Err(error).context("new outbound h2 connection is not ready");
                    }
                },
            }
        }
    }

    async fn try_reserve_existing_h2(&self, key: &H2UpstreamKey) -> Option<H2ConnectionLease> {
        let mut entries = self.inner.entries.lock().await;
        prune_idle_pool_entries(&mut entries);
        reserve_h2_connection(entries.get_mut(key)?)
    }

    // Holds the entries mutex across the upstream open so concurrent
    // first-leases for the same key share one handshake. Side effect: opens
    // for distinct keys also serialize through this mutex. Acceptable because
    // per-sandbox upstream fan-out is small; revisit if dsbx ever serves
    // many independent destinations concurrently.
    async fn open_or_reserve_new(&self, key: &H2UpstreamKey) -> Result<LeaseCandidate> {
        let mut entries = self.inner.entries.lock().await;
        prune_idle_pool_entries(&mut entries);
        if let Some(connections) = entries.get_mut(key) {
            if let Some(lease) = reserve_h2_connection(connections) {
                return Ok(LeaseCandidate::H2 {
                    lease,
                    is_new: false,
                });
            }
        }

        let opened = (self.inner.open_upstream)(key.clone())
            .await
            .context("failed to open pooled upstream")?;
        match opened.protocol {
            UpstreamProtocol::Http1 => Ok(LeaseCandidate::Http1(opened.io)),
            UpstreamProtocol::H2 => {
                let lease = insert_h2_connection_locked(&mut entries, key, opened.io)
                    .await
                    .context("failed to insert pooled h2 upstream")?;
                Ok(LeaseCandidate::H2 {
                    lease,
                    is_new: true,
                })
            }
        }
    }
}

impl Drop for H2UpstreamPoolInner {
    fn drop(&mut self) {
        self.sweeper_shutdown.notify_one();
    }
}

fn spawn_h2_pool_sweeper(inner: &Arc<H2UpstreamPoolInner>) {
    let shutdown = Arc::clone(&inner.sweeper_shutdown);
    let inner = Arc::downgrade(inner);
    tokio::spawn(async move {
        loop {
            tokio::select! {
                () = tokio::time::sleep(H2_UPSTREAM_POOL_SWEEP_INTERVAL) => {}
                () = shutdown.notified() => return,
            }

            let Some(inner) = inner.upgrade() else {
                return;
            };
            let mut entries = inner.entries.lock().await;
            prune_idle_pool_entries(&mut entries);
        }
    });
}

enum LeaseCandidate {
    H2 {
        lease: H2ConnectionLease,
        is_new: bool,
    },
    Http1(BoxedAsyncReadWrite),
}

async fn insert_h2_connection_locked(
    entries: &mut HashMap<H2UpstreamKey, Vec<Arc<PooledH2Connection>>>,
    key: &H2UpstreamKey,
    io: BoxedAsyncReadWrite,
) -> Result<H2ConnectionLease> {
    let mut builder = h2::client::Builder::new();
    builder
        .max_header_list_size(MAX_HEADER_BLOCK_BYTES as u32)
        .initial_window_size(H2_INITIAL_WINDOW_SIZE)
        .enable_push(false);
    let (send_request, connection) = builder
        .handshake::<_, Bytes>(io)
        .await
        .context("failed to establish outbound h2 session")?;
    let pooled = Arc::new(PooledH2Connection {
        send_request,
        // Starts at 1: the caller of `lease()` that triggered this open already
        // holds the implicit reservation that the returned lease represents.
        active_streams: AtomicUsize::new(1),
        draining: AtomicBool::new(false),
        closed: AtomicBool::new(false),
        started_at: tokio::time::Instant::now(),
        last_used_ms: AtomicU64::new(0),
    });
    let connection_for_task = Arc::downgrade(&pooled);
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            warn!(error = %error, "outbound h2 upstream connection closed with error");
        }
        mark_h2_connection_closed_if_live(&connection_for_task);
    });

    entries
        .entry(key.clone())
        .or_default()
        .push(Arc::clone(&pooled));
    let send_request = pooled.send_request.clone();

    Ok(H2ConnectionLease {
        reservation: H2ConnectionReservation { connection: pooled },
        send_request,
    })
}

fn mark_h2_connection_closed(connection: &PooledH2Connection) {
    connection.draining.store(true, Ordering::SeqCst);
    connection.closed.store(true, Ordering::SeqCst);
}

fn mark_h2_connection_closed_if_live(connection: &Weak<PooledH2Connection>) {
    if let Some(connection) = connection.upgrade() {
        mark_h2_connection_closed(&connection);
    }
}

fn reserve_h2_connection(
    connections: &mut Vec<Arc<PooledH2Connection>>,
) -> Option<H2ConnectionLease> {
    connections.retain(|connection| is_h2_connection_live(connection));
    let connection = if let Some(connection) = select_available_h2_connection(connections) {
        connection
    } else if connections.len() < H2_UPSTREAM_MAX_CONNECTIONS_PER_KEY {
        return None;
    } else {
        select_least_busy_h2_connection(connections)?
    };
    connection.active_streams.fetch_add(1, Ordering::SeqCst);
    let send_request = connection.send_request.clone();
    Some(H2ConnectionLease {
        reservation: H2ConnectionReservation { connection },
        send_request,
    })
}

fn is_h2_connection_live(connection: &PooledH2Connection) -> bool {
    !connection.closed.load(Ordering::SeqCst) && !connection.draining.load(Ordering::SeqCst)
}

fn idle_timeout_millis() -> u64 {
    H2_UPSTREAM_IDLE_TIMEOUT.as_millis() as u64
}

// Connection uptime in milliseconds. u64::MAX ms is ~584 million years, so the
// cast from u128 cannot overflow for any realistic dsbx lifetime.
fn connection_now_millis(connection: &PooledH2Connection) -> u64 {
    connection.started_at.elapsed().as_millis() as u64
}

fn connection_is_idle_expired(connection: &PooledH2Connection) -> bool {
    if connection.active_streams.load(Ordering::SeqCst) != 0 {
        return false;
    }

    let now_ms = connection_now_millis(connection);
    now_ms.saturating_sub(connection.last_used_ms.load(Ordering::SeqCst)) >= idle_timeout_millis()
}

fn prune_idle_pool_entries(entries: &mut HashMap<H2UpstreamKey, Vec<Arc<PooledH2Connection>>>) {
    entries.retain(|_, connections| {
        connections.retain(|connection| {
            is_h2_connection_live(connection) && !connection_is_idle_expired(connection)
        });
        !connections.is_empty()
    });
}

fn select_available_h2_connection(
    connections: &[Arc<PooledH2Connection>],
) -> Option<Arc<PooledH2Connection>> {
    connections
        .iter()
        .filter(|connection| is_h2_connection_live(connection))
        .find(|connection| {
            let active = connection.active_streams.load(Ordering::SeqCst);
            active < connection.send_request.current_max_send_streams()
        })
        .cloned()
}

fn select_least_busy_h2_connection(
    connections: &[Arc<PooledH2Connection>],
) -> Option<Arc<PooledH2Connection>> {
    connections
        .iter()
        .filter(|connection| is_h2_connection_live(connection))
        .min_by_key(|connection| connection.active_streams.load(Ordering::SeqCst))
        .cloned()
}

enum WriteH1RequestError {
    Denied(H2RequestDeny),
    Bridge(anyhow::Error),
}

type WriteH1RequestResult<T> = std::result::Result<T, WriteH1RequestError>;

#[derive(Clone)]
enum UpstreamBridge {
    #[cfg(test)]
    H1 { open_upstream: OpenH1Upstream },
    Pooled {
        pool: H2UpstreamPool,
        key: H2UpstreamKey,
    },
}

#[cfg(test)]
pub(super) async fn run_h2_to_h1_bridge<C>(
    agent_tls: C,
    sni: String,
    secret_table: Arc<SecretTable>,
    deny_log: Arc<std::path::PathBuf>,
    open_upstream: OpenH1Upstream,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    run_h2_bridge(
        agent_tls,
        sni,
        secret_table,
        deny_log,
        UpstreamBridge::H1 { open_upstream },
    )
    .await
}

pub(super) async fn run_h2_to_upstream_bridge<C>(
    agent_tls: C,
    sni: String,
    secret_table: Arc<SecretTable>,
    deny_log: Arc<std::path::PathBuf>,
    pool: H2UpstreamPool,
    key: H2UpstreamKey,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    run_h2_bridge(
        agent_tls,
        sni,
        secret_table,
        deny_log,
        UpstreamBridge::Pooled { pool, key },
    )
    .await
}

async fn run_h2_bridge<C>(
    agent_tls: C,
    sni: String,
    secret_table: Arc<SecretTable>,
    deny_log: Arc<std::path::PathBuf>,
    upstream_bridge: UpstreamBridge,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let mut builder = h2::server::Builder::new();
    builder
        .max_concurrent_streams(H2_MAX_CONCURRENT_STREAMS)
        .initial_window_size(H2_INITIAL_WINDOW_SIZE)
        // Keep inbound h2 request headers under the same bound as the h1
        // rewriter before HPACK decoding can buffer a much larger block.
        .max_header_list_size(MAX_HEADER_BLOCK_BYTES as u32);
    // We do not advertise SETTINGS_ENABLE_PUSH on the server side: per RFC 7540
    // ENABLE_PUSH is the client telling the server whether it accepts pushes,
    // and a server only pushes if it calls `push_promise`, which we do not.
    // The opposite-direction client-side setting lives on h2::client::Builder
    // and will be set in the outbound h2 origination slice.
    let mut connection = builder
        .handshake::<_, Bytes>(agent_tls)
        .await
        .context("failed to establish inbound h2 server session")?;

    while let Some(accepted) = connection.accept().await {
        let (request, respond) = accepted.context("failed to accept inbound h2 stream")?;
        let sni = sni.clone();
        let secret_table = Arc::clone(&secret_table);
        let deny_log = Arc::clone(&deny_log);
        let upstream_bridge = upstream_bridge.clone();
        tokio::spawn(async move {
            if let Err(error) = handle_h2_stream(
                request,
                respond,
                sni,
                secret_table,
                deny_log,
                upstream_bridge,
            )
            .await
            {
                warn!(error = %error, "h2 stream bridge failed");
            }
        });
    }

    Ok(())
}

struct H2BridgeRequest {
    method: String,
    target: String,
    authority: String,
    headers: Vec<HeaderPart>,
    body: RecvStream,
    respond: SendResponse<Bytes>,
}

struct H2PolicyContext<'a> {
    deny_log: Arc<std::path::PathBuf>,
    mode: RewriteMode<'a>,
}

struct H2H1ForwardRequest {
    method: String,
    authority: String,
    body: RecvStream,
    respond: SendResponse<Bytes>,
    header_bytes: Vec<u8>,
    use_chunked: bool,
}

type H2RequestDenySlot = Arc<Mutex<Option<H2RequestDeny>>>;

async fn store_h2_request_body_deny(slot: &H2RequestDenySlot, deny: H2RequestDeny) {
    let mut slot = slot.lock().await;
    *slot = Some(deny);
}

async fn take_h2_request_body_deny(slot: &H2RequestDenySlot) -> Option<H2RequestDeny> {
    let mut slot = slot.lock().await;
    slot.take()
}

async fn handle_h2_request_body_deny(
    policy: &H2PolicyContext<'_>,
    respond: &mut SendResponse<Bytes>,
    authority: &str,
    deny: H2RequestDeny,
) -> Result<()> {
    let entry = deny_entry(policy.mode, deny.reason, None, Some(authority));
    append_deny_log(&policy.deny_log, entry)
        .await
        .context("failed to append h2 request-body deny log entry")?;
    respond.send_reset(deny.reset);
    Ok(())
}

async fn handle_h2_stream(
    request: Request<RecvStream>,
    mut respond: SendResponse<Bytes>,
    sni: String,
    secret_table: Arc<SecretTable>,
    deny_log: Arc<std::path::PathBuf>,
    upstream_bridge: UpstreamBridge,
) -> Result<()> {
    let (parts, body) = request.into_parts();
    let method = parts.method.to_string();
    let target = h2_request_target(&parts.uri);
    let mode = RewriteMode::Tls { sni: &sni };
    let authority = match h2_request_authority(&parts.uri, &parts.headers) {
        Ok(authority) => authority,
        Err(error) => {
            let entry = deny_entry(mode, DenyReason::MalformedHeaders, None, None);
            append_deny_log(&deny_log, entry)
                .await
                .context("failed to append h2 malformed-authority deny log entry")?;
            respond.send_reset(h2::Reason::PROTOCOL_ERROR);
            return Err(error);
        }
    };
    if !method.eq_ignore_ascii_case("CONNECT") && parts.uri.scheme_str() != Some("https") {
        let entry = deny_entry(mode, DenyReason::MalformedHeaders, None, Some(&authority));
        append_deny_log(&deny_log, entry)
            .await
            .context("failed to append h2 scheme deny log entry")?;
        respond.send_reset(h2::Reason::PROTOCOL_ERROR);
        return Ok(());
    }
    if let Err(error) = validate_h2_request_headers(&parts.headers, body.is_end_stream()) {
        let entry = deny_entry(mode, DenyReason::MalformedHeaders, None, Some(&authority));
        append_deny_log(&deny_log, entry)
            .await
            .context("failed to append h2 malformed-header deny log entry")?;
        respond.send_reset(h2::Reason::PROTOCOL_ERROR);
        return Err(error);
    }
    let headers = header_map_to_parts(&parts.headers);
    let policy_request = RequestParts {
        method: method.clone(),
        target: target.clone(),
        headers,
    };

    let policy = match process_request_policy(
        &policy_request,
        Authority::Explicit { value: &authority },
        &secret_table,
        mode,
    ) {
        Ok(policy) => policy,
        Err(entry) => {
            append_deny_log(&deny_log, entry)
                .await
                .context("failed to append h2 deny log entry")?;
            respond.send_reset(h2::Reason::INTERNAL_ERROR);
            return Ok(());
        }
    };
    match upstream_bridge {
        #[cfg(test)]
        UpstreamBridge::H1 { open_upstream } => {
            let request = H2BridgeRequest {
                method,
                target,
                authority,
                headers: fold_request_cookies(policy.headers),
                body,
                respond,
            };
            handle_h2_to_h1_stream(request, H2PolicyContext { deny_log, mode }, open_upstream).await
        }
        UpstreamBridge::Pooled { pool, key } => {
            if let Err(deny) = validate_header_part_size(&policy.headers) {
                let entry = deny_entry(mode, deny.reason, None, Some(&authority));
                append_deny_log(&deny_log, entry)
                    .await
                    .context("failed to append h2 request-header deny log entry")?;
                respond.send_reset(deny.reset);
                return Ok(());
            }

            match pool.lease(&key).await {
                Ok(UpstreamLease::Http1(upstream)) => {
                    let request = H2BridgeRequest {
                        method,
                        target,
                        authority,
                        headers: fold_request_cookies(policy.headers),
                        body,
                        respond,
                    };
                    handle_h2_to_h1_upstream(request, H2PolicyContext { deny_log, mode }, upstream)
                        .await
                }
                Ok(UpstreamLease::H2(lease)) => {
                    // Keep h2 cookie fields split; only the h1 fallback folds them
                    // before serializing onto an HTTP/1.1 request.
                    let request = H2BridgeRequest {
                        method,
                        target,
                        authority,
                        headers: policy.headers,
                        body,
                        respond,
                    };
                    handle_h2_to_h2_stream(request, H2PolicyContext { deny_log, mode }, lease).await
                }
                Err(error) => {
                    respond.send_reset(h2::Reason::INTERNAL_ERROR);
                    Err(error).with_context(|| format!("failed to open upstream for {authority}"))
                }
            }
        }
    }
}

#[cfg(test)]
async fn handle_h2_to_h1_stream(
    mut request: H2BridgeRequest,
    policy: H2PolicyContext<'_>,
    open_upstream: OpenH1Upstream,
) -> Result<()> {
    let (header_bytes, use_chunked) = match build_h1_request_head(
        &request.method,
        &request.target,
        &request.authority,
        &request.headers,
        request.body.is_end_stream(),
    ) {
        Ok(result) => result,
        Err(deny) => {
            let entry = deny_entry(policy.mode, deny.reason, None, Some(&request.authority));
            append_deny_log(&policy.deny_log, entry)
                .await
                .context("failed to append h2 request-header deny log entry")?;
            request.respond.send_reset(deny.reset);
            return Ok(());
        }
    };
    let upstream = match open_upstream().await {
        Ok(upstream) => upstream,
        Err(error) => {
            request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
            return Err(error)
                .with_context(|| format!("failed to open h1 upstream for {}", request.authority));
        }
    };
    forward_h2_to_h1_upstream(
        H2H1ForwardRequest {
            method: request.method,
            authority: request.authority,
            body: request.body,
            respond: request.respond,
            header_bytes,
            use_chunked,
        },
        policy,
        upstream,
    )
    .await
}

async fn handle_h2_to_h1_upstream(
    mut request: H2BridgeRequest,
    policy: H2PolicyContext<'_>,
    upstream: BoxedAsyncReadWrite,
) -> Result<()> {
    let (header_bytes, use_chunked) = match build_h1_request_head(
        &request.method,
        &request.target,
        &request.authority,
        &request.headers,
        request.body.is_end_stream(),
    ) {
        Ok(result) => result,
        Err(deny) => {
            let entry = deny_entry(policy.mode, deny.reason, None, Some(&request.authority));
            append_deny_log(&policy.deny_log, entry)
                .await
                .context("failed to append h2 request-header deny log entry")?;
            request.respond.send_reset(deny.reset);
            return Ok(());
        }
    };
    forward_h2_to_h1_upstream(
        H2H1ForwardRequest {
            method: request.method,
            authority: request.authority,
            body: request.body,
            respond: request.respond,
            header_bytes,
            use_chunked,
        },
        policy,
        upstream,
    )
    .await
}

async fn forward_h2_to_h1_upstream(
    mut request: H2H1ForwardRequest,
    policy: H2PolicyContext<'_>,
    upstream: BoxedAsyncReadWrite,
) -> Result<()> {
    let (mut upstream_read, upstream_write) = tokio::io::split(upstream);
    let mut request_task = tokio::spawn(write_h1_request(
        upstream_write,
        request.header_bytes,
        request.use_chunked,
        request.body,
    ));
    let mut response_task = Box::pin(forward_h1_response_to_h2(
        &mut upstream_read,
        &mut request.respond,
        &request.method,
    ));

    tokio::select! {
        request_result = &mut request_task => {
            match request_result.context("h1 request writer task panicked")? {
                Ok(()) => {}
                Err(WriteH1RequestError::Denied(deny)) => {
                    drop(response_task);
                    let entry = deny_entry(policy.mode, deny.reason, None, Some(&request.authority));
                    append_deny_log(&policy.deny_log, entry)
                        .await
                        .context("failed to append h2 request-body deny log entry")?;
                    request.respond.send_reset(deny.reset);
                    return Ok(());
                }
                Err(WriteH1RequestError::Bridge(error)) => {
                    drop(response_task);
                    request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                    return Err(error);
                }
            }

            if let Err(error) = response_task.await {
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error);
            }
        }
        response_result = &mut response_task => {
            drop(response_task);
            if let Err(error) = response_result {
                request_task.abort();
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error);
            }
        }
    }

    Ok(())
}

enum ForwardH2RequestBodyResult {
    Complete,
    InboundReset,
}

enum ForwardH2RequestBodyError {
    InboundReset,
    Denied(H2RequestDeny),
    Bridge(anyhow::Error),
}

async fn handle_h2_to_h2_stream(
    mut request: H2BridgeRequest,
    policy: H2PolicyContext<'_>,
    lease: H2ConnectionLease,
) -> Result<()> {
    let body_is_end_stream = request.body.is_end_stream();
    let outbound_request = match build_h2_upstream_request(
        &request.method,
        &request.target,
        &request.authority,
        &request.headers,
    ) {
        Ok(request) => request,
        Err(deny) => {
            let entry = deny_entry(policy.mode, deny.reason, None, Some(&request.authority));
            append_deny_log(&policy.deny_log, entry)
                .await
                .context("failed to append h2 upstream request deny log entry")?;
            request.respond.send_reset(deny.reset);
            return Ok(());
        }
    };

    let mut send_request = lease.send_request();
    let (response, send_stream) =
        match send_request.send_request(outbound_request, body_is_end_stream) {
            Ok(result) => result,
            Err(error) => {
                lease.mark_closed();
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error).context("failed to send outbound h2 request head");
            }
        };

    if body_is_end_stream {
        if let Err(error) =
            forward_h2_response_to_h2(response, &mut request.respond, &request.method).await
        {
            request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
            return Err(error);
        }
        drop(send_stream);
        drop(lease);
        return Ok(());
    }

    let request_body_deny = Arc::new(Mutex::new(None));
    let mut request_task = tokio::spawn(forward_h2_request_body(
        request.body,
        send_stream,
        Arc::clone(&request_body_deny),
    ));
    let mut response_task = Box::pin(forward_h2_response_to_h2(
        response,
        &mut request.respond,
        &request.method,
    ));

    tokio::select! {
        request_result = &mut request_task => {
            match request_result.context("h2 request forward task panicked")? {
                Ok(ForwardH2RequestBodyResult::Complete) => {}
                Ok(ForwardH2RequestBodyResult::InboundReset) => {
                    drop(response_task);
                    return Ok(());
                }
                Err(ForwardH2RequestBodyError::InboundReset) => {
                    drop(response_task);
                    return Ok(());
                }
                Err(ForwardH2RequestBodyError::Denied(deny)) => {
                    drop(response_task);
                    handle_h2_request_body_deny(
                        &policy,
                        &mut request.respond,
                        &request.authority,
                        deny,
                    )
                    .await?;
                    return Ok(());
                }
                Err(ForwardH2RequestBodyError::Bridge(error)) => {
                    drop(response_task);
                    request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                    return Err(error);
                }
            }

            if let Err(error) = response_task.await {
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error);
            }
        }
        response_result = &mut response_task => {
            drop(response_task);
            if let Err(error) = response_result {
                if let Some(deny) = take_h2_request_body_deny(&request_body_deny).await {
                    request_task.abort();
                    handle_h2_request_body_deny(
                        &policy,
                        &mut request.respond,
                        &request.authority,
                        deny,
                    )
                    .await?;
                    return Ok(());
                }
                match tokio::time::timeout(
                    Duration::from_millis(H2_REQUEST_DENY_POLL_TIMEOUT_MS),
                    &mut request_task,
                )
                .await
                {
                    Ok(request_result) => {
                        match request_result.context("h2 request forward task panicked")? {
                            Ok(ForwardH2RequestBodyResult::Complete) => {
                                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                                return Err(error);
                            }
                            Ok(ForwardH2RequestBodyResult::InboundReset)
                            | Err(ForwardH2RequestBodyError::InboundReset) => return Ok(()),
                            Err(ForwardH2RequestBodyError::Denied(deny)) => {
                                handle_h2_request_body_deny(
                                    &policy,
                                    &mut request.respond,
                                    &request.authority,
                                    deny,
                                )
                                .await?;
                                return Ok(());
                            }
                            Err(ForwardH2RequestBodyError::Bridge(request_error)) => {
                                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                                return Err(request_error);
                            }
                        }
                    }
                    Err(_) => {
                        if let Some(deny) = take_h2_request_body_deny(&request_body_deny).await {
                            request_task.abort();
                            handle_h2_request_body_deny(
                                &policy,
                                &mut request.respond,
                                &request.authority,
                                deny,
                            )
                            .await?;
                            return Ok(());
                        }
                    }
                }
                request_task.abort();
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error);
            }
            request_task.abort();
        }
    }

    Ok(())
}

fn validate_header_part_size(headers: &[HeaderPart]) -> std::result::Result<(), H2RequestDeny> {
    let mut total = 0;
    for header in headers {
        let line_len = header.name.len() + b": ".len() + header.value.len() + b"\r\n".len();
        if line_len > MAX_HEADER_LINE_BYTES {
            return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
        }
        total += line_len;
        if total > MAX_HEADER_BLOCK_BYTES {
            return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
        }
    }

    Ok(())
}

fn build_h2_upstream_request(
    method: &str,
    target: &str,
    authority: &str,
    headers: &[HeaderPart],
) -> std::result::Result<Request<()>, H2RequestDeny> {
    let uri = format!("https://{authority}{target}");
    let mut request = Request::builder()
        .version(http::Version::HTTP_2)
        .method(method)
        .uri(uri);
    for header in headers {
        if should_strip_h2_upstream_header(&header.name) {
            continue;
        }
        let name = HeaderName::from_bytes(header.name.as_bytes())
            .map_err(|_| H2RequestDeny::internal(DenyReason::MalformedHeaders))?;
        let value = HeaderValue::from_bytes(&header.value)
            .map_err(|_| H2RequestDeny::internal(DenyReason::MalformedHeaders))?;
        request = request.header(name, value);
    }

    request
        .body(())
        .map_err(|_| H2RequestDeny::internal(DenyReason::MalformedHeaders))
}

fn should_strip_h2_upstream_header(name: &str) -> bool {
    is_common_bridge_stripped_header(name)
}

async fn forward_h2_request_body(
    mut inbound: RecvStream,
    mut outbound: SendStream<Bytes>,
    denied: H2RequestDenySlot,
) -> std::result::Result<ForwardH2RequestBodyResult, ForwardH2RequestBodyError> {
    while let Some(chunk) = inbound.data().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(error) if error.is_reset() => {
                outbound.send_reset(error.reason().unwrap_or(h2::Reason::CANCEL));
                return Ok(ForwardH2RequestBodyResult::InboundReset);
            }
            Err(error) => return Err(ForwardH2RequestBodyError::Bridge(error.into())),
        };
        let len = chunk.len();
        if len != 0 {
            send_data(&mut outbound, chunk, false)
                .await
                .map_err(ForwardH2RequestBodyError::Bridge)?;
        }
        inbound
            .flow_control()
            .release_capacity(len)
            .map_err(|error| ForwardH2RequestBodyError::Bridge(error.into()))?;
    }

    let trailers = inbound.trailers().await.map_err(|error| {
        if error.is_reset() {
            ForwardH2RequestBodyError::InboundReset
        } else {
            ForwardH2RequestBodyError::Bridge(error.into())
        }
    })?;
    if let Some(trailers) = trailers {
        if !trailers.is_empty() {
            let deny = H2RequestDeny::internal(DenyReason::RequestTrailersUnsupported);
            store_h2_request_body_deny(&denied, deny).await;
            outbound.send_reset(h2::Reason::INTERNAL_ERROR);
            return Err(ForwardH2RequestBodyError::Denied(deny));
        }
        send_data(&mut outbound, Bytes::new(), true)
            .await
            .map_err(ForwardH2RequestBodyError::Bridge)?;
    } else {
        send_data(&mut outbound, Bytes::new(), true)
            .await
            .map_err(ForwardH2RequestBodyError::Bridge)?;
    }

    Ok(ForwardH2RequestBodyResult::Complete)
}

enum UpstreamResponseEvent {
    Informational(Response<()>),
    Final(Response<RecvStream>),
}

async fn next_upstream_response_event(
    response: &mut ResponseFuture,
) -> Result<UpstreamResponseEvent> {
    poll_fn(|cx| {
        if let std::task::Poll::Ready(Some(result)) = response.poll_informational(cx) {
            return std::task::Poll::Ready(
                result
                    .map(UpstreamResponseEvent::Informational)
                    .map_err(anyhow::Error::from),
            );
        }
        match Pin::new(&mut *response).poll(cx) {
            std::task::Poll::Ready(result) => std::task::Poll::Ready(
                result
                    .map(UpstreamResponseEvent::Final)
                    .map_err(anyhow::Error::from),
            ),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    })
    .await
}

async fn forward_h2_response_to_h2(
    mut response: ResponseFuture,
    respond: &mut SendResponse<Bytes>,
    request_method: &str,
) -> Result<()> {
    let final_response = loop {
        match next_upstream_response_event(&mut response).await? {
            UpstreamResponseEvent::Informational(response) => {
                let response = sanitize_h2_response_head(response)?;
                respond
                    .send_informational(response)
                    .context("failed to send downstream h2 informational response")?;
            }
            UpstreamResponseEvent::Final(response) => break response,
        }
    };
    let status = final_response.status();
    let no_body = response_has_no_body(request_method, status);
    let (parts, mut upstream_body) = final_response.into_parts();
    let response_is_end_stream = upstream_body.is_end_stream();
    let response = sanitize_h2_response_head(Response::from_parts(parts, ()))?;

    if no_body || response_is_end_stream {
        respond
            .send_response(response, true)
            .context("failed to send downstream h2 response head")?;
        return Ok(());
    }

    let mut downstream = respond
        .send_response(response, false)
        .context("failed to send downstream h2 response head")?;
    while let Some(chunk) = upstream_body.data().await {
        let chunk = chunk.context("failed to read upstream h2 response data")?;
        let len = chunk.len();
        if len != 0 {
            send_data(&mut downstream, chunk, false).await?;
        }
        upstream_body
            .flow_control()
            .release_capacity(len)
            .context("failed to release upstream h2 response capacity")?;
    }

    if let Some(trailers) = upstream_body
        .trailers()
        .await
        .context("failed to read upstream h2 response trailers")?
    {
        downstream
            .send_trailers(filter_h2_header_map(trailers))
            .context("failed to send downstream h2 response trailers")?;
    } else {
        send_data(&mut downstream, Bytes::new(), true).await?;
    }

    Ok(())
}

fn sanitize_h2_response_head<B>(response: Response<B>) -> Result<Response<()>> {
    let (parts, _) = response.into_parts();
    let mut builder = Response::builder().status(parts.status);
    for (name, value) in &parts.headers {
        if should_strip_h2_upstream_header(name.as_str()) {
            continue;
        }
        builder = builder.header(name, value);
    }
    builder
        .body(())
        .context("failed to build sanitized h2 response head")
}

fn filter_h2_header_map(headers: HeaderMap) -> HeaderMap {
    let mut filtered = HeaderMap::new();
    let mut last_name = None;
    for (name, value) in headers {
        if let Some(name) = name {
            last_name = Some(name.clone());
            if should_strip_h2_upstream_header(name.as_str()) {
                continue;
            }
            filtered.append(name, value);
        } else if let Some(name) = &last_name {
            if should_strip_h2_upstream_header(name.as_str()) {
                continue;
            }
            filtered.append(name.clone(), value);
        }
    }
    filtered
}

fn h2_request_target(uri: &http::Uri) -> String {
    uri.path_and_query()
        .map(|value| value.as_str().to_string())
        .unwrap_or_else(|| "/".to_string())
}

fn h2_request_authority(uri: &http::Uri, headers: &HeaderMap) -> Result<String> {
    if let Some(authority) = uri.authority() {
        return Ok(authority.as_str().to_string());
    }

    let Some(host) = headers.get(HOST) else {
        return Err(anyhow!("h2 request missing :authority"));
    };
    let host = host
        .to_str()
        .context("h2 host header is not visible ASCII")?;
    Ok(host.to_string())
}

fn validate_h2_request_headers(headers: &HeaderMap, body_is_end_stream: bool) -> Result<()> {
    let mut content_length_count = 0;
    let mut content_length = None;
    for value in headers.get_all(CONTENT_LENGTH).iter() {
        content_length_count += 1;
        if content_length_count > 1 {
            return Err(anyhow!("duplicate content-length in h2 request"));
        }
        let value = value
            .to_str()
            .context("content-length request header is not visible ASCII")?;
        let parsed = value
            .trim()
            .parse::<u64>()
            .context("invalid content-length request header")?;
        content_length = Some(parsed);
    }
    if body_is_end_stream && content_length.is_some_and(|value| value != 0) {
        return Err(anyhow!("nonzero content-length with end-stream h2 request"));
    }

    validate_h2_te_headers(headers)?;

    Ok(())
}

fn validate_h2_te_headers(headers: &HeaderMap) -> Result<()> {
    for value in headers.get_all(TE).iter() {
        let value = value.to_str().context("te request header is not utf8")?;
        for token in value.split(',') {
            let token = token.trim();
            if token.is_empty() || !token.eq_ignore_ascii_case("trailers") {
                return Err(anyhow!("unsupported h2 te request header"));
            }
        }
    }

    Ok(())
}

fn header_map_to_parts(headers: &HeaderMap) -> Vec<HeaderPart> {
    headers
        .iter()
        .map(|(name, value)| HeaderPart {
            name: name.as_str().to_string(),
            value: value.as_bytes().to_vec(),
        })
        .collect()
}

fn fold_request_cookies(headers: Vec<HeaderPart>) -> Vec<HeaderPart> {
    let mut folded: Vec<HeaderPart> = Vec::with_capacity(headers.len());
    let mut cookie_index = None;

    for header in headers {
        if header.name.eq_ignore_ascii_case(COOKIE.as_str()) {
            match cookie_index {
                Some(index) => {
                    let existing: &mut HeaderPart = &mut folded[index];
                    existing.value.extend_from_slice(b"; ");
                    existing.value.extend_from_slice(&header.value);
                }
                None => {
                    cookie_index = Some(folded.len());
                    folded.push(header);
                }
            }
        } else {
            folded.push(header);
        }
    }

    folded
}

fn build_h1_request_head(
    method: &str,
    target: &str,
    authority: &str,
    headers: &[HeaderPart],
    body_is_end_stream: bool,
) -> std::result::Result<(Vec<u8>, bool), H2RequestDeny> {
    // Force chunked framing whenever there is a request body stream. We do
    // not know up front whether the h2 client will follow DATA with
    // unsupported trailers, and content-length framing would force us to
    // either pre-buffer the whole upload (memory blowup) or commit the body
    // to the upstream before we can observe trailers. Chunked lets us
    // withhold the h1 terminator if a late deny fires.
    let use_chunked = !body_is_end_stream;
    let mut header_bytes = Vec::new();
    append_h1_head_bytes(
        &mut header_bytes,
        format!("{method} {target} HTTP/1.1\r\n").as_bytes(),
    )?;
    append_h1_header_line(&mut header_bytes, b"Host", authority.as_bytes())?;
    let has_te_trailers = headers
        .iter()
        .any(|header| header.name.eq_ignore_ascii_case(TE.as_str()));
    let connection = if has_te_trailers {
        b"close, te".as_slice()
    } else {
        b"close".as_slice()
    };
    append_h1_header_line(&mut header_bytes, b"Connection", connection)?;
    if use_chunked {
        append_h1_header_line(&mut header_bytes, b"Transfer-Encoding", b"chunked")?;
    }

    for header in headers {
        if header.name.eq_ignore_ascii_case(TE.as_str()) {
            append_h1_header_line(&mut header_bytes, header.name.as_bytes(), &header.value)?;
            continue;
        }
        if should_strip_h1_bridge_header(&header.name)
            || (use_chunked && header.name.eq_ignore_ascii_case(CONTENT_LENGTH.as_str()))
        {
            continue;
        }
        append_h1_header_line(&mut header_bytes, header.name.as_bytes(), &header.value)?;
    }
    append_h1_head_bytes(&mut header_bytes, b"\r\n")?;

    Ok((header_bytes, use_chunked))
}

fn append_h1_head_bytes(
    header_bytes: &mut Vec<u8>,
    bytes: &[u8],
) -> std::result::Result<(), H2RequestDeny> {
    if header_bytes.len() + bytes.len() > MAX_HEADER_BLOCK_BYTES {
        return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
    }
    header_bytes.extend_from_slice(bytes);
    Ok(())
}

fn append_h1_header_line(
    header_bytes: &mut Vec<u8>,
    name: &[u8],
    value: &[u8],
) -> std::result::Result<(), H2RequestDeny> {
    let line_len = name.len() + b": ".len() + value.len() + b"\r\n".len();
    if line_len > MAX_HEADER_LINE_BYTES {
        return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
    }
    if header_bytes.len() + line_len > MAX_HEADER_BLOCK_BYTES {
        return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
    }
    header_bytes.extend_from_slice(name);
    header_bytes.extend_from_slice(b": ");
    header_bytes.extend_from_slice(value);
    header_bytes.extend_from_slice(b"\r\n");
    Ok(())
}

async fn write_h1_request<W>(
    mut upstream: W,
    header_bytes: Vec<u8>,
    use_chunked: bool,
    mut body: RecvStream,
) -> WriteH1RequestResult<()>
where
    W: AsyncWrite + Unpin,
{
    upstream
        .write_all(&header_bytes)
        .await
        .context("failed to write h1 request headers")
        .map_err(WriteH1RequestError::Bridge)?;
    upstream
        .flush()
        .await
        .context("failed to flush h1 request headers")
        .map_err(WriteH1RequestError::Bridge)?;

    while let Some(chunk) = body.data().await {
        let chunk = chunk
            .context("failed to read h2 request body chunk")
            .map_err(WriteH1RequestError::Bridge)?;
        if chunk.is_empty() {
            body.flow_control()
                .release_capacity(chunk.len())
                .context("failed to release h2 request flow-control capacity")
                .map_err(WriteH1RequestError::Bridge)?;
            continue;
        }
        if use_chunked {
            upstream
                .write_all(format!("{:x}\r\n", chunk.len()).as_bytes())
                .await
                .context("failed to write h1 request chunk header")
                .map_err(WriteH1RequestError::Bridge)?;
            upstream
                .write_all(&chunk)
                .await
                .context("failed to write h1 request chunk body")
                .map_err(WriteH1RequestError::Bridge)?;
            upstream
                .write_all(b"\r\n")
                .await
                .context("failed to write h1 request chunk terminator")
                .map_err(WriteH1RequestError::Bridge)?;
        } else {
            upstream
                .write_all(&chunk)
                .await
                .context("failed to write h1 request body chunk")
                .map_err(WriteH1RequestError::Bridge)?;
        }
        upstream
            .flush()
            .await
            .context("failed to flush h1 request body chunk")
            .map_err(WriteH1RequestError::Bridge)?;
        body.flow_control()
            .release_capacity(chunk.len())
            .context("failed to release h2 request flow-control capacity")
            .map_err(WriteH1RequestError::Bridge)?;
    }

    if let Some(trailers) = body
        .trailers()
        .await
        .context("failed to read h2 trailers")
        .map_err(WriteH1RequestError::Bridge)?
    {
        if !trailers.is_empty() {
            return Err(WriteH1RequestError::Denied(H2RequestDeny::internal(
                DenyReason::RequestTrailersUnsupported,
            )));
        }
        if use_chunked {
            upstream
                .write_all(b"0\r\n\r\n")
                .await
                .context("failed to terminate h1 chunked request body")
                .map_err(WriteH1RequestError::Bridge)?;
        }
    } else if use_chunked {
        upstream
            .write_all(b"0\r\n\r\n")
            .await
            .context("failed to terminate h1 chunked request body")
            .map_err(WriteH1RequestError::Bridge)?;
    }

    upstream
        .flush()
        .await
        .context("failed to flush h1 request")
        .map_err(WriteH1RequestError::Bridge)?;
    Ok(())
}

fn should_strip_h1_bridge_header(name: &str) -> bool {
    is_common_bridge_stripped_header(name) || name.eq_ignore_ascii_case("te")
}

fn connection_nominated_headers(headers: &[HeaderPart]) -> Result<HashSet<String>> {
    let mut nominated = HashSet::new();
    for header in headers {
        if !header.name.eq_ignore_ascii_case("connection") {
            continue;
        }
        let value =
            std::str::from_utf8(&header.value).context("connection response header is not utf8")?;
        for token in value.split(',') {
            let token = token.trim();
            if !token.is_empty() {
                nominated.insert(token.to_ascii_lowercase());
            }
        }
    }
    Ok(nominated)
}

async fn forward_h1_response_to_h2<R>(
    upstream: &mut R,
    respond: &mut SendResponse<Bytes>,
    request_method: &str,
) -> Result<()>
where
    R: AsyncRead + Unpin,
{
    let mut reader = H1ResponseReader::new(upstream);
    let response_head = loop {
        let response_head = reader
            .read_response_head()
            .await
            .context("failed to read h1 response head")?;
        if !response_head.status.is_informational() {
            break response_head;
        }
        let response = build_h2_response_head(&response_head)?;
        respond
            .send_informational(response)
            .context("failed to send h2 informational response head")?;
    };
    let no_body = response_has_no_body(request_method, response_head.status);
    let response = build_h2_response_head(&response_head)?;

    if no_body || response_head.body_kind == H1BodyKind::None {
        respond
            .send_response(response, true)
            .context("failed to send h2 response head")?;
        return Ok(());
    }

    let mut send = respond
        .send_response(response, false)
        .context("failed to send h2 response head")?;
    match response_head.body_kind {
        H1BodyKind::None => {}
        H1BodyKind::ContentLength(len) => {
            reader
                .forward_content_length_body(len, &mut send)
                .await
                .context("failed to forward h1 content-length body")?;
        }
        H1BodyKind::Chunked => {
            reader
                .forward_chunked_body(&mut send)
                .await
                .context("failed to forward h1 chunked body")?;
        }
        H1BodyKind::EofDelimited => {
            reader
                .forward_eof_body(&mut send)
                .await
                .context("failed to forward h1 EOF-delimited body")?;
        }
    }

    Ok(())
}

fn build_h2_response_head(response_head: &H1ResponseHead) -> Result<Response<()>> {
    let mut response = Response::builder().status(response_head.status);
    let nominated_hop_headers = connection_nominated_headers(&response_head.headers)?;
    for header in &response_head.headers {
        if should_strip_h1_bridge_header(header.name.as_str()) {
            continue;
        }
        if nominated_hop_headers.contains(&header.name.to_ascii_lowercase()) {
            continue;
        }
        let name = HeaderName::from_bytes(header.name.as_bytes())
            .context("invalid h1 response header name")?;
        let value =
            HeaderValue::from_bytes(&header.value).context("invalid h1 response header value")?;
        response = response.header(name, value);
    }
    let response = response
        .body(())
        .context("failed to build h2 response head")?;
    Ok(response)
}

fn response_has_no_body(request_method: &str, status: StatusCode) -> bool {
    request_method.eq_ignore_ascii_case("HEAD")
        || status.is_informational()
        || status == StatusCode::NO_CONTENT
        || status == StatusCode::NOT_MODIFIED
}

struct H1ResponseHead {
    status: StatusCode,
    headers: Vec<HeaderPart>,
    body_kind: H1BodyKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum H1BodyKind {
    None,
    ContentLength(usize),
    Chunked,
    EofDelimited,
}

struct H1ResponseReader<'a, R> {
    inner: &'a mut R,
    buffer: Vec<u8>,
}

impl<'a, R> H1ResponseReader<'a, R>
where
    R: AsyncRead + Unpin,
{
    fn new(inner: &'a mut R) -> Self {
        Self {
            inner,
            buffer: Vec::new(),
        }
    }

    async fn read_response_head(&mut self) -> Result<H1ResponseHead> {
        let header_len = self.read_header_block().await?;
        let mut headers = [httparse::EMPTY_HEADER; 256];
        let mut response = httparse::Response::new(&mut headers);
        let status = response
            .parse(&self.buffer[..header_len])
            .context("failed to parse h1 response head")?;
        if !status.is_complete() {
            return Err(anyhow!("incomplete h1 response head"));
        }
        let code = response
            .code
            .ok_or_else(|| anyhow!("h1 response missing status code"))?;
        let status = StatusCode::from_u16(code).context("invalid h1 response status")?;
        let headers = response
            .headers
            .iter()
            .map(|header| HeaderPart {
                name: header.name.to_string(),
                value: header.value.to_vec(),
            })
            .collect::<Vec<_>>();
        let body_kind = response_body_kind(&headers)?;
        self.buffer.drain(..header_len);
        Ok(H1ResponseHead {
            status,
            headers,
            body_kind,
        })
    }

    async fn read_header_block(&mut self) -> Result<usize> {
        loop {
            if let Some(header_end) = find_subslice(&self.buffer, b"\r\n\r\n") {
                let header_len = header_end + 4;
                if header_len > MAX_HEADER_BLOCK_BYTES {
                    return Err(anyhow!("h1 response header block exceeded limit"));
                }
                return Ok(header_len);
            }
            if self.buffer.len() >= MAX_HEADER_BLOCK_BYTES {
                return Err(anyhow!("h1 response header block exceeded limit"));
            }
            let mut chunk = [0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .context("failed to read h1 response")?;
            if bytes_read == 0 {
                return Err(anyhow!("upstream closed before h1 response head"));
            }
            self.buffer.extend_from_slice(&chunk[..bytes_read]);
        }
    }

    async fn read_line(&mut self) -> Result<Vec<u8>> {
        loop {
            if let Some(line_end) = find_subslice(&self.buffer, b"\r\n") {
                let line_len = line_end + 2;
                if line_len > MAX_HEADER_LINE_BYTES {
                    return Err(anyhow!("h1 line exceeded limit"));
                }
                let line = self.buffer[..line_len].to_vec();
                self.buffer.drain(..line_len);
                return Ok(line);
            }
            if self.buffer.len() > MAX_HEADER_LINE_BYTES {
                return Err(anyhow!("h1 line exceeded limit"));
            }
            let mut chunk = [0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .context("failed to read h1 line")?;
            if bytes_read == 0 {
                return Err(anyhow!("upstream closed before line terminator"));
            }
            self.buffer.extend_from_slice(&chunk[..bytes_read]);
        }
    }

    async fn read_exact_bytes(&mut self, len: usize) -> Result<Bytes> {
        while self.buffer.len() < len {
            let mut chunk = [0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .context("failed to read h1 body")?;
            if bytes_read == 0 {
                return Err(anyhow!("upstream closed mid-body"));
            }
            self.buffer.extend_from_slice(&chunk[..bytes_read]);
        }
        let bytes = Bytes::copy_from_slice(&self.buffer[..len]);
        self.buffer.drain(..len);
        Ok(bytes)
    }

    async fn forward_content_length_body(
        &mut self,
        len: usize,
        send: &mut SendStream<Bytes>,
    ) -> Result<()> {
        let mut remaining = len;
        if remaining == 0 {
            send_data(send, Bytes::new(), true).await?;
            return Ok(());
        }

        while remaining > 0 {
            let chunk_len = remaining.min(READ_CHUNK_BYTES);
            let chunk = self.read_exact_bytes(chunk_len).await?;
            remaining -= chunk.len();
            send_data(send, chunk, remaining == 0).await?;
        }
        Ok(())
    }

    async fn forward_chunked_body(&mut self, send: &mut SendStream<Bytes>) -> Result<()> {
        loop {
            let line = self.read_line().await?;
            let chunk_size = parse_chunk_size(&line)?;
            if chunk_size > MAX_H1_RESPONSE_CHUNK_BYTES {
                return Err(anyhow!(
                    "h1 response chunk exceeded {} byte limit",
                    MAX_H1_RESPONSE_CHUNK_BYTES
                ));
            }
            if chunk_size == 0 {
                let trailers = self.read_trailers().await?;
                if trailers.is_empty() {
                    send_data(send, Bytes::new(), true).await?;
                } else {
                    send.send_trailers(trailers)
                        .context("failed to send h2 response trailers")?;
                }
                return Ok(());
            }
            let mut remaining = chunk_size;
            while remaining > 0 {
                let slice_len = remaining.min(READ_CHUNK_BYTES);
                let chunk = self.read_exact_bytes(slice_len).await?;
                remaining -= chunk.len();
                send_data(send, chunk, false).await?;
            }
            let crlf = self.read_exact_bytes(2).await?;
            if crlf.as_ref() != b"\r\n" {
                return Err(anyhow!("h1 chunk missing CRLF"));
            }
        }
    }

    async fn read_trailers(&mut self) -> Result<HeaderMap> {
        let mut trailer_bytes = Vec::new();
        loop {
            let line = self.read_line().await?;
            trailer_bytes.extend_from_slice(&line);
            if trailer_bytes.len() > MAX_TRAILER_BLOCK_BYTES {
                return Err(anyhow!("h1 trailer block exceeded limit"));
            }
            if line == b"\r\n" {
                break;
            }
        }

        let mut map = HeaderMap::new();
        if trailer_bytes == b"\r\n" {
            return Ok(map);
        }
        let mut headers = [httparse::EMPTY_HEADER; 64];
        let mut request = httparse::Request::new(&mut headers);
        let mut synthetic = b"GET / HTTP/1.1\r\n".to_vec();
        synthetic.extend_from_slice(&trailer_bytes);
        request
            .parse(&synthetic)
            .context("failed to parse h1 trailers")?;
        for header in request.headers.iter() {
            if should_strip_h1_bridge_header(header.name) {
                continue;
            }
            let name = HeaderName::from_bytes(header.name.as_bytes())
                .context("invalid h1 trailer name")?;
            let value =
                HeaderValue::from_bytes(header.value).context("invalid h1 trailer value")?;
            map.append(name, value);
        }
        Ok(map)
    }

    async fn forward_eof_body(&mut self, send: &mut SendStream<Bytes>) -> Result<()> {
        if !self.buffer.is_empty() {
            let bytes = Bytes::copy_from_slice(&self.buffer);
            self.buffer.clear();
            send_data(send, bytes, false).await?;
        }

        loop {
            let mut chunk = vec![0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .context("failed to read EOF-delimited h1 body")?;
            if bytes_read == 0 {
                send_data(send, Bytes::new(), true).await?;
                return Ok(());
            }
            chunk.truncate(bytes_read);
            send_data(send, Bytes::from(chunk), false).await?;
        }
    }
}

fn response_body_kind(headers: &[HeaderPart]) -> Result<H1BodyKind> {
    let mut content_length = None;
    let mut seen_content_length = false;
    let mut seen_transfer_encoding = false;
    let mut has_chunked_transfer_encoding = false;

    for header in headers {
        if header.name.eq_ignore_ascii_case(CONTENT_LENGTH.as_str()) {
            if seen_content_length {
                return Err(anyhow!("duplicate content-length in h1 response"));
            }
            seen_content_length = true;
            let value = std::str::from_utf8(&header.value)
                .context("content-length response header is not utf8")?;
            content_length = Some(
                value
                    .trim()
                    .parse::<usize>()
                    .context("invalid content-length response header")?,
            );
        } else if header.name.eq_ignore_ascii_case(TRANSFER_ENCODING.as_str()) {
            if seen_transfer_encoding {
                return Err(anyhow!("multiple h1 response transfer-encoding headers"));
            }
            seen_transfer_encoding = true;
            let value = std::str::from_utf8(&header.value)
                .context("transfer-encoding response header is not utf8")?;
            let mut tokens = value
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty());
            match (tokens.next(), tokens.next()) {
                (Some(token), None) if token.eq_ignore_ascii_case("chunked") => {
                    has_chunked_transfer_encoding = true;
                }
                _ => return Err(anyhow!("unsupported h1 response transfer-encoding")),
            }
        }
    }

    if has_chunked_transfer_encoding {
        if seen_content_length {
            return Err(anyhow!(
                "ambiguous h1 response framing: transfer-encoding and content-length"
            ));
        }
        return Ok(H1BodyKind::Chunked);
    }

    Ok(content_length.map_or(H1BodyKind::EofDelimited, H1BodyKind::ContentLength))
}

async fn send_data(send: &mut SendStream<Bytes>, data: Bytes, end_stream: bool) -> Result<()> {
    if data.is_empty() {
        send.send_data(data, end_stream)
            .context("failed to send h2 data")?;
        return Ok(());
    }

    let mut offset = 0;
    while offset < data.len() {
        while send.capacity() == 0 {
            let remaining = data.len() - offset;
            send.reserve_capacity(remaining.min(READ_CHUNK_BYTES));
            let capacity = poll_fn(|cx| send.poll_capacity(cx))
                .await
                .ok_or_else(|| anyhow!("h2 send stream closed while waiting for capacity"))?
                .context("h2 send capacity failed")?;
            if capacity == 0 {
                continue;
            }
        }

        let chunk_len = send.capacity().min(data.len() - offset);
        let chunk = data.slice(offset..offset + chunk_len);
        offset += chunk_len;
        send.send_data(chunk, end_stream && offset == data.len())
            .context("failed to send h2 data")?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use anyhow::{ensure, Result};
    use base64::{engine::general_purpose, Engine as _};
    use tokio::sync::mpsc;

    use crate::egress_secrets::{DomainSet, Secret};

    use super::*;

    #[test]
    fn rejects_duplicate_h2_content_length_request_headers() {
        let mut headers = HeaderMap::new();
        headers.append(CONTENT_LENGTH, HeaderValue::from_static("5"));
        headers.append(CONTENT_LENGTH, HeaderValue::from_static("5"));

        let error = validate_h2_request_headers(&headers, false)
            .expect_err("duplicate h2 content-length should be rejected");
        assert!(error.to_string().contains("duplicate content-length"));
    }

    #[test]
    fn rejects_invalid_h2_content_length_request_header() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("5, 5"));

        let error = validate_h2_request_headers(&headers, false)
            .expect_err("invalid h2 content-length should be rejected");
        assert!(error.to_string().contains("invalid content-length"));
    }

    #[test]
    fn rejects_nonzero_h2_content_length_with_end_stream_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("5"));

        let error = validate_h2_request_headers(&headers, true)
            .expect_err("nonzero end-stream h2 content-length should be rejected");
        assert!(error.to_string().contains("nonzero content-length"));
    }

    #[test]
    fn rejects_non_trailers_h2_te_request_header() {
        let mut headers = HeaderMap::new();
        headers.insert(TE, HeaderValue::from_static("gzip"));

        let error = validate_h2_request_headers(&headers, false)
            .expect_err("non-trailers h2 te header should be rejected");
        assert!(error.to_string().contains("unsupported h2 te"));
    }

    #[test]
    fn filter_h2_header_map_preserves_repeated_values() {
        let mut headers = HeaderMap::new();
        headers.append("x-foo", HeaderValue::from_static("a"));
        headers.append("x-foo", HeaderValue::from_static("b"));

        let filtered = filter_h2_header_map(headers);
        let values = filtered
            .get_all("x-foo")
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>();

        assert_eq!(values, vec![b"a".to_vec(), b"b".to_vec()]);
    }

    #[test]
    fn rejects_non_plain_chunked_h1_response_transfer_encoding() {
        let headers = vec![HeaderPart {
            name: "transfer-encoding".to_string(),
            value: b"gzip, chunked".to_vec(),
        }];

        let error = response_body_kind(&headers)
            .expect_err("non-plain chunked transfer-encoding should be rejected");
        assert!(error
            .to_string()
            .contains("unsupported h1 response transfer-encoding"));
    }

    #[test]
    fn rejects_ambiguous_chunked_and_content_length_h1_response() {
        let headers = vec![
            HeaderPart {
                name: "transfer-encoding".to_string(),
                value: b"chunked".to_vec(),
            },
            HeaderPart {
                name: "content-length".to_string(),
                value: b"999".to_vec(),
            },
        ];

        let error = response_body_kind(&headers)
            .expect_err("TE plus content-length response should be rejected");
        assert!(error.to_string().contains("ambiguous h1 response framing"));
    }

    #[tokio::test]
    async fn h2_bridge_substitutes_header_and_maps_h1_response() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_0123456789abcdef0123456789abcdef__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/v1/models"))
            .header("authorization", format!("Bearer {placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("GET /v1/models HTTP/1.1\r\n"));
        assert!(request_text.contains("Host: api.openai.com\r\n"));
        assert!(request_text.contains("authorization: Bearer sk-real\r\n"));
        assert!(!request_text.contains(placeholder));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_preserves_basic_auth_round_trip() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_aabbccddeeff00112233445566778899__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 204 No Content\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let encoded = general_purpose::STANDARD.encode(format!("user:{placeholder}"));
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/"))
            .header("authorization", format!("Basic {encoded}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        let expected = general_purpose::STANDARD.encode("user:sk-real");
        assert!(request_text.contains(&format!("authorization: Basic {expected}\r\n")));
        assert!(!request_text.contains(placeholder));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_folds_split_cookie_headers_into_single_h1_cookie() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_41414141414141416161616161616161__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/cookies"))
            .header("cookie", "a=1")
            .header("cookie", "b=2")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert_eq!(h1_header_values(&request_text, "cookie"), vec!["a=1; b=2"]);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_folds_split_cookie_headers_after_dsec_substitution() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_42424242424242426262626262626262__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "cookie-secret",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/cookies"))
            .header("cookie", "a=1")
            .header("cookie", format!("session={placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert_eq!(
            h1_header_values(&request_text, "cookie"),
            vec!["a=1; session=cookie-secret"]
        );
        assert!(!request_text.contains(placeholder));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_passes_through_single_cookie_header() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_43434343434343436363636363636363__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/cookies"))
            .header("cookie", "a=1")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert_eq!(h1_header_values(&request_text, "cookie"), vec!["a=1"]);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_forces_chunked_on_streaming_request_with_content_length() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_0123456789abcdef0123456789abcdef__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/upload"))
            .header("content-length", "5")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("POST /upload HTTP/1.1\r\n"));
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(!request_text
            .to_ascii_lowercase()
            .contains("content-length:"));
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n0\r\n\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_end_stream_with_content_length_keeps_content_length() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_32323232323232325454545454545454__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/empty-upload"))
            .header("content-length", "0")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("POST /empty-upload HTTP/1.1\r\n"));
        assert!(request_text.contains("content-length: 0\r\n"));
        assert!(!request_text.contains("Transfer-Encoding: chunked\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_ignores_empty_data_frames_inside_chunked_request() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_21212121212121214343434343434343__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/chunked"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"he"), false)?;
        stream.send_data(Bytes::new(), false)?;
        stream.send_data(Bytes::from_static(b"llo"), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(request_text.ends_with("\r\n\r\n2\r\nhe\r\n3\r\nllo\r\n0\r\n\r\n"));
        assert!(!request_text.contains("0\r\n\r\n3\r\nllo"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_writes_single_terminator_for_empty_chunked_request_body() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_23232323232323234545454545454545__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/empty"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::new(), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(request_text.ends_with("\r\n\r\n0\r\n\r\n"));
        assert_eq!(request_text.matches("0\r\n\r\n").count(), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_maps_chunked_response_and_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_0123456789abcdef0123456789abcdef__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n0\r\nx-done: yes\r\n\r\n",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/stream"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().get(TRANSFER_ENCODING).is_none());
        assert!(response.headers().get(CONTENT_LENGTH).is_none());
        let mut body = response.into_body();
        let mut output = Vec::new();
        while let Some(chunk) = body.data().await {
            let chunk = chunk?;
            output.extend_from_slice(&chunk);
            body.flow_control().release_capacity(chunk.len())?;
        }
        assert_eq!(output, b"ok");
        let trailers = body
            .trailers()
            .await?
            .ok_or_else(|| anyhow!("missing h2 trailers"))?;
        assert_eq!(
            trailers.get("x-done"),
            Some(&HeaderValue::from_static("yes"))
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_streams_large_h1_chunk_before_full_chunk_arrives() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_24242424242424244646464646464646__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let (first_write_tx, mut first_write_rx) = mpsc::unbounded_channel();
        let continue_response = Arc::new(tokio::sync::Notify::new());
        let first_part = vec![b'a'; READ_CHUNK_BYTES];
        let second_part = vec![b'b'; 1024];
        let total_len = first_part.len() + second_part.len();
        let opener = test_h1_opener_with_split_chunked_response(
            request_tx,
            first_write_tx,
            Arc::clone(&continue_response),
            first_part,
            second_part,
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/stream-large"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        first_write_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not write first chunk part"))?;
        let mut body = response.into_body();
        let first_chunk = tokio::time::timeout(std::time::Duration::from_secs(1), body.data())
            .await
            .context("bridge did not emit partial chunk before the full h1 chunk arrived")?
            .ok_or_else(|| anyhow!("h2 body ended before first chunk"))??;
        assert_eq!(first_chunk.len(), READ_CHUNK_BYTES);
        body.flow_control().release_capacity(first_chunk.len())?;

        continue_response.notify_waiters();
        let mut received = first_chunk.len();
        while let Some(chunk) = body.data().await {
            let chunk = chunk?;
            received += chunk.len();
            body.flow_control().release_capacity(chunk.len())?;
        }
        ensure!(body.trailers().await?.is_none(), "unexpected trailers");
        assert_eq!(received, total_len);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_resets_chunked_response_over_single_chunk_cap() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_25252525252525254747474747474747__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let response = format!(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n",
            MAX_H1_RESPONSE_CHUNK_BYTES + 1
        );
        let opener = test_h1_opener(request_tx, response.as_bytes());

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/too-large"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        match response.await {
            Ok(response) => {
                assert_eq!(response.status(), StatusCode::OK);
                let body_result = read_h2_body(response.into_body()).await;
                assert!(
                    body_result.is_err(),
                    "oversized h1 chunk should reset the response body"
                );
            }
            Err(_error) => {}
        }

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_resets_ambiguous_chunked_content_length_response() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_10101010101010102020202020202020__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 5\r\n\r\n2\r\nok\r\n0\r\n\r\n",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/ambiguous"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            "ambiguous TE/content-length response should reset the stream"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_strips_connection_nominated_response_headers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_12121212121212123434343434343434__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: keep-alive, x-foo, x-bar\r\nx-foo: leak\r\nx-bar: leak\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/headers"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;

        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().get("connection").is_none());
        assert!(response.headers().get("x-foo").is_none());
        assert!(response.headers().get("x-bar").is_none());
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_rewritten_header_block_over_limit() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_26262626262626264848484848484848__";
        let secret_value = "x".repeat(8 * 1024);
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            &secret_value,
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let mut builder = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/headers"));
        for index in 0..9 {
            builder = builder.header(format!("x-secret-{index}"), placeholder);
        }
        let request = builder.body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            "rewritten header block over 64 KiB should reset"
        );

        let deny_log_text = read_test_file_eventually(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"header_size_exceeded\""),
            "deny log should record header_size_exceeded, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_rewritten_header_line_over_limit() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_27272727272727274949494949494949__";
        let secret_value = "x".repeat(MAX_HEADER_LINE_BYTES);
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            &secret_value,
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/line"))
            .header("authorization", format!("Bearer {placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            "rewritten header line over 16 KiB should reset"
        );

        let deny_log_text = read_test_file_eventually(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"header_size_exceeded\""),
            "deny log should record header_size_exceeded, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_forwards_expect_continue_and_100_response() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_28282828282828285050505050505050__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_expect_continue(request_tx);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/expect"))
            .header("expect", "100-continue")
            .body(())?;
        let (mut response, mut stream) = send_request.send_request(request, false)?;
        let informational = next_informational(&mut response).await?;
        assert_eq!(informational.status(), StatusCode::CONTINUE);
        assert_eq!(
            informational.headers().get("x-info"),
            Some(&HeaderValue::from_static("yes"))
        );
        stream.send_data(Bytes::from_static(b"hello"), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("expect: 100-continue\r\n"));
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n0\r\n\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_returns_early_final_response_while_client_uploads() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_29292929292929295151515151515151__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_early_final_response(request_tx);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/early"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        let response = tokio::time::timeout(std::time::Duration::from_secs(1), response)
            .await
            .context("bridge did not forward early final h1 response")??;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"early");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("POST /early HTTP/1.1\r\n"));
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_preserves_te_trailers_and_maps_h1_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_56565656565656567878787878787878__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n0\r\nx-done: yes\r\n\r\n",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/trailers"))
            .header("te", "trailers")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let mut body = response.into_body();
        let mut output = Vec::new();
        while let Some(chunk) = body.data().await {
            let chunk = chunk?;
            output.extend_from_slice(&chunk);
            body.flow_control().release_capacity(chunk.len())?;
        }
        assert_eq!(output, b"ok");
        let trailers = body
            .trailers()
            .await?
            .ok_or_else(|| anyhow!("missing h2 trailers"))?;
        assert_eq!(
            trailers.get("x-done"),
            Some(&HeaderValue::from_static("yes"))
        );

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert_eq!(h1_header_values(&request_text, "te"), vec!["trailers"]);
        assert_eq!(
            h1_header_values(&request_text, "connection"),
            vec!["close, te"]
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_streams_request_and_response_data_bidirectionally() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_57575757575757577979797979797979__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_bidirectional_stream(request_tx);

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/duplex"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"one"), false)?;
        let response = tokio::time::timeout(std::time::Duration::from_secs(1), response)
            .await
            .context("bridge did not forward response head after first upload chunk")??;
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();
        let first = tokio::time::timeout(std::time::Duration::from_secs(1), body.data())
            .await
            .context("bridge did not forward response data before upload ended")?
            .ok_or_else(|| anyhow!("h2 response ended before first data"))??;
        assert_eq!(first, Bytes::from_static(b"ack-one"));
        body.flow_control().release_capacity(first.len())?;

        stream.send_data(Bytes::from_static(b"two"), true)?;
        let second = tokio::time::timeout(std::time::Duration::from_secs(1), body.data())
            .await
            .context("bridge did not forward second response data after second upload chunk")?
            .ok_or_else(|| anyhow!("h2 response ended before second data"))??;
        assert_eq!(second, Bytes::from_static(b"ack-two"));
        body.flow_control().release_capacity(second.len())?;
        loop {
            let end = tokio::time::timeout(std::time::Duration::from_secs(1), body.data())
                .await
                .context("h2 response did not end after second response data")?;
            match end {
                Some(Ok(chunk)) if chunk.is_empty() => {}
                Some(Ok(chunk)) => {
                    return Err(anyhow!("unexpected extra response data: {chunk:?}"))
                }
                Some(Err(error)) => return Err(error.into()),
                None => break,
            }
        }
        ensure!(body.trailers().await?.is_none(), "unexpected trailers");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.ends_with("\r\n\r\n3\r\none\r\n3\r\ntwo\r\n0\r\n\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_reuses_one_connection_for_two_inbound_streams() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_58585858585858587a7a7a7a7a7a7a7a__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (path_tx, mut path_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, respond| {
            let path_tx = path_tx.clone();
            Box::pin(async move {
                path_tx
                    .send(request.uri().path().to_string())
                    .map_err(|_| anyhow!("failed to send upstream path"))?;
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });

        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        for path in ["/one", "/two"] {
            let request = Request::builder()
                .method("GET")
                .uri(format!("https://{sni}{path}"))
                .body(())?;
            let (response, _stream) = send_request.send_request(request, true)?;
            let response = response.await?;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(read_h2_body(response.into_body()).await?, b"ok");
        }

        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);
        assert_eq!(
            path_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing path"))?,
            "/one"
        );
        assert_eq!(
            path_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing path"))?,
            "/two"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn evicts_idle_pool_entry_and_closes_upstream_session() -> Result<()> {
        tokio::time::pause();
        let (pool, key, mut closed_rx) = test_h2_pool_with_close_observer(|_request, respond| {
            Box::pin(async move {
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });
        tokio::task::yield_now().await;

        send_direct_pooled_h2_get(&pool, &key, "/first").await?;
        tokio::time::advance(H2_UPSTREAM_IDLE_TIMEOUT + std::time::Duration::from_millis(1)).await;

        let replacement_lease = match pool.lease(&key).await? {
            UpstreamLease::H2(lease) => lease,
            UpstreamLease::Http1(_) => return Err(anyhow!("expected h2 replacement lease")),
        };
        assert_upstream_connection_closed(&mut closed_rx).await?;

        drop(replacement_lease);
        drop(pool);
        Ok(())
    }

    #[tokio::test]
    async fn background_sweeper_evicts_without_new_leases() -> Result<()> {
        tokio::time::pause();
        let (pool, key, mut closed_rx) = test_h2_pool_with_close_observer(|_request, respond| {
            Box::pin(async move {
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });
        tokio::task::yield_now().await;

        send_direct_pooled_h2_get(&pool, &key, "/first").await?;
        tokio::time::advance(
            H2_UPSTREAM_IDLE_TIMEOUT
                + H2_UPSTREAM_POOL_SWEEP_INTERVAL
                + std::time::Duration::from_millis(1),
        )
        .await;
        assert_upstream_connection_closed(&mut closed_rx).await?;

        drop(pool);
        Ok(())
    }

    #[tokio::test]
    async fn active_streams_block_eviction() -> Result<()> {
        tokio::time::pause();
        let (pool, key, mut closed_rx) =
            test_h2_pool_with_close_observer(|mut request, _respond| {
                Box::pin(async move {
                    while let Some(chunk) = request.body_mut().data().await {
                        let chunk = chunk?;
                        request
                            .body_mut()
                            .flow_control()
                            .release_capacity(chunk.len())?;
                    }
                    Ok(())
                })
            });
        tokio::task::yield_now().await;

        let lease = match pool.lease(&key).await? {
            UpstreamLease::H2(lease) => lease,
            UpstreamLease::Http1(_) => return Err(anyhow!("expected h2 lease")),
        };
        let mut send_request = lease.send_request();
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{}/active", key.authority()))
            .body(())?;
        let (_response, send_stream) = send_request.send_request(request, false)?;

        tokio::time::advance(
            H2_UPSTREAM_IDLE_TIMEOUT
                + H2_UPSTREAM_POOL_SWEEP_INTERVAL
                + std::time::Duration::from_millis(1),
        )
        .await;
        tokio::task::yield_now().await;
        assert_upstream_connection_still_open(&mut closed_rx)?;

        drop(send_stream);
        drop(send_request);
        drop(lease);
        drop(pool);
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_concurrent_first_streams_share_one_open() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_57575757575757577979797979797979__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (path_tx, mut path_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool_with_settings_and_open_delay(
            Arc::clone(&handshake_count),
            move |request, respond| {
                let path_tx = path_tx.clone();
                Box::pin(async move {
                    path_tx
                        .send(request.uri().path().to_string())
                        .map_err(|_| anyhow!("failed to send upstream path"))?;
                    send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
                })
            },
            None,
            Some(std::time::Duration::from_millis(50)),
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let first = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/one"))
            .body(())?;
        let second = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/two"))
            .body(())?;
        let (first_response, _first_stream) = send_request.send_request(first, true)?;
        let (second_response, _second_stream) = send_request.send_request(second, true)?;
        let (first_response, second_response) = tokio::join!(first_response, second_response);
        let first_response = first_response?;
        let second_response = second_response?;
        assert_eq!(first_response.status(), StatusCode::OK);
        assert_eq!(second_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(first_response.into_body()).await?, b"ok");
        assert_eq!(read_h2_body(second_response.into_body()).await?, b"ok");

        let mut paths = vec![
            path_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing first path"))?,
            path_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing second path"))?,
        ];
        paths.sort();
        assert_eq!(paths, vec!["/one".to_string(), "/two".to_string()]);
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_substitutes_headers_without_folding_cookies() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_59595959595959597b7b7b7b7b7b7b7b__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (headers_tx, mut headers_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, respond| {
            let headers_tx = headers_tx.clone();
            Box::pin(async move {
                let auth = request
                    .headers()
                    .get("authorization")
                    .ok_or_else(|| anyhow!("missing authorization header"))?
                    .as_bytes()
                    .to_vec();
                let cookies = request
                    .headers()
                    .get_all("cookie")
                    .iter()
                    .map(|value| value.as_bytes().to_vec())
                    .collect::<Vec<_>>();
                headers_tx
                    .send((auth, cookies))
                    .map_err(|_| anyhow!("failed to send upstream headers"))?;
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });

        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/headers"))
            .header("authorization", format!("Bearer {placeholder}"))
            .header("cookie", "a=1")
            .header("cookie", format!("session={placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let (auth, cookies) = headers_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("missing upstream headers"))?;
        assert_eq!(auth, b"Bearer sk-real");
        assert_eq!(cookies, vec![b"a=1".to_vec(), b"session=sk-real".to_vec()]);
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_policy_deny_resets_inbound_stream() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_60606060606060608a8a8a8a8a8a8a8a__";
        let secret_table = Arc::new(secret_table_with_secret(
            "ANTHROPIC_API_KEY",
            placeholder,
            "sk-real",
            &["api.anthropic.com"],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |_request, respond| {
            Box::pin(async move {
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/denied"))
            .header("authorization", format!("Bearer {placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(response.await.is_err(), "policy deny should reset stream");
        assert_eq!(handshake_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_denies_rewritten_header_block_over_limit_before_lease() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_71717171717171719a9a9a9a9a9a9a9a__";
        let secret_value = "x".repeat(8 * 1024);
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            &secret_value,
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_upstream_pool(
            Arc::clone(&handshake_count),
            move |_request, mut respond| {
                Box::pin(async move {
                    let response = Response::builder().status(StatusCode::OK).body(())?;
                    respond.send_response(response, true)?;
                    Ok(())
                })
            },
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_upstream_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            pool,
            test_h2_upstream_key(sni),
        ));
        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);

        let mut builder = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/headers"));
        for index in 0..9 {
            builder = builder.header(format!("x-secret-{index}"), placeholder);
        }
        let request = builder.body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            "rewritten header block over 64 KiB should reset before upstream lease"
        );

        let deny_log_text = read_test_file_eventually(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"header_size_exceeded\""),
            "deny log should record header_size_exceeded, got: {deny_log_text}"
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_saturation_opens_second_connection() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_61616161616161618b8b8b8b8b8b8b8b__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let release_first = Arc::new(tokio::sync::Notify::new());
        let (path_tx, mut path_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool_with_settings(
            Arc::clone(&handshake_count),
            {
                let release_first = Arc::clone(&release_first);
                move |request, respond| {
                    let release_first = Arc::clone(&release_first);
                    let path_tx = path_tx.clone();
                    Box::pin(async move {
                        let path = request.uri().path().to_string();
                        path_tx
                            .send(path.clone())
                            .map_err(|_| anyhow!("failed to send upstream path"))?;
                        if path == "/hold" {
                            release_first.notified().await;
                        }
                        send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
                    })
                }
            },
            Some(1),
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let first = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/hold"))
            .body(())?;
        let (first_response, _stream) = send_request.send_request(first, true)?;
        assert_eq!(
            path_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing path"))?,
            "/hold"
        );

        let second = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/fast"))
            .body(())?;
        let (second_response, _stream) = send_request.send_request(second, true)?;
        let second_response = second_response.await?;
        assert_eq!(second_response.status(), StatusCode::OK);
        assert_eq!(
            path_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing path"))?,
            "/fast"
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 2);

        release_first.notify_waiters();
        let first_response = first_response.await?;
        assert_eq!(first_response.status(), StatusCode::OK);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_h1_alpn_fallback_uses_full_duplex_h1_path() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_62626262626262628c8c8c8c8c8c8c8c__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let pool = test_h1_fallback_pool(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/fallback"))
            .header("cookie", "a=1")
            .header("cookie", "b=2")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive h1 request"))?;
        assert!(request_text.contains("GET /fallback HTTP/1.1\r\n"));
        assert_eq!(h1_header_values(&request_text, "cookie"), vec!["a=1; b=2"]);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_inbound_reset_propagates_without_closing_sibling() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_63636363636363638d8d8d8d8d8d8d8d__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (reset_tx, mut reset_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, respond| {
            let reset_tx = reset_tx.clone();
            Box::pin(async move {
                if request.uri().path() == "/reset" {
                    let mut body = request.into_body();
                    let error = loop {
                        let Some(result) = body.data().await else {
                            return Err(anyhow!("missing upstream reset"));
                        };
                        match result {
                            Ok(chunk) => {
                                body.flow_control().release_capacity(chunk.len())?;
                            }
                            Err(error) => break error,
                        }
                    };
                    reset_tx
                        .send(error.reason())
                        .map_err(|_| anyhow!("failed to send reset reason"))?;
                    return Ok(());
                }

                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let reset_request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/reset"))
            .body(())?;
        let (_reset_response, mut reset_stream) =
            send_request.send_request(reset_request, false)?;
        reset_stream.send_data(Bytes::from_static(b"hello"), false)?;
        reset_stream.send_reset(h2::Reason::CANCEL);

        let sibling = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/sibling"))
            .body(())?;
        let (sibling_response, _stream) = send_request.send_request(sibling, true)?;
        let sibling_response = sibling_response.await?;
        assert_eq!(sibling_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(sibling_response.into_body()).await?, b"ok");

        assert_eq!(
            reset_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing reset reason"))?,
            Some(h2::Reason::CANCEL)
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_early_response_releases_lease_without_upload_end() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_c1c1c1c1c1c1c1c1d2d2d2d2d2d2d2d2__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let handler = test_h2_early_response_handler();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, respond| {
            handler(request, respond)
        });
        let key = test_h2_upstream_key(sni);
        let pool_for_assertions = pool.clone();
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/early"))
            .body(())?;
        let (response, upload_stream) = send_request.send_request(request, false)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        drop(response);

        wait_for_pool_active_streams(&pool_for_assertions, &key, 0).await?;

        let second = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/after-early"))
            .body(())?;
        let (second_response, _stream) = send_request.send_request(second, true)?;
        let second_response = second_response.await?;
        assert_eq!(second_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(second_response.into_body()).await?, b"");
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(upload_stream);
        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_early_response_reuses_max_one_connection() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_e3e3e3e3e3e3e3e3f4f4f4f4f4f4f4f4__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let handler = test_h2_early_response_handler();
        let pool = test_h2_upstream_pool_with_settings(
            Arc::clone(&handshake_count),
            move |request, respond| handler(request, respond),
            Some(1),
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let first = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/first-early"))
            .body(())?;
        let (first_response, first_upload_stream) = send_request.send_request(first, false)?;
        let first_response = first_response.await?;
        assert_eq!(first_response.status(), StatusCode::OK);
        drop(first_response);

        let second = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/second"))
            .body(())?;
        let (second_response, _stream) = send_request.send_request(second, true)?;
        let second_response = second_response.await?;
        assert_eq!(second_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(second_response.into_body()).await?, b"");
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(first_upload_stream);
        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_goaway_evicts_connection_after_inflight_completes() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_64646464646464648e8e8e8e8e8e8e8e__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_goaway_pool(Arc::clone(&handshake_count));
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let first = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/first"))
            .body(())?;
        let (first_response, _stream) = send_request.send_request(first, true)?;
        let first_response = first_response.await?;
        assert_eq!(first_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(first_response.into_body()).await?, b"ok");

        let second = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/second"))
            .body(())?;
        let (second_response, _stream) = send_request.send_request(second, true)?;
        let second_response = second_response.await?;
        assert_eq!(second_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(second_response.into_body()).await?, b"ok");
        assert_eq!(handshake_count.load(Ordering::SeqCst), 2);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_forwards_informational_headers_and_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_65656565656565658f8f8f8f8f8f8f8f__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_upstream_pool(
            Arc::clone(&handshake_count),
            move |_request, mut respond| {
                Box::pin(async move {
                    let informational = Response::builder()
                        .status(StatusCode::CONTINUE)
                        .header("x-info", "yes")
                        .body(())?;
                    respond.send_informational(informational)?;
                    let response = Response::builder().status(StatusCode::OK).body(())?;
                    let mut send = respond.send_response(response, false)?;
                    send_data(&mut send, Bytes::from_static(b"ok"), false).await?;
                    let mut trailers = HeaderMap::new();
                    trailers.insert("x-done", HeaderValue::from_static("yes"));
                    send.send_trailers(trailers)?;
                    Ok(())
                })
            },
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/info"))
            .body(())?;
        let (mut response, _stream) = send_request.send_request(request, true)?;
        let informational = next_informational(&mut response).await?;
        assert_eq!(informational.status(), StatusCode::CONTINUE);
        assert_eq!(
            informational.headers().get("x-info"),
            Some(&HeaderValue::from_static("yes"))
        );
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();
        let data = body
            .data()
            .await
            .ok_or_else(|| anyhow!("missing response data"))??;
        assert_eq!(data, Bytes::from_static(b"ok"));
        body.flow_control().release_capacity(data.len())?;
        let trailers = body
            .trailers()
            .await?
            .ok_or_else(|| anyhow!("missing response trailers"))?;
        assert_eq!(
            trailers.get("x-done"),
            Some(&HeaderValue::from_static("yes"))
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_to_h2_response_trailers_with_repeated_values_round_trip() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_67676767676767679090909090909090__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_upstream_pool(
            Arc::clone(&handshake_count),
            move |_request, mut respond| {
                Box::pin(async move {
                    let response = Response::builder().status(StatusCode::OK).body(())?;
                    let mut send = respond.send_response(response, false)?;
                    send_data(&mut send, Bytes::from_static(b"ok"), false).await?;
                    let mut trailers = HeaderMap::new();
                    trailers.append("x-foo", HeaderValue::from_static("a"));
                    trailers.append("x-foo", HeaderValue::from_static("b"));
                    send.send_trailers(trailers)?;
                    Ok(())
                })
            },
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/trailers"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();
        let data = body
            .data()
            .await
            .ok_or_else(|| anyhow!("missing response data"))??;
        assert_eq!(data, Bytes::from_static(b"ok"));
        body.flow_control().release_capacity(data.len())?;
        let trailers = body
            .trailers()
            .await?
            .ok_or_else(|| anyhow!("missing response trailers"))?;
        let values = trailers
            .get_all("x-foo")
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>();
        assert_eq!(values, vec![b"a".to_vec(), b"b".to_vec()]);
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_to_h2_request_trailers_reset_inbound_stream() -> Result<()> {
        run_h2_to_h2_request_trailers_reset_inbound_stream().await
    }

    #[tokio::test]
    async fn h2_to_h2_request_trailers_reset_inbound_stream_is_stable() -> Result<()> {
        for _ in 0..50 {
            run_h2_to_h2_request_trailers_reset_inbound_stream().await?;
        }
        Ok(())
    }

    async fn run_h2_to_h2_request_trailers_reset_inbound_stream() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_68686868686868689191919191919191__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (observed_tx, mut observed_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, _respond| {
            let observed_tx = observed_tx.clone();
            Box::pin(async move {
                let observed = observe_h2_request_body_close(request.into_body()).await?;
                observed_tx
                    .send(observed)
                    .map_err(|_| anyhow!("failed to send upstream trailer observation"))?;
                Ok(())
            })
        });
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let key = H2UpstreamKey::new(
            sni.to_string(),
            std::net::SocketAddr::from(([127, 0, 0, 1], 443)),
        );
        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_upstream_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            pool,
            key,
        ));
        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/request-trailers"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        let mut trailers = HeaderMap::new();
        trailers.insert("x-trailer", HeaderValue::from_static("value"));
        stream.send_trailers(trailers)?;
        let error = match response.await {
            Ok(_) => {
                return Err(anyhow!(
                    "non-empty h2 to h2 request trailers should reset the inbound stream"
                ))
            }
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::INTERNAL_ERROR);

        let observed = tokio::time::timeout(std::time::Duration::from_secs(1), observed_rx.recv())
            .await
            .context("timed out waiting for upstream stream closure")?
            .ok_or_else(|| anyhow!("upstream trailer observation channel closed"))?;
        assert!(
            !observed.trailers_seen,
            "upstream should not receive trailers"
        );
        assert_eq!(
            observed.reset_reason,
            Some(h2::Reason::INTERNAL_ERROR),
            "upstream stream should be reset after denied request trailers"
        );
        let deny_log_text = read_test_file_eventually(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"request_trailers_unsupported\""),
            "deny log should record request_trailers_unsupported, got: {deny_log_text}"
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_to_h2_empty_request_trailers_ignored() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_69696969696969699292929292929292__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (observed_tx, mut observed_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, respond| {
            let observed_tx = observed_tx.clone();
            Box::pin(async move {
                let observed = observe_h2_request_body_close(request.into_body()).await?;
                observed_tx
                    .send(observed)
                    .map_err(|_| anyhow!("failed to send upstream trailer observation"))?;
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/empty-request-trailers"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        stream.send_trailers(HeaderMap::new())?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let observed = observed_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("missing upstream trailer observation"))?;
        assert!(
            !observed.trailers_seen,
            "empty trailers should not be forwarded"
        );
        assert_eq!(observed.reset_reason, None);
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_non_empty_request_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_30303030303030305252525252525252__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/trailers"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        let mut trailers = HeaderMap::new();
        trailers.insert("x-trailer", HeaderValue::from_static("value"));
        stream.send_trailers(trailers)?;
        let error = match response.await {
            Ok(_) => {
                return Err(anyhow!(
                    "non-empty h2 request trailers should reset the stream"
                ))
            }
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::INTERNAL_ERROR);

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"request_trailers_unsupported\""),
            "deny log should record request_trailers_unsupported, got: {deny_log_text}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_trailers_with_content_length() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_34343434343434345656565656565656__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_capture_until_eof(request_tx);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/trailers-with-length"))
            .header("content-length", "5")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        let mut trailers = HeaderMap::new();
        trailers.insert("x-trailer", HeaderValue::from_static("value"));
        stream.send_trailers(trailers)?;
        let error = match response.await {
            Ok(_) => {
                return Err(anyhow!(
                    "content-length plus non-empty h2 trailers should reset the stream"
                ))
            }
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::INTERNAL_ERROR);

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"request_trailers_unsupported\""),
            "deny log should record request_trailers_unsupported, got: {deny_log_text}"
        );
        let request_text =
            tokio::time::timeout(std::time::Duration::from_secs(1), request_rx.recv())
                .await
                .context("test upstream did not observe the partial request before shutdown")?
                .ok_or_else(|| anyhow!("test upstream capture channel closed"))?;
        assert!(request_text.contains("POST /trailers-with-length HTTP/1.1\r\n"));
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(!request_text
            .to_ascii_lowercase()
            .contains("content-length:"));
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_does_not_open_upstream_on_nonzero_cl_with_end_stream_headers() -> Result<()>
    {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_44444444444444446464646464646464__",
            "sk-real",
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/bad-length"))
            .header("content-length", "5")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let error = match response.await {
            Ok(_) => {
                return Err(anyhow!(
                    "nonzero end-stream h2 content-length should reset the stream"
                ))
            }
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::PROTOCOL_ERROR);

        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_does_not_complete_request_on_cl_overflow() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_45454545454545456565656565656565__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_capture_until_eof(request_tx);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/length-overflow"))
            .header("content-length", "5")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello!"), true)?;
        let error = match response.await {
            Ok(_) => return Err(anyhow!("content-length overflow should reset the stream")),
            Err(error) => error,
        };
        assert_h2_reset(error);
        assert_no_complete_chunked_request(&mut request_rx).await?;

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_does_not_complete_request_on_cl_underflow() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_46464646464646466666666666666666__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_capture_until_eof(request_tx);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/length-underflow"))
            .header("content-length", "5")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hey"), true)?;
        let error = match response.await {
            Ok(_) => return Err(anyhow!("content-length underflow should reset the stream")),
            Err(error) => error,
        };
        assert_h2_reset(error);
        assert_no_complete_chunked_request(&mut request_rx).await?;

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_accepts_empty_request_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_31313131313131315353535353535353__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/empty-trailers"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        stream.send_trailers(HeaderMap::new())?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n0\r\n\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_resets_denied_stream_without_closing_sibling() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_33333333333333334444444444444444__";
        let secret_table = Arc::new(secret_table_with_secret(
            "ANTHROPIC_API_KEY",
            placeholder,
            "sk-real",
            &["api.anthropic.com"],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);

        let denied = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/denied"))
            .header("authorization", format!("Bearer {placeholder}"))
            .body(())?;
        let (denied_response, _stream) = send_request.send_request(denied, true)?;
        assert!(denied_response.await.is_err());

        let allowed = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/allowed"))
            .body(())?;
        let (allowed_response, _stream) = send_request.send_request(allowed, true)?;
        let allowed_response = allowed_response.await?;
        assert_eq!(allowed_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(allowed_response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("allowed sibling did not reach upstream"))?;
        assert!(request_text.contains("GET /allowed HTTP/1.1\r\n"));
        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(deny_log_text.contains("\"reason\":\"placeholder_on_non_allowed\""));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_settings_omit_extended_connect_and_bound_headers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_55555555555555556666666666666666__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 200 OK\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let mut client_io = client_io;
        client_io
            .write_all(b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n")
            .await?;
        client_io.write_all(&[0, 0, 0, 4, 0, 0, 0, 0, 0]).await?;
        let settings = read_h2_settings(&mut client_io).await?;
        assert!(
            settings
                .iter()
                .any(|(id, value)| *id == 0x06 && *value == MAX_HEADER_BLOCK_BYTES as u32),
            "server SETTINGS should bound MAX_HEADER_LIST_SIZE"
        );
        assert!(
            settings
                .iter()
                .any(|(id, value)| *id == 0x04 && *value == H2_INITIAL_WINDOW_SIZE),
            "server SETTINGS should advertise a generous INITIAL_WINDOW_SIZE"
        );
        assert!(
            settings.iter().all(|(id, _)| *id != 0x08),
            "server SETTINGS should not advertise ENABLE_CONNECT_PROTOCOL"
        );

        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn outbound_h2_settings_disable_push() -> Result<()> {
        let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
        let settings_task = tokio::spawn(async move {
            let mut preface = [0_u8; 24];
            upstream_io.read_exact(&mut preface).await?;
            ensure!(
                preface.as_slice() == b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n",
                "missing outbound h2 client preface"
            );
            upstream_io.write_all(&[0, 0, 0, 4, 0, 0, 0, 0, 0]).await?;
            read_h2_settings(&mut upstream_io).await
        });

        let key = H2UpstreamKey::new(
            "api.openai.com".to_string(),
            std::net::SocketAddr::from(([127, 0, 0, 1], 443)),
        );
        let mut entries = HashMap::new();
        let lease = insert_h2_connection_locked(
            &mut entries,
            &key,
            Box::new(dsbx_io) as BoxedAsyncReadWrite,
        )
        .await?;
        let settings = settings_task
            .await
            .context("settings reader task panicked")??;
        assert!(
            settings
                .iter()
                .any(|(id, value)| *id == 0x02 && *value == 0),
            "client SETTINGS should advertise ENABLE_PUSH=0, got {settings:?}"
        );

        drop(lease);
        drop(entries);
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_authority_sni_mismatch() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_77777777777777778888888888888888__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 200 OK\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri("https://api.anthropic.com/v1/messages")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            ":authority/SNI mismatch should reset"
        );

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"host_sni_mismatch\""),
            "deny log should record host_sni_mismatch, got: {deny_log_text}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_rejects_http_scheme_on_tls_session() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_47474747474747476767676767676767__",
            "sk-real",
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("http://{sni}/plain"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let error = match response.await {
            Ok(_) => return Err(anyhow!("http :scheme should reset the stream")),
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::PROTOCOL_ERROR);

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"malformed_headers\""),
            "deny log should record malformed_headers, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_rejects_unknown_scheme_on_tls_session() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_48484848484848486868686868686868__",
            "sk-real",
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("ftp://{sni}/plain"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let error = match response.await {
            Ok(_) => return Err(anyhow!("unknown :scheme should reset the stream")),
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::PROTOCOL_ERROR);

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"malformed_headers\""),
            "deny log should record malformed_headers, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_placeholder_in_path() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_99999999999999990000000000000000__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 200 OK\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/v1/{placeholder}/list"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(response.await.is_err(), "placeholder in :path should reset");

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"url_line_placeholder\""),
            "deny log should record url_line_placeholder, got: {deny_log_text}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_advertises_max_concurrent_streams_cap() -> Result<()> {
        // We assert the cap is advertised in the server's SETTINGS frame.
        // Exhausting the budget with 257 concurrent streams would need a
        // synchronization primitive to hold all sibling streams open
        // simultaneously; the SETTINGS check covers the load-bearing fact
        // (the cap is sent), and h2 enforces the rest.
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 200 OK\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (send_request, connection) = h2::client::handshake(client_io).await?;
        // The server's SETTINGS frame is consumed during handshake; the client
        // exposes the negotiated value via `max_concurrent_send_streams`.
        // Driving the connection forward at least once is required for the
        // SETTINGS frame to be parsed.
        let connection_task = tokio::spawn(connection);
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(
            send_request.current_max_send_streams(),
            H2_MAX_CONCURRENT_STREAMS as usize,
            "server should advertise MAX_CONCURRENT_STREAMS={H2_MAX_CONCURRENT_STREAMS}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_rejects_protocol_header_list_over_limit_before_handler() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_babababababababacbcbcbcbcbcbcbcb__",
            "sk-real",
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(512 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/too-many-headers"))
            .header(
                "authorization",
                format!("Bearer {}", "x".repeat(128 * 1024)),
            )
            .body(())?;
        match send_request.send_request(request, true) {
            Ok((response, _stream)) => {
                assert!(
                    response.await.is_err(),
                    "oversized h2 header list should reset before upstream handling"
                );
            }
            Err(_error) => {}
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    fn test_h1_opener(
        request_tx: mpsc::UnboundedSender<String>,
        response: impl Into<Vec<u8>>,
    ) -> OpenH1Upstream {
        let response = Arc::new(response.into());
        Arc::new(move || {
            let request_tx = request_tx.clone();
            let response = Arc::clone(&response);
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    loop {
                        let mut byte = [0_u8; 1];
                        upstream_io.read_exact(&mut byte).await?;
                        request.push(byte[0]);
                        if request.ends_with(b"\r\n\r\n") {
                            break;
                        }
                    }
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    upstream_io.write_all(response.as_slice()).await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    type TestH2Handler = Arc<
        dyn Fn(
                Request<RecvStream>,
                SendResponse<Bytes>,
            ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>
            + Send
            + Sync,
    >;

    fn test_h2_early_response_handler() -> TestH2Handler {
        Arc::new(move |mut request, mut respond| {
            Box::pin(async move {
                let response = Response::builder().status(StatusCode::OK).body(())?;
                respond.send_response(response, true)?;
                if let Some(result) = request.body_mut().data().await {
                    match result {
                        Ok(chunk) => {
                            request
                                .body_mut()
                                .flow_control()
                                .release_capacity(chunk.len())?;
                        }
                        Err(error) if error.is_reset() => {}
                        Err(error) => return Err(error.into()),
                    }
                }
                Ok(())
            })
        })
    }

    fn test_h2_upstream_pool<F>(handshake_count: Arc<AtomicUsize>, handler: F) -> H2UpstreamPool
    where
        F: Fn(
                Request<RecvStream>,
                SendResponse<Bytes>,
            ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>
            + Send
            + Sync
            + 'static,
    {
        test_h2_upstream_pool_with_settings(handshake_count, handler, None)
    }

    fn test_h2_upstream_pool_with_settings<F>(
        handshake_count: Arc<AtomicUsize>,
        handler: F,
        max_concurrent_streams: Option<u32>,
    ) -> H2UpstreamPool
    where
        F: Fn(
                Request<RecvStream>,
                SendResponse<Bytes>,
            ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>
            + Send
            + Sync
            + 'static,
    {
        test_h2_upstream_pool_with_settings_and_open_delay(
            handshake_count,
            handler,
            max_concurrent_streams,
            None,
        )
    }

    fn test_h2_upstream_pool_with_settings_and_open_delay<F>(
        handshake_count: Arc<AtomicUsize>,
        handler: F,
        max_concurrent_streams: Option<u32>,
        open_delay: Option<std::time::Duration>,
    ) -> H2UpstreamPool
    where
        F: Fn(
                Request<RecvStream>,
                SendResponse<Bytes>,
            ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>
            + Send
            + Sync
            + 'static,
    {
        let handler: TestH2Handler = Arc::new(handler);
        let opener: OpenUpstream = Arc::new(move |_key| {
            let handler = Arc::clone(&handler);
            let handshake_count = Arc::clone(&handshake_count);
            Box::pin(async move {
                if let Some(open_delay) = open_delay {
                    tokio::time::sleep(open_delay).await;
                }
                handshake_count.fetch_add(1, Ordering::SeqCst);
                let (dsbx_io, upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut builder = h2::server::Builder::new();
                    if let Some(max) = max_concurrent_streams {
                        builder.max_concurrent_streams(max);
                    }
                    let mut connection = builder.handshake::<_, Bytes>(upstream_io).await?;
                    while let Some(accepted) = connection.accept().await {
                        let (request, respond) = accepted?;
                        let handler = Arc::clone(&handler);
                        tokio::spawn(async move {
                            if let Err(error) = handler(request, respond).await {
                                warn!(error = %error, "test h2 upstream handler failed");
                            }
                        });
                    }
                    Ok::<(), anyhow::Error>(())
                });
                Ok(OpenedUpstream::new(
                    UpstreamProtocol::H2,
                    Box::new(dsbx_io) as BoxedAsyncReadWrite,
                ))
            })
        });
        H2UpstreamPool::new(opener)
    }

    fn test_h2_pool_with_close_observer<F>(
        handler: F,
    ) -> (H2UpstreamPool, H2UpstreamKey, mpsc::UnboundedReceiver<()>)
    where
        F: Fn(
                Request<RecvStream>,
                SendResponse<Bytes>,
            ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>
            + Send
            + Sync
            + 'static,
    {
        let handler: TestH2Handler = Arc::new(handler);
        let (closed_tx, closed_rx) = mpsc::unbounded_channel();
        let opener: OpenUpstream = Arc::new(move |_key| {
            let handler = Arc::clone(&handler);
            let closed_tx = closed_tx.clone();
            Box::pin(async move {
                let (dsbx_io, upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let result = async {
                        let mut connection = h2::server::handshake(upstream_io).await?;
                        while let Some(accepted) = connection.accept().await {
                            let (request, respond) = accepted?;
                            let handler = Arc::clone(&handler);
                            tokio::spawn(async move {
                                if let Err(error) = handler(request, respond).await {
                                    warn!(error = %error, "test h2 close observer handler failed");
                                }
                            });
                        }
                        Ok::<(), anyhow::Error>(())
                    }
                    .await;
                    let _ = closed_tx.send(());
                    if let Err(error) = result {
                        warn!(error = %error, "test h2 close observer connection failed");
                    }
                });
                Ok(OpenedUpstream::new(
                    UpstreamProtocol::H2,
                    Box::new(dsbx_io) as BoxedAsyncReadWrite,
                ))
            })
        });
        let key = H2UpstreamKey::new(
            "api.openai.com".to_string(),
            std::net::SocketAddr::from(([127, 0, 0, 1], 443)),
        );
        (H2UpstreamPool::new(opener), key, closed_rx)
    }

    async fn send_direct_pooled_h2_get(
        pool: &H2UpstreamPool,
        key: &H2UpstreamKey,
        path: &str,
    ) -> Result<()> {
        let lease = match pool.lease(key).await? {
            UpstreamLease::H2(lease) => lease,
            UpstreamLease::Http1(_) => return Err(anyhow!("expected h2 lease")),
        };
        let mut send_request = lease.send_request();
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{}{}", key.authority(), path))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");
        drop(send_request);
        drop(lease);
        Ok(())
    }

    async fn assert_upstream_connection_closed(
        closed_rx: &mut mpsc::UnboundedReceiver<()>,
    ) -> Result<()> {
        for _ in 0..16 {
            if closed_rx.try_recv().is_ok() {
                return Ok(());
            }
            tokio::task::yield_now().await;
        }
        Err(anyhow!("upstream h2 connection did not close"))
    }

    fn assert_upstream_connection_still_open(
        closed_rx: &mut mpsc::UnboundedReceiver<()>,
    ) -> Result<()> {
        match closed_rx.try_recv() {
            Ok(()) => Err(anyhow!("upstream h2 connection closed unexpectedly")),
            Err(tokio::sync::mpsc::error::TryRecvError::Empty) => Ok(()),
            Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {
                Err(anyhow!("upstream h2 close observer channel disconnected"))
            }
        }
    }

    #[derive(Debug)]
    struct H2RequestBodyObservation {
        trailers_seen: bool,
        reset_reason: Option<h2::Reason>,
    }

    async fn observe_h2_request_body_close(
        mut body: RecvStream,
    ) -> Result<H2RequestBodyObservation> {
        while let Some(chunk) = body.data().await {
            match chunk {
                Ok(chunk) => {
                    body.flow_control().release_capacity(chunk.len())?;
                }
                Err(error) => {
                    return Ok(H2RequestBodyObservation {
                        trailers_seen: false,
                        reset_reason: error.reason(),
                    });
                }
            }
        }

        let trailers = match body.trailers().await {
            Ok(trailers) => trailers,
            Err(error) => {
                return Ok(H2RequestBodyObservation {
                    trailers_seen: false,
                    reset_reason: error.reason(),
                });
            }
        };
        Ok(H2RequestBodyObservation {
            trailers_seen: trailers.is_some_and(|trailers| !trailers.is_empty()),
            reset_reason: None,
        })
    }

    async fn read_test_file_eventually(path: &std::path::Path) -> Result<String> {
        for _ in 0..50 {
            match tokio::fs::read_to_string(path).await {
                Ok(text) if !text.is_empty() => return Ok(text),
                Ok(_) => {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Err(error) => return Err(error.into()),
            }
        }

        tokio::fs::read_to_string(path)
            .await
            .with_context(|| format!("failed to read {}", path.display()))
    }

    fn test_h1_fallback_pool(
        request_tx: mpsc::UnboundedSender<String>,
        response: impl Into<Vec<u8>>,
    ) -> H2UpstreamPool {
        let response = Arc::new(response.into());
        let opener: OpenUpstream = Arc::new(move |_key| {
            let request_tx = request_tx.clone();
            let response = Arc::clone(&response);
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    read_test_h1_header_block(&mut upstream_io, &mut request).await?;
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured h1 request"))?;
                    upstream_io.write_all(response.as_slice()).await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(OpenedUpstream::new(
                    UpstreamProtocol::Http1,
                    Box::new(dsbx_io) as BoxedAsyncReadWrite,
                ))
            })
        });
        H2UpstreamPool::new(opener)
    }

    fn test_h2_goaway_pool(handshake_count: Arc<AtomicUsize>) -> H2UpstreamPool {
        let opener: OpenUpstream = Arc::new(move |_key| {
            let handshake_count = Arc::clone(&handshake_count);
            Box::pin(async move {
                let connection_index = handshake_count.fetch_add(1, Ordering::SeqCst) + 1;
                let (dsbx_io, upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut connection = h2::server::handshake(upstream_io).await?;
                    while let Some(accepted) = connection.accept().await {
                        let (_request, respond) = accepted?;
                        if connection_index == 1 {
                            connection.graceful_shutdown();
                        }
                        tokio::spawn(async move {
                            if let Err(error) =
                                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok"))
                                    .await
                            {
                                warn!(error = %error, "test h2 goaway handler failed");
                            }
                        });
                    }
                    Ok::<(), anyhow::Error>(())
                });
                Ok(OpenedUpstream::new(
                    UpstreamProtocol::H2,
                    Box::new(dsbx_io) as BoxedAsyncReadWrite,
                ))
            })
        });
        H2UpstreamPool::new(opener)
    }

    fn test_h2_upstream_key(sni: &str) -> H2UpstreamKey {
        H2UpstreamKey::new(
            sni.to_string(),
            std::net::SocketAddr::from(([127, 0, 0, 1], 443)),
        )
    }

    async fn wait_for_pool_active_streams(
        pool: &H2UpstreamPool,
        key: &H2UpstreamKey,
        expected: usize,
    ) -> Result<()> {
        for _ in 0..16 {
            let active_streams = pool_active_streams(pool, key).await;
            if active_streams == expected {
                return Ok(());
            }
            tokio::task::yield_now().await;
        }

        let active_streams = pool_active_streams(pool, key).await;
        Err(anyhow!(
            "expected {expected} active h2 streams for {}, got {active_streams}",
            key.authority()
        ))
    }

    async fn pool_active_streams(pool: &H2UpstreamPool, key: &H2UpstreamKey) -> usize {
        let entries = pool.inner.entries.lock().await;
        entries
            .get(key)
            .map(|connections| {
                connections
                    .iter()
                    .map(|connection| connection.active_streams.load(Ordering::SeqCst))
                    .sum()
            })
            .unwrap_or(0)
    }

    async fn start_test_h2_upstream_bridge(
        sni: &str,
        secret_table: Arc<SecretTable>,
        pool: H2UpstreamPool,
    ) -> Result<(
        h2::client::SendRequest<Bytes>,
        tokio::task::JoinHandle<std::result::Result<(), h2::Error>>,
        tokio::task::JoinHandle<Result<()>>,
    )> {
        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?.keep();
        let deny_log = Arc::new(tempdir.join("deny.log"));
        let key = H2UpstreamKey::new(
            sni.to_string(),
            std::net::SocketAddr::from(([127, 0, 0, 1], 443)),
        );
        let bridge_task = tokio::spawn(run_h2_to_upstream_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            pool,
            key,
        ));
        let (send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        Ok((send_request, connection_task, bridge_task))
    }

    async fn send_h2_response(
        mut respond: SendResponse<Bytes>,
        status: StatusCode,
        body: Bytes,
    ) -> Result<()> {
        let response = Response::builder().status(status).body(())?;
        let mut send = respond.send_response(response, false)?;
        send_data(&mut send, body, true).await
    }

    fn test_h1_opener_capture_until_eof(
        request_tx: mpsc::UnboundedSender<String>,
    ) -> OpenH1Upstream {
        Arc::new(move || {
            let request_tx = request_tx.clone();
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    upstream_io.read_to_end(&mut request).await?;
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn test_h1_counting_opener(
        open_count: Arc<AtomicUsize>,
        request_tx: mpsc::UnboundedSender<String>,
        response: impl Into<Vec<u8>>,
    ) -> OpenH1Upstream {
        let response = response.into();
        let opener = test_h1_opener(request_tx, response);
        Arc::new(move || {
            open_count.fetch_add(1, Ordering::SeqCst);
            opener()
        })
    }

    fn test_h1_opener_expect_continue(request_tx: mpsc::UnboundedSender<String>) -> OpenH1Upstream {
        Arc::new(move || {
            let request_tx = request_tx.clone();
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    read_test_h1_header_block(&mut upstream_io, &mut request).await?;
                    upstream_io
                        .write_all(b"HTTP/1.1 100 Continue\r\nx-info: yes\r\n\r\n")
                        .await?;
                    read_test_h1_chunked_body(&mut upstream_io, &mut request).await?;
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    upstream_io
                        .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
                        .await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn test_h1_opener_early_final_response(
        request_tx: mpsc::UnboundedSender<String>,
    ) -> OpenH1Upstream {
        Arc::new(move || {
            let request_tx = request_tx.clone();
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    read_test_h1_header_block(&mut upstream_io, &mut request).await?;
                    let _first_chunk = read_test_h1_chunk(&mut upstream_io, &mut request).await?;
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    upstream_io
                        .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nearly")
                        .await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn test_h1_opener_bidirectional_stream(
        request_tx: mpsc::UnboundedSender<String>,
    ) -> OpenH1Upstream {
        Arc::new(move || {
            let request_tx = request_tx.clone();
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    read_test_h1_header_block(&mut upstream_io, &mut request).await?;
                    let first_chunk = read_test_h1_chunk(&mut upstream_io, &mut request).await?;
                    ensure!(first_chunk.as_slice() == b"one", "unexpected first chunk");
                    upstream_io
                        .write_all(
                            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n7\r\nack-one\r\n",
                        )
                        .await?;
                    upstream_io.flush().await?;

                    let second_chunk = read_test_h1_chunk(&mut upstream_io, &mut request).await?;
                    ensure!(second_chunk.as_slice() == b"two", "unexpected second chunk");
                    read_test_h1_chunked_body_after_chunks(&mut upstream_io, &mut request).await?;
                    upstream_io.write_all(b"7\r\nack-two\r\n0\r\n\r\n").await?;
                    upstream_io.flush().await?;
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn test_h1_opener_with_chunked_body(
        request_tx: mpsc::UnboundedSender<String>,
        response: impl Into<Vec<u8>>,
    ) -> OpenH1Upstream {
        let response = Arc::new(response.into());
        Arc::new(move || {
            let request_tx = request_tx.clone();
            let response = Arc::clone(&response);
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    loop {
                        let mut byte = [0_u8; 1];
                        if upstream_io.read_exact(&mut byte).await.is_err() {
                            return Ok::<(), anyhow::Error>(());
                        }
                        request.push(byte[0]);
                        if request.ends_with(b"\r\n\r\n") {
                            break;
                        }
                    }
                    loop {
                        let line = read_test_crlf_line(&mut upstream_io).await?;
                        request.extend_from_slice(&line);
                        let chunk_size = parse_test_chunk_size(&line)?;
                        if chunk_size == 0 {
                            let terminator = read_test_crlf_line(&mut upstream_io).await?;
                            request.extend_from_slice(&terminator);
                            break;
                        }
                        let mut body = vec![0_u8; chunk_size];
                        upstream_io.read_exact(&mut body).await?;
                        request.extend_from_slice(&body);
                        let crlf = read_test_crlf_line(&mut upstream_io).await?;
                        request.extend_from_slice(&crlf);
                    }
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    upstream_io.write_all(response.as_slice()).await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    async fn read_test_h1_header_block<R>(reader: &mut R, request: &mut Vec<u8>) -> Result<()>
    where
        R: AsyncRead + Unpin,
    {
        loop {
            let mut byte = [0_u8; 1];
            reader.read_exact(&mut byte).await?;
            request.push(byte[0]);
            if request.ends_with(b"\r\n\r\n") {
                return Ok(());
            }
        }
    }

    async fn read_test_h1_chunk<R>(reader: &mut R, request: &mut Vec<u8>) -> Result<Vec<u8>>
    where
        R: AsyncRead + Unpin,
    {
        let line = read_test_crlf_line(reader).await?;
        request.extend_from_slice(&line);
        let chunk_size = parse_test_chunk_size(&line)?;
        let mut body = vec![0_u8; chunk_size];
        if chunk_size != 0 {
            reader.read_exact(&mut body).await?;
            request.extend_from_slice(&body);
        }
        let crlf = read_test_crlf_line(reader).await?;
        request.extend_from_slice(&crlf);
        Ok(body)
    }

    async fn read_test_h1_chunked_body<R>(reader: &mut R, request: &mut Vec<u8>) -> Result<()>
    where
        R: AsyncRead + Unpin,
    {
        loop {
            let chunk = read_test_h1_chunk(reader, request).await?;
            if chunk.is_empty() {
                return Ok(());
            }
        }
    }

    async fn read_test_h1_chunked_body_after_chunks<R>(
        reader: &mut R,
        request: &mut Vec<u8>,
    ) -> Result<()>
    where
        R: AsyncRead + Unpin,
    {
        let line = read_test_crlf_line(reader).await?;
        request.extend_from_slice(&line);
        let chunk_size = parse_test_chunk_size(&line)?;
        ensure!(chunk_size == 0, "expected chunk terminator");
        let terminator = read_test_crlf_line(reader).await?;
        request.extend_from_slice(&terminator);
        Ok(())
    }

    fn test_h1_opener_with_split_chunked_response(
        request_tx: mpsc::UnboundedSender<String>,
        first_write_tx: mpsc::UnboundedSender<()>,
        continue_response: Arc<tokio::sync::Notify>,
        first_part: Vec<u8>,
        second_part: Vec<u8>,
    ) -> OpenH1Upstream {
        let first_part = Arc::new(first_part);
        let second_part = Arc::new(second_part);
        Arc::new(move || {
            let request_tx = request_tx.clone();
            let first_write_tx = first_write_tx.clone();
            let continue_response = Arc::clone(&continue_response);
            let first_part = Arc::clone(&first_part);
            let second_part = Arc::clone(&second_part);
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    loop {
                        let mut byte = [0_u8; 1];
                        upstream_io.read_exact(&mut byte).await?;
                        request.push(byte[0]);
                        if request.ends_with(b"\r\n\r\n") {
                            break;
                        }
                    }
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;

                    let total_len = first_part.len() + second_part.len();
                    upstream_io
                        .write_all(
                            format!(
                                "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{total_len:x}\r\n"
                            )
                            .as_bytes(),
                        )
                        .await?;
                    upstream_io.write_all(first_part.as_slice()).await?;
                    first_write_tx
                        .send(())
                        .map_err(|_| anyhow!("failed to signal first response write"))?;
                    continue_response.notified().await;
                    upstream_io.write_all(second_part.as_slice()).await?;
                    upstream_io.write_all(b"\r\n0\r\n\r\n").await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    async fn read_test_crlf_line<R>(reader: &mut R) -> Result<Vec<u8>>
    where
        R: AsyncRead + Unpin,
    {
        let mut line = Vec::new();
        loop {
            let mut byte = [0_u8; 1];
            reader.read_exact(&mut byte).await?;
            line.push(byte[0]);
            if line.ends_with(b"\r\n") {
                return Ok(line);
            }
        }
    }

    fn parse_test_chunk_size(line: &[u8]) -> Result<usize> {
        let text = std::str::from_utf8(line).context("test chunk line should be utf8")?;
        let size = text
            .strip_suffix("\r\n")
            .ok_or_else(|| anyhow!("test chunk line missing CRLF"))?;
        usize::from_str_radix(size, 16).context("invalid test chunk size")
    }

    async fn read_h2_settings<R>(reader: &mut R) -> Result<Vec<(u16, u32)>>
    where
        R: AsyncRead + Unpin,
    {
        loop {
            let mut head = [0_u8; 9];
            reader.read_exact(&mut head).await?;
            let len = ((head[0] as usize) << 16) | ((head[1] as usize) << 8) | head[2] as usize;
            let frame_type = head[3];
            let flags = head[4];
            let mut payload = vec![0_u8; len];
            reader.read_exact(&mut payload).await?;
            if frame_type != 4 || flags & 0x1 != 0 {
                continue;
            }
            let settings = payload.chunks_exact(6);
            ensure!(
                settings.remainder().is_empty(),
                "invalid SETTINGS payload length"
            );
            return settings
                .map(|setting| {
                    let id = u16::from_be_bytes([setting[0], setting[1]]);
                    let value =
                        u32::from_be_bytes([setting[2], setting[3], setting[4], setting[5]]);
                    Ok((id, value))
                })
                .collect();
        }
    }

    async fn read_h2_body(mut body: RecvStream) -> Result<Vec<u8>> {
        let mut output = Vec::new();
        while let Some(chunk) = body.data().await {
            let chunk = chunk?;
            output.extend_from_slice(&chunk);
            body.flow_control().release_capacity(chunk.len())?;
        }
        ensure!(body.trailers().await?.is_none(), "unexpected trailers");
        Ok(output)
    }

    async fn next_informational(response: &mut h2::client::ResponseFuture) -> Result<Response<()>> {
        tokio::time::timeout(
            std::time::Duration::from_secs(1),
            poll_fn(|cx| match response.poll_informational(cx) {
                std::task::Poll::Ready(Some(result)) => std::task::Poll::Ready(
                    result.context("failed to read h2 informational response"),
                ),
                std::task::Poll::Ready(None) => {
                    std::task::Poll::Ready(Err(anyhow!("no informational response available")))
                }
                std::task::Poll::Pending => std::task::Poll::Pending,
            }),
        )
        .await
        .context("timed out waiting for informational response")?
    }

    fn h1_header_values<'a>(request_text: &'a str, name: &str) -> Vec<&'a str> {
        request_text
            .lines()
            .filter_map(|line| {
                let (header_name, value) = line.split_once(": ")?;
                if header_name.eq_ignore_ascii_case(name) {
                    Some(value.trim_end_matches('\r'))
                } else {
                    None
                }
            })
            .collect()
    }

    async fn assert_no_complete_chunked_request(
        request_rx: &mut mpsc::UnboundedReceiver<String>,
    ) -> Result<()> {
        let request_text = match tokio::time::timeout(
            std::time::Duration::from_secs(1),
            request_rx.recv(),
        )
        .await
        {
            Ok(Some(request_text)) => request_text,
            Ok(None) | Err(_) => return Ok(()),
        };
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(
            !request_text.contains("\r\n0\r\n\r\n"),
            "upstream received a complete chunked request: {request_text}"
        );
        Ok(())
    }

    fn assert_h2_reset(error: h2::Error) {
        assert!(
            error.reason().is_some(),
            "expected h2 reset reason, got: {error}"
        );
    }

    fn assert_h2_reset_reason(error: h2::Error, reason: h2::Reason) {
        assert_eq!(
            error.reason(),
            Some(reason),
            "unexpected h2 reset reason: {error}"
        );
    }

    fn secret_table_with_secret(
        name: &str,
        placeholder: &str,
        value: &str,
        patterns: &[&str],
    ) -> Result<SecretTable> {
        let allowed_domains = patterns
            .iter()
            .map(|pattern| (*pattern).to_string())
            .collect::<Vec<_>>();
        let domain_set = DomainSet::from_patterns(&allowed_domains)?;
        let secret = Secret {
            name: name.to_string(),
            placeholder: placeholder.to_string(),
            value: value.to_string(),
            allowed_domains: domain_set,
        };
        let mut by_placeholder = HashMap::new();
        by_placeholder.insert(placeholder.to_string(), secret);
        Ok(SecretTable {
            by_placeholder,
            sni_match_set: DomainSet::from_patterns(&allowed_domains)?,
        })
    }
}
