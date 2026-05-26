use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Mutex as StdMutex;
use std::sync::{Arc, Weak};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use h2::client::SendRequest;
use tokio::sync::futures::OwnedNotified;
use tracing::warn;

use super::super::http_framing::MAX_HEADER_BLOCK_BYTES;
use super::{BoxedAsyncReadWrite, OpenUpstream, UpstreamProtocol, H2_INITIAL_WINDOW_SIZE};

// Evict an idle pooled h2 connection after 5 minutes. Long enough that a
// single agent making sporadic requests reuses the same upstream; short enough
// that an inactive sandbox does not hold sockets indefinitely.
pub(super) const H2_UPSTREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
// Sweep less often than per-request pruning to keep the idle invariant true
// without waking an inactive sandbox too frequently.
pub(super) const H2_UPSTREAM_POOL_SWEEP_INTERVAL: Duration = Duration::from_secs(60);
// Cap pooled h2 connections per upstream at 8. Saturation (upstream advertising
// a low SETTINGS_MAX_CONCURRENT_STREAMS) opens additional connections up to
// this cap; bumping it should be paired with a look at `reserve_h2_connection`,
// which is O(n) in the per-key vector length.
const H2_UPSTREAM_MAX_CONNECTIONS_PER_KEY: usize = 8;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(in crate::commands::forward) struct H2UpstreamKey {
    authority: String,
    upstream_socket_addr: SocketAddr,
}

impl H2UpstreamKey {
    pub(in crate::commands::forward) fn new(
        authority: String,
        upstream_socket_addr: SocketAddr,
    ) -> Self {
        Self {
            authority,
            upstream_socket_addr,
        }
    }

    pub(in crate::commands::forward) fn authority(&self) -> &str {
        &self.authority
    }
}

#[derive(Clone)]
pub(in crate::commands::forward) struct H2UpstreamPool {
    pub(super) inner: Arc<H2UpstreamPoolInner>,
}

pub(super) struct H2UpstreamPoolInner {
    open_upstream: OpenUpstream,
    pub(super) entries: tokio::sync::Mutex<HashMap<H2UpstreamKey, Vec<Arc<PooledH2Connection>>>>,
    openings: StdMutex<HashMap<H2UpstreamKey, Arc<tokio::sync::Notify>>>,
    sweeper_shutdown: Arc<tokio::sync::Notify>,
}

