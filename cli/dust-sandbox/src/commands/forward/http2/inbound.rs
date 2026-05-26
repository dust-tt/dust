use std::sync::Arc;

use anyhow::{Context, Result};
use bytes::Bytes;
use tokio::io::{AsyncRead, AsyncWrite};
use tracing::warn;

use crate::egress_secrets::SecretTable;

use super::super::http_framing::MAX_HEADER_BLOCK_BYTES;
use super::pool::H2UpstreamPool;
use super::stream::{handle_h2_stream, UpstreamBridge};
#[cfg(test)]
use super::OpenH1Upstream;
use super::{H2UpstreamKey, H2_INITIAL_WINDOW_SIZE, H2_MAX_CONCURRENT_STREAMS};

#[cfg(test)]
pub(in crate::commands::forward) async fn run_h2_to_h1_bridge<C>(
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

pub(in crate::commands::forward) async fn run_h2_to_upstream_bridge<C>(
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

#[cfg(test)]
mod tests {
    use super::super::test_support::*;
    use super::*;

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
}
