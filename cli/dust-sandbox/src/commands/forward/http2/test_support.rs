pub(super) use std::future::{poll_fn, Future};
pub(super) use std::pin::Pin;
pub(super) use std::sync::atomic::{AtomicUsize, Ordering};
pub(super) use std::sync::Arc;

pub(super) use anyhow::{anyhow, ensure, Context, Result};
pub(super) use base64::{engine::general_purpose, Engine};
pub(super) use bytes::Bytes;
pub(super) use h2::server::SendResponse;
pub(super) use h2::RecvStream;
pub(super) use http::{HeaderMap, HeaderValue, Request, Response, StatusCode};
pub(super) use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
pub(super) use tokio::sync::mpsc;
pub(super) use tracing::warn;

pub(super) use crate::egress_secrets::SecretTable;

pub(super) use super::super::test_support::{read_h2_body, secret_table_with_secret};
pub(super) use super::pool::{H2UpstreamPool, UpstreamLease};
pub(super) use super::{
    run_h2_to_h1_bridge, run_h2_to_upstream_bridge, send_data, BoxedAsyncReadWrite, H2UpstreamKey,
    OpenH1Upstream, OpenUpstream, OpenedUpstream, UpstreamProtocol,
};

pub(super) fn test_h1_opener(
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

pub(super) type TestH2Handler = Arc<
    dyn Fn(
            Request<RecvStream>,
            SendResponse<Bytes>,
        ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>
        + Send
        + Sync,
>;

pub(super) fn test_h2_early_response_handler() -> TestH2Handler {
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

pub(super) fn test_h2_upstream_pool<F>(
    handshake_count: Arc<AtomicUsize>,
    handler: F,
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
    test_h2_upstream_pool_with_settings(handshake_count, handler, None)
}

pub(super) fn test_h2_upstream_pool_with_settings<F>(
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

pub(super) fn test_h2_upstream_pool_with_settings_and_open_delay<F>(
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

pub(super) fn test_h2_pool_with_close_observer<F>(
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

pub(super) async fn send_direct_pooled_h2_get(
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

pub(super) async fn assert_upstream_connection_closed(
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

pub(super) fn assert_upstream_connection_still_open(
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
pub(super) struct H2RequestBodyObservation {
    pub(super) trailers_seen: bool,
    pub(super) reset_reason: Option<h2::Reason>,
}

pub(super) async fn observe_h2_request_body_close(
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

pub(super) async fn read_test_file_eventually(path: &std::path::Path) -> Result<String> {
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

pub(super) fn test_h1_fallback_pool(
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

pub(super) fn test_h2_goaway_pool(handshake_count: Arc<AtomicUsize>) -> H2UpstreamPool {
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

pub(super) fn test_h2_upstream_key(sni: &str) -> H2UpstreamKey {
    H2UpstreamKey::new(
        sni.to_string(),
        std::net::SocketAddr::from(([127, 0, 0, 1], 443)),
    )
}

pub(super) async fn wait_for_pool_active_streams(
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

pub(super) async fn pool_active_streams(pool: &H2UpstreamPool, key: &H2UpstreamKey) -> usize {
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

pub(super) async fn start_test_h2_upstream_bridge(
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

pub(super) async fn send_h2_response(
    mut respond: SendResponse<Bytes>,
    status: StatusCode,
    body: Bytes,
) -> Result<()> {
    let response = Response::builder().status(status).body(())?;
    let mut send = respond.send_response(response, false)?;
    send_data(&mut send, body, true).await
}

pub(super) fn test_h1_opener_capture_until_eof(
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

pub(super) fn test_h1_counting_opener(
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

pub(super) fn test_h1_opener_expect_continue(
    request_tx: mpsc::UnboundedSender<String>,
) -> OpenH1Upstream {
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

pub(super) fn test_h1_opener_early_final_response(
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

pub(super) fn test_h1_opener_bidirectional_stream(
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

pub(super) fn test_h1_opener_with_chunked_body(
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

pub(super) async fn read_test_h1_header_block<R>(
    reader: &mut R,
    request: &mut Vec<u8>,
) -> Result<()>
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

pub(super) async fn read_test_h1_chunk<R>(reader: &mut R, request: &mut Vec<u8>) -> Result<Vec<u8>>
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

pub(super) async fn read_test_h1_chunked_body<R>(
    reader: &mut R,
    request: &mut Vec<u8>,
) -> Result<()>
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

pub(super) async fn read_test_h1_chunked_body_after_chunks<R>(
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

pub(super) fn test_h1_opener_with_split_chunked_response(
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

pub(super) async fn read_test_crlf_line<R>(reader: &mut R) -> Result<Vec<u8>>
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

pub(super) fn parse_test_chunk_size(line: &[u8]) -> Result<usize> {
    let text = std::str::from_utf8(line).context("test chunk line should be utf8")?;
    let size = text
        .strip_suffix("\r\n")
        .ok_or_else(|| anyhow!("test chunk line missing CRLF"))?;
    usize::from_str_radix(size, 16).context("invalid test chunk size")
}

pub(super) async fn read_h2_settings<R>(reader: &mut R) -> Result<Vec<(u16, u32)>>
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
                let value = u32::from_be_bytes([setting[2], setting[3], setting[4], setting[5]]);
                Ok((id, value))
            })
            .collect();
    }
}

pub(super) async fn next_informational(
    response: &mut h2::client::ResponseFuture,
) -> Result<Response<()>> {
    tokio::time::timeout(
        std::time::Duration::from_secs(1),
        poll_fn(|cx| match response.poll_informational(cx) {
            std::task::Poll::Ready(Some(result)) => {
                std::task::Poll::Ready(result.context("failed to read h2 informational response"))
            }
            std::task::Poll::Ready(None) => {
                std::task::Poll::Ready(Err(anyhow!("no informational response available")))
            }
            std::task::Poll::Pending => std::task::Poll::Pending,
        }),
    )
    .await
    .context("timed out waiting for informational response")?
}

pub(super) fn h1_header_values<'a>(request_text: &'a str, name: &str) -> Vec<&'a str> {
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

pub(super) async fn assert_no_complete_chunked_request(
    request_rx: &mut mpsc::UnboundedReceiver<String>,
) -> Result<()> {
    let request_text =
        match tokio::time::timeout(std::time::Duration::from_secs(1), request_rx.recv()).await {
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

pub(super) fn assert_h2_reset(error: h2::Error) {
    assert!(
        error.reason().is_some(),
        "expected h2 reset reason, got: {error}"
    );
}

pub(super) fn assert_h2_reset_reason(error: h2::Error, reason: h2::Reason) {
    assert_eq!(
        error.reason(),
        Some(reason),
        "unexpected h2 reset reason: {error}"
    );
}