pub(super) struct PooledH2Connection {
    send_request: SendRequest<Bytes>,
    pub(super) active_streams: AtomicUsize,
    draining: AtomicBool,
    pub(super) closed: AtomicBool,
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
    pub(super) async fn ready(self) -> std::result::Result<Self, h2::Error> {
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

    pub(super) fn send_request(&self) -> SendRequest<Bytes> {
        self.send_request.clone()
    }

    // Closed means the underlying h2 session has gone away and the connection
    // driver task has resolved; the pool entry is eligible for eviction on the
    // next prune.
    pub(super) fn mark_closed(&self) {
        mark_h2_connection_closed(&self.reservation.connection);
    }
}

impl H2UpstreamPool {
    pub(in crate::commands::forward) fn new(open_upstream: OpenUpstream) -> Self {
        let inner = Arc::new(H2UpstreamPoolInner {
            open_upstream,
            entries: tokio::sync::Mutex::new(HashMap::new()),
            openings: StdMutex::new(HashMap::new()),
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

    async fn open_or_reserve_new(&self, key: &H2UpstreamKey) -> Result<LeaseCandidate> {
        loop {
            {
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
            }

            match self.reserve_or_wait_opening(key)? {
                OpeningDecision::Open(opening) => {
                    return self.open_reserved_connection(key, opening).await;
                }
                OpeningDecision::Wait(notified) => {
                    notified.await;
                }
            }
        }
    }

    fn reserve_or_wait_opening(&self, key: &H2UpstreamKey) -> Result<OpeningDecision> {
        let mut openings = self
            .inner
            .openings
            .lock()
            .map_err(|_| anyhow!("h2 upstream opening map poisoned"))?;
        if let Some(notify) = openings.get(key) {
            return Ok(OpeningDecision::Wait(Arc::clone(notify).notified_owned()));
        }

        let notify = Arc::new(tokio::sync::Notify::new());
        openings.insert(key.clone(), Arc::clone(&notify));
        Ok(OpeningDecision::Open(H2OpeningGuard {
            inner: Arc::clone(&self.inner),
            key: key.clone(),
            notify,
            completed: false,
        }))
    }

    async fn open_reserved_connection(
        &self,
        key: &H2UpstreamKey,
        opening: H2OpeningGuard,
    ) -> Result<LeaseCandidate> {
        let opened = match (self.inner.open_upstream)(key.clone()).await {
            Ok(opened) => opened,
            Err(error) => {
                opening.complete()?;
                return Err(error).context("failed to open pooled upstream");
            }
        };

        match opened.protocol {
            UpstreamProtocol::Http1 => {
                opening.complete()?;
                Ok(LeaseCandidate::Http1(opened.io))
            }
            UpstreamProtocol::H2 => {
                let (pooled, lease) = open_h2_connection(opened.io)
                    .await
                    .context("failed to establish pooled h2 upstream")?;
                {
                    let mut entries = self.inner.entries.lock().await;
                    prune_idle_pool_entries(&mut entries);
                    entries
                        .entry(key.clone())
                        .or_default()
                        .push(Arc::clone(&pooled));
                }
                opening.complete()?;
                Ok(LeaseCandidate::H2 {
                    lease,
                    is_new: true,
                })
            }
        }
    }
}

enum OpeningDecision {
    Open(H2OpeningGuard),
    Wait(OwnedNotified),
}

struct H2OpeningGuard {
    inner: Arc<H2UpstreamPoolInner>,
    key: H2UpstreamKey,
    notify: Arc<tokio::sync::Notify>,
    completed: bool,
}

impl H2OpeningGuard {
    fn complete(mut self) -> Result<()> {
        remove_opening(&self.inner, &self.key, &self.notify)?;
        self.completed = true;
        self.notify.notify_waiters();
        Ok(())
    }
}

impl Drop for H2OpeningGuard {
    fn drop(&mut self) {
        if self.completed {
            return;
        }
        if let Err(error) = remove_opening(&self.inner, &self.key, &self.notify) {
            warn!(error = %error, "failed to clear cancelled h2 upstream opening");
        }
        self.notify.notify_waiters();
    }
}

fn remove_opening(
    inner: &H2UpstreamPoolInner,
    key: &H2UpstreamKey,
    notify: &Arc<tokio::sync::Notify>,
) -> Result<()> {
    let mut openings = inner
        .openings
        .lock()
        .map_err(|_| anyhow!("h2 upstream opening map poisoned"))?;
    if openings
        .get(key)
        .is_some_and(|current| Arc::ptr_eq(current, notify))
    {
        openings.remove(key);
    }
    Ok(())
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

pub(super) async fn open_h2_connection(
    io: BoxedAsyncReadWrite,
) -> Result<(Arc<PooledH2Connection>, H2ConnectionLease)> {
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

    let send_request = pooled.send_request.clone();

    Ok((
        Arc::clone(&pooled),
        H2ConnectionLease {
            reservation: H2ConnectionReservation { connection: pooled },
            send_request,
        },
    ))
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

#[cfg(test)]
mod tests {
    use super::super::test_support::*;
    use super::*;

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
    async fn h2_upstream_first_opens_for_different_keys_run_in_parallel() -> Result<()> {
        let (started_tx, mut started_rx) = mpsc::unbounded_channel();
        let release_openers = Arc::new(tokio::sync::Notify::new());
        let release_openers_for_opener = Arc::clone(&release_openers);
        let opener: OpenUpstream = Arc::new(move |key| {
            let started_tx = started_tx.clone();
            let release_openers = Arc::clone(&release_openers_for_opener);
            Box::pin(async move {
                started_tx
                    .send(key.authority().to_string())
                    .map_err(|_| anyhow!("failed to send opener start"))?;
                release_openers.notified().await;
                let (io, _peer) = tokio::io::duplex(64);
                Ok(OpenedUpstream::new(
                    UpstreamProtocol::Http1,
                    Box::new(io) as BoxedAsyncReadWrite,
                ))
            })
        });
        let pool = H2UpstreamPool::new(opener);
        let first_key = test_h2_upstream_key("api.openai.com");
        let second_key = H2UpstreamKey::new(
            "api.anthropic.com".to_string(),
            std::net::SocketAddr::from(([127, 0, 0, 1], 443)),
        );

        let first_pool = pool.clone();
        let first_key_for_task = first_key.clone();
        let first_task = tokio::spawn(async move { first_pool.lease(&first_key_for_task).await });
        assert_eq!(
            started_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing first opener start"))?,
            "api.openai.com"
        );

        let second_pool = pool.clone();
        let second_key_for_task = second_key.clone();
        let second_task =
            tokio::spawn(async move { second_pool.lease(&second_key_for_task).await });
        let mut second_started = None;
        for _ in 0..16 {
            if let Ok(authority) = started_rx.try_recv() {
                second_started = Some(authority);
                break;
            }
            tokio::task::yield_now().await;
        }
        assert_eq!(second_started.as_deref(), Some("api.anthropic.com"));

        release_openers.notify_waiters();
        assert!(matches!(first_task.await??, UpstreamLease::Http1(_)));
        assert!(matches!(second_task.await??, UpstreamLease::Http1(_)));
        drop(pool);
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_failed_first_open_clears_opening_for_retry() -> Result<()> {
        let attempts = Arc::new(AtomicUsize::new(0));
        let opener: OpenUpstream = Arc::new(move |_key| {
            let attempts = Arc::clone(&attempts);
            Box::pin(async move {
                if attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                    return Err(anyhow!("test opener failure"));
                }
                let (io, _peer) = tokio::io::duplex(64);
                Ok(OpenedUpstream::new(
                    UpstreamProtocol::Http1,
                    Box::new(io) as BoxedAsyncReadWrite,
                ))
            })
        });
        let pool = H2UpstreamPool::new(opener);
        let key = test_h2_upstream_key("api.openai.com");

        assert!(pool.lease(&key).await.is_err());
        let retry = tokio::time::timeout(std::time::Duration::from_secs(1), pool.lease(&key))
            .await
            .context("retry lease timed out")??;
        assert!(matches!(retry, UpstreamLease::Http1(_)));
        drop(pool);
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_cancelled_first_open_clears_opening_for_retry() -> Result<()> {
        let attempts = Arc::new(AtomicUsize::new(0));
        let (started_tx, mut started_rx) = mpsc::unbounded_channel();
        let release_first = Arc::new(tokio::sync::Notify::new());
        let opener: OpenUpstream = Arc::new(move |_key| {
            let attempts = Arc::clone(&attempts);
            let started_tx = started_tx.clone();
            let release_first = Arc::clone(&release_first);
            Box::pin(async move {
                if attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                    started_tx
                        .send(())
                        .map_err(|_| anyhow!("failed to send opener start"))?;
                    release_first.notified().await;
                }
                let (io, _peer) = tokio::io::duplex(64);
                Ok(OpenedUpstream::new(
                    UpstreamProtocol::Http1,
                    Box::new(io) as BoxedAsyncReadWrite,
                ))
            })
        });
        let pool = H2UpstreamPool::new(opener);
        let key = test_h2_upstream_key("api.openai.com");

        let first_pool = pool.clone();
        let first_key = key.clone();
        let first_task = tokio::spawn(async move { first_pool.lease(&first_key).await });
        started_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("missing opener start"))?;
        first_task.abort();
        let _ = first_task.await;

        let retry = tokio::time::timeout(std::time::Duration::from_secs(1), pool.lease(&key))
            .await
            .context("retry lease timed out")??;
        assert!(matches!(retry, UpstreamLease::Http1(_)));
        drop(pool);
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
        let (pooled, lease) = open_h2_connection(Box::new(dsbx_io) as BoxedAsyncReadWrite).await?;
        let mut entries = HashMap::new();
        entries.entry(key).or_insert_with(Vec::new).push(pooled);
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
}
