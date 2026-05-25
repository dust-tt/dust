use std::sync::Arc;

use anyhow::{Context, Result};
use rustls::pki_types::ServerName;
#[cfg(test)]
use rustls::{ClientConfig, RootCertStore};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpStream;
use tokio_rustls::{TlsAcceptor, TlsConnector};
use tracing::info;

use crate::egress_secrets::SecretTable;

use super::deny_log::append_deny_log;
use super::http2::{
    run_h2_to_upstream_bridge, BoxedAsyncReadWrite, H2UpstreamKey, H2UpstreamPool, OpenUpstream,
    OpenedUpstream, UpstreamProtocol,
};
use super::http_rewriter::{
    copy_responses_with_websocket_watch, forward_http1_requests, HttpRewriteError,
};
use super::proxy_tunnel::{
    open_allowed_proxy_tunnel, open_allowed_proxy_tunnel_from_context, OpenProxyTunnel,
    ProxyTunnelOpenContext,
};
use super::rewrite_policy::RewriteMode as HttpRewriteMode;
#[cfg(test)]
use super::tls_mitm::MitmCa;
use super::tls_mitm::H2_ALPN;
#[cfg(test)]
use super::tls_mitm::HTTP_1_1_ALPN;
use super::ForwardRuntime;

#[derive(Clone)]
pub(super) struct PooledUpstreamOpenContext {
    pub(super) proxy_tunnel: ProxyTunnelOpenContext,
    pub(super) mitm_h2_tls_connector: TlsConnector,
}

pub(super) fn pooled_upstream_opener(context: PooledUpstreamOpenContext) -> OpenUpstream {
    Arc::new(move |key| {
        let context = context.clone();
        Box::pin(async move {
            let proxy_stream =
                open_allowed_proxy_tunnel_from_context(&context.proxy_tunnel, key.authority(), 443)
                    .await
                    .context("failed to open pooled proxy tunnel")?;
            let upstream_tls = connect_mitm_upstream_tls_with_connector(
                &context.mitm_h2_tls_connector,
                key.authority(),
                proxy_stream,
            )
            .await
            .context("failed to establish pooled upstream TLS")?;
            let protocol = match upstream_tls.get_ref().1.alpn_protocol() {
                Some(protocol) if protocol == H2_ALPN => UpstreamProtocol::H2,
                _ => UpstreamProtocol::Http1,
            };
            Ok(OpenedUpstream::new(
                protocol,
                Box::new(upstream_tls) as BoxedAsyncReadWrite,
            ))
        })
    })
}

pub(super) fn mitm_target_for<'a>(
    original_port: u16,
    domain: &'a str,
    secret_table: &SecretTable,
) -> Option<&'a str> {
    if original_port != 443 || !secret_table.sni_match_set.matches(domain) {
        return None;
    }

    Some(domain)
}

pub(super) async fn run_mitm_session<C>(
    runtime: &ForwardRuntime,
    sni: &str,
    upstream_socket_addr: std::net::SocketAddr,
    client_stream: C,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let runtime = runtime.clone();
    let sni = sni.to_string();
    let runtime_for_opener = runtime.clone();
    let opener_sni = sni.clone();
    let opener: OpenProxyTunnel<tokio_rustls::client::TlsStream<TcpStream>> = Arc::new(move || {
        let runtime = runtime_for_opener.clone();
        let sni = opener_sni.clone();
        Box::pin(async move { open_allowed_proxy_tunnel(&runtime, &sni, 443).await })
    });
    run_mitm_session_with_proxy_opener_and_h2_pool(
        &runtime,
        &sni,
        upstream_socket_addr,
        client_stream,
        opener,
        runtime.h2_upstream_pool.clone(),
    )
    .await
}

#[cfg(test)]
async fn run_mitm_session_with_proxy_opener<C, S>(
    runtime: &ForwardRuntime,
    sni: &str,
    client_stream: C,
    open_proxy_tunnel: OpenProxyTunnel<S>,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let h2_pool = h2_pool_for_proxy_opener(runtime, sni, Arc::clone(&open_proxy_tunnel));
    let upstream_socket_addr = std::net::SocketAddr::from(([127, 0, 0, 1], 443));
    run_mitm_session_with_proxy_opener_and_h2_pool(
        runtime,
        sni,
        upstream_socket_addr,
        client_stream,
        open_proxy_tunnel,
        h2_pool,
    )
    .await
}

async fn run_mitm_session_with_proxy_opener_and_h2_pool<C, S>(
    runtime: &ForwardRuntime,
    sni: &str,
    upstream_socket_addr: std::net::SocketAddr,
    client_stream: C,
    open_proxy_tunnel: OpenProxyTunnel<S>,
    h2_upstream_pool: H2UpstreamPool,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let server_config = runtime
        .mitm_ca
        .server_config_for(sni)
        .await
        .context("failed to build MITM server config for SNI")?;
    let acceptor = TlsAcceptor::from(server_config);
    let agent_tls = acceptor
        .accept(client_stream)
        .await
        .context("failed to accept agent TLS for MITM")?;

    let inbound_alpn = agent_tls
        .get_ref()
        .1
        .alpn_protocol()
        .map(|value| value.to_vec());
    if inbound_alpn.as_deref() == Some(H2_ALPN) {
        info!(
            domain = sni,
            inbound_alpn = "h2",
            outbound_alpn = "h2,http/1.1",
            "starting h2 MITM bridge session"
        );
        let secret_table = Arc::clone(&runtime.secret_table);
        let deny_log = Arc::clone(&runtime.deny_log);
        let key = H2UpstreamKey::new(sni.to_string(), upstream_socket_addr);
        return run_h2_to_upstream_bridge(
            agent_tls,
            sni.to_string(),
            secret_table,
            deny_log,
            h2_upstream_pool,
            key,
        )
        .await;
    }

    info!(
        domain = sni,
        inbound_alpn = "http/1.1",
        outbound_alpn = "http/1.1",
        "starting h1 MITM session"
    );
    let proxy_stream = open_proxy_tunnel()
        .await
        .context("failed to open MITM proxy tunnel")?;
    let upstream_tls = connect_mitm_upstream_tls(runtime, sni, proxy_stream)
        .await
        .context("failed to establish MITM TLS to upstream via proxy tunnel")?;

    run_rewritten_http_session(
        runtime,
        HttpRewriteMode::Tls { sni },
        agent_tls,
        upstream_tls,
    )
    .await
}

#[cfg(test)]
fn h2_pool_for_proxy_opener<S>(
    runtime: &ForwardRuntime,
    sni: &str,
    open_proxy_tunnel: OpenProxyTunnel<S>,
) -> H2UpstreamPool
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let runtime = runtime.clone();
    let sni = sni.to_string();
    let opener: OpenUpstream = Arc::new(move |_key| {
        let runtime = runtime.clone();
        let sni = sni.clone();
        let open_proxy_tunnel = Arc::clone(&open_proxy_tunnel);
        Box::pin(async move {
            let proxy_stream = open_proxy_tunnel()
                .await
                .context("failed to open test proxy tunnel")?;
            let upstream_tls = connect_mitm_upstream_tls_with_connector(
                &runtime.mitm_h2_tls_connector,
                &sni,
                proxy_stream,
            )
            .await
            .context("failed to establish test upstream TLS")?;
            let protocol = match upstream_tls.get_ref().1.alpn_protocol() {
                Some(protocol) if protocol == H2_ALPN => UpstreamProtocol::H2,
                _ => UpstreamProtocol::Http1,
            };
            Ok(OpenedUpstream::new(
                protocol,
                Box::new(upstream_tls) as BoxedAsyncReadWrite,
            ))
        })
    });
    H2UpstreamPool::new(opener)
}

async fn connect_mitm_upstream_tls<S>(
    runtime: &ForwardRuntime,
    sni: &str,
    proxy_stream: S,
) -> Result<tokio_rustls::client::TlsStream<S>>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    connect_mitm_upstream_tls_with_connector(&runtime.mitm_http1_tls_connector, sni, proxy_stream)
        .await
}

async fn connect_mitm_upstream_tls_with_connector<S>(
    connector: &TlsConnector,
    sni: &str,
    proxy_stream: S,
) -> Result<tokio_rustls::client::TlsStream<S>>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let upstream_server_name =
        ServerName::try_from(sni.to_string()).context("invalid upstream SNI for MITM TLS")?;
    connector
        .connect(upstream_server_name, proxy_stream)
        .await
        .context("failed to establish MITM TLS to upstream via proxy tunnel")
}

pub(super) async fn run_plain_http_session<C, S>(
    runtime: &ForwardRuntime,
    domain: &str,
    client_stream: C,
    proxy_stream: S,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    run_rewritten_http_session(
        runtime,
        HttpRewriteMode::PlainHttp { domain },
        client_stream,
        proxy_stream,
    )
    .await
}

async fn run_rewritten_http_session<'a, C, S>(
    runtime: &'a ForwardRuntime,
    mode: HttpRewriteMode<'a>,
    client_stream: C,
    upstream_stream: S,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let (mut client_read, mut client_write) = tokio::io::split(client_stream);
    let (mut upstream_read, mut upstream_write) = tokio::io::split(upstream_stream);
    let (websocket_watch_tx, websocket_watch_rx) = tokio::sync::mpsc::channel(1);
    let mut response_task = tokio::spawn(async move {
        copy_responses_with_websocket_watch(
            &mut upstream_read,
            &mut client_write,
            websocket_watch_rx,
        )
        .await
    });

    tokio::select! {
        request_result = forward_http1_requests(
            &mut client_read,
            &mut upstream_write,
            &runtime.secret_table,
            mode,
            &websocket_watch_tx,
        ) => {
            match request_result {
                Ok(()) => {
                    response_task.await.context("response copy task panicked")?
                }
                Err(HttpRewriteError::Denied(entry)) => {
                    response_task.abort();
                    append_deny_log(&runtime.deny_log, entry)
                        .await
                        .context("failed to append MITM deny log entry")?;
                    Ok(())
                }
                Err(HttpRewriteError::Io(error)) => {
                    response_task.abort();
                    Err(error).context("HTTP rewrite failed")
                }
            }
        }
        response_result = &mut response_task => {
            response_result.context("response copy task panicked")?
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;

    use anyhow::{ensure, Context, Result};
    use rcgen::{
        BasicConstraints, CertificateParams, DistinguishedName, DnType, IsCa, KeyPair,
        KeyUsagePurpose, SanType,
    };
    use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName};
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

    use crate::egress_secrets::{DomainSet, Secret};

    use super::super::*;
    use super::*;

    #[test]
    fn mitm_target_matches_exact_and_wildcard_secret_domains() -> Result<()> {
        let table = secret_table(&["api.openai.com", "*.googleapis.com"])?;

        assert_eq!(
            mitm_target_for(443, "api.openai.com", &table),
            Some("api.openai.com")
        );
        assert_eq!(
            mitm_target_for(443, "storage.googleapis.com", &table),
            Some("storage.googleapis.com")
        );
        assert_eq!(mitm_target_for(443, "googleapis.com", &table), None);
        assert_eq!(mitm_target_for(80, "api.openai.com", &table), None);

        Ok(())
    }

    #[test]
    fn mitm_target_is_empty_without_loaded_secrets() {
        assert_eq!(
            mitm_target_for(443, "api.openai.com", &SecretTable::default()),
            None
        );
    }

    #[tokio::test]
    async fn mitm_session_copies_decrypted_bytes_unchanged() -> Result<()> {
        let sni = "api.openai.com";
        let mitm_ca = Arc::new(MitmCa::generate()?);
        let (upstream_server_config, upstream_ca_der) = test_upstream_server_config(sni)?;
        let runtime = test_runtime(Arc::clone(&mitm_ca), upstream_ca_der)?;

        let (agent_client_io, agent_dsbx_io) = tokio::io::duplex(4096);
        let (dsbx_proxy_io, upstream_server_io) = tokio::io::duplex(4096);

        let upstream_task = tokio::spawn(async move {
            let acceptor = TlsAcceptor::from(upstream_server_config);
            let mut tls = acceptor
                .accept(upstream_server_io)
                .await
                .context("test upstream failed to accept TLS")?;
            ensure!(
                tls.get_ref().1.alpn_protocol() == Some(HTTP_1_1_ALPN),
                "test upstream did not negotiate http/1.1"
            );

            let mut request = [0_u8; 4];
            tls.read_exact(&mut request)
                .await
                .context("test upstream failed to read request bytes")?;
            assert_eq!(&request, b"ping");
            tls.write_all(b"pong")
                .await
                .context("test upstream failed to write response bytes")?;
            let mut tail = Vec::new();
            tls.read_to_end(&mut tail)
                .await
                .context("test upstream failed to read client close")?;
            tls.shutdown()
                .await
                .context("test upstream failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        let agent_connector =
            test_tls_connector(mitm_ca.ca_cert_der(), vec![HTTP_1_1_ALPN.to_vec()])?;
        let agent_task = tokio::spawn(async move {
            let server_name =
                ServerName::try_from(sni.to_string()).context("invalid test agent SNI")?;
            let mut tls = agent_connector
                .connect(server_name, agent_client_io)
                .await
                .context("test agent failed to connect to dsbx MITM")?;
            ensure!(
                tls.get_ref().1.alpn_protocol() == Some(HTTP_1_1_ALPN),
                "test agent did not negotiate http/1.1"
            );

            tls.write_all(b"ping")
                .await
                .context("test agent failed to write request bytes")?;
            let mut response = [0_u8; 4];
            tls.read_exact(&mut response)
                .await
                .context("test agent failed to read response bytes")?;
            assert_eq!(&response, b"pong");
            tls.shutdown()
                .await
                .context("test agent failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        run_mitm_session_with_proxy_opener(
            &runtime,
            sni,
            agent_dsbx_io,
            single_proxy_opener(dsbx_proxy_io),
        )
        .await?;
        agent_task.await.context("test agent task panicked")??;
        upstream_task
            .await
            .context("test upstream task panicked")??;

        Ok(())
    }

    #[tokio::test]
    async fn mitm_session_substitutes_http_headers() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_0123456789abcdef0123456789abcdef__";
        let mitm_ca = Arc::new(MitmCa::generate()?);
        let (upstream_server_config, upstream_ca_der) = test_upstream_server_config(sni)?;
        let mut runtime = test_runtime(Arc::clone(&mitm_ca), upstream_ca_der)?;
        runtime.secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &["api.openai.com"],
        )?);

        let (agent_client_io, agent_dsbx_io) = tokio::io::duplex(16 * 1024);
        let (dsbx_proxy_io, upstream_server_io) = tokio::io::duplex(16 * 1024);

        let upstream_task = tokio::spawn(async move {
            let acceptor = TlsAcceptor::from(upstream_server_config);
            let mut tls = acceptor
                .accept(upstream_server_io)
                .await
                .context("test upstream failed to accept TLS")?;

            let mut request = Vec::new();
            loop {
                let mut byte = [0_u8; 1];
                tls.read_exact(&mut byte)
                    .await
                    .context("test upstream failed to read request byte")?;
                request.push(byte[0]);
                if request.ends_with(b"\r\n\r\n") {
                    break;
                }
            }

            let request_text = String::from_utf8(request).context("request should be utf8")?;
            assert!(request_text.contains("Authorization: Bearer sk-real\r\n"));
            assert!(!request_text.contains(placeholder));

            tls.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .await
                .context("test upstream failed to write response")?;
            tls.shutdown()
                .await
                .context("test upstream failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        let agent_connector =
            test_tls_connector(mitm_ca.ca_cert_der(), vec![HTTP_1_1_ALPN.to_vec()])?;
        let request =
            format!("GET / HTTP/1.1\r\nHost: {sni}\r\nAuthorization: Bearer {placeholder}\r\n\r\n");
        let agent_task = tokio::spawn(async move {
            let server_name =
                ServerName::try_from(sni.to_string()).context("invalid test agent SNI")?;
            let mut tls = agent_connector
                .connect(server_name, agent_client_io)
                .await
                .context("test agent failed to connect to dsbx MITM")?;
            tls.write_all(request.as_bytes())
                .await
                .context("test agent failed to write request")?;

            let mut response = Vec::new();
            let mut buffer = [0_u8; 1024];
            loop {
                let bytes_read = tls
                    .read(&mut buffer)
                    .await
                    .context("test agent failed to read response")?;
                if bytes_read == 0 {
                    break;
                }
                response.extend_from_slice(&buffer[..bytes_read]);
                if response.ends_with(b"\r\n\r\nok") {
                    break;
                }
            }
            assert!(String::from_utf8(response)?.contains("\r\n\r\nok"));
            Ok::<(), anyhow::Error>(())
        });

        run_mitm_session_with_proxy_opener(
            &runtime,
            sni,
            agent_dsbx_io,
            single_proxy_opener(dsbx_proxy_io),
        )
        .await?;
        agent_task.await.context("test agent task panicked")??;
        upstream_task
            .await
            .context("test upstream task panicked")??;

        Ok(())
    }

    #[tokio::test]
    async fn mitm_session_routes_h2_alpn_through_h2_bridge() -> Result<()> {
        let sni = "api.openai.com";
        let mitm_ca = Arc::new(MitmCa::generate()?);
        let (upstream_server_config, upstream_ca_der) = test_upstream_server_config(sni)?;
        let mut runtime = test_runtime(Arc::clone(&mitm_ca), upstream_ca_der)?;
        runtime.secret_table = Arc::new(secret_table(&[sni])?);

        let (agent_client_io, agent_dsbx_io) = tokio::io::duplex(16 * 1024);
        let (dsbx_proxy_io, upstream_server_io) = tokio::io::duplex(16 * 1024);

        let upstream_task = tokio::spawn(async move {
            let acceptor = TlsAcceptor::from(upstream_server_config);
            let mut tls = acceptor
                .accept(upstream_server_io)
                .await
                .context("test upstream failed to accept TLS")?;
            ensure!(
                tls.get_ref().1.alpn_protocol() == Some(HTTP_1_1_ALPN),
                "test upstream did not negotiate http/1.1"
            );

            let mut request = Vec::new();
            loop {
                let mut byte = [0_u8; 1];
                tls.read_exact(&mut byte)
                    .await
                    .context("test upstream failed to read request byte")?;
                request.push(byte[0]);
                if request.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            let request_text = String::from_utf8(request).context("request should be utf8")?;
            assert!(request_text.contains("GET /h2-mitm HTTP/1.1\r\n"));
            assert!(request_text.contains("Host: api.openai.com\r\n"));

            tls.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
                .await
                .context("test upstream failed to write response")?;
            tls.shutdown()
                .await
                .context("test upstream failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        let agent_connector = test_tls_connector(
            mitm_ca.ca_cert_der(),
            vec![H2_ALPN.to_vec(), HTTP_1_1_ALPN.to_vec()],
        )?;
        let agent_task = tokio::spawn(async move {
            let server_name =
                ServerName::try_from(sni.to_string()).context("invalid test agent SNI")?;
            let tls = agent_connector
                .connect(server_name, agent_client_io)
                .await
                .context("test agent failed to connect to dsbx MITM")?;
            ensure!(
                tls.get_ref().1.alpn_protocol() == Some(H2_ALPN),
                "test agent did not negotiate h2"
            );

            let (mut send_request, connection) = h2::client::handshake(tls).await?;
            let connection_task = tokio::spawn(connection);
            let request = http::Request::builder()
                .method("GET")
                .uri(format!("https://{sni}/h2-mitm"))
                .body(())?;
            let (response, _stream) = send_request.send_request(request, true)?;
            let response = response.await?;
            assert_eq!(response.status(), http::StatusCode::OK);
            assert_eq!(read_h2_body(response.into_body()).await?, b"ok");
            drop(send_request);
            connection_task.abort();
            Ok::<(), anyhow::Error>(())
        });

        run_mitm_session_with_proxy_opener(
            &runtime,
            sni,
            agent_dsbx_io,
            single_proxy_opener(dsbx_proxy_io),
        )
        .await?;
        agent_task.await.context("test agent task panicked")??;
        upstream_task
            .await
            .context("test upstream task panicked")??;

        Ok(())
    }

    #[tokio::test]
    async fn mitm_session_routes_h2_client_to_h2_upstream_end_to_end() -> Result<()> {
        let sni = "api.openai.com";
        let mitm_ca = Arc::new(MitmCa::generate()?);
        let (upstream_server_config, upstream_ca_der) =
            test_upstream_server_config_with_alpn(sni, vec![H2_ALPN.to_vec()])?;
        let mut runtime = test_runtime(Arc::clone(&mitm_ca), upstream_ca_der)?;
        runtime.secret_table = Arc::new(secret_table(&[sni])?);

        let (agent_client_io, agent_dsbx_io) = tokio::io::duplex(16 * 1024);
        let (dsbx_proxy_io, upstream_server_io) = tokio::io::duplex(16 * 1024);

        let upstream_task = tokio::spawn(async move {
            let acceptor = TlsAcceptor::from(upstream_server_config);
            let tls = acceptor
                .accept(upstream_server_io)
                .await
                .context("test upstream failed to accept TLS")?;
            ensure!(
                tls.get_ref().1.alpn_protocol() == Some(H2_ALPN),
                "test upstream did not negotiate h2"
            );
            let mut connection = h2::server::handshake(tls).await?;
            let (request, mut respond) = connection
                .accept()
                .await
                .ok_or_else(|| anyhow::anyhow!("missing upstream h2 request"))??;
            assert_eq!(request.uri().path(), "/h2-upstream");
            let response = http::Response::builder()
                .status(http::StatusCode::OK)
                .body(())?;
            let mut send = respond.send_response(response, false)?;
            send.send_data(bytes::Bytes::from_static(b"ok"), true)?;
            connection.graceful_shutdown();
            let _ =
                tokio::time::timeout(std::time::Duration::from_millis(100), connection.accept())
                    .await;
            Ok::<(), anyhow::Error>(())
        });

        let agent_connector = test_tls_connector(
            mitm_ca.ca_cert_der(),
            vec![H2_ALPN.to_vec(), HTTP_1_1_ALPN.to_vec()],
        )?;
        let agent_task = tokio::spawn(async move {
            let server_name =
                ServerName::try_from(sni.to_string()).context("invalid test agent SNI")?;
            let tls = agent_connector
                .connect(server_name, agent_client_io)
                .await
                .context("test agent failed to connect to dsbx MITM")?;
            ensure!(
                tls.get_ref().1.alpn_protocol() == Some(H2_ALPN),
                "test agent did not negotiate h2"
            );

            let (mut send_request, connection) = h2::client::handshake(tls).await?;
            let connection_task = tokio::spawn(connection);
            let request = http::Request::builder()
                .method("GET")
                .uri(format!("https://{sni}/h2-upstream"))
                .body(())?;
            let (response, _stream) = send_request.send_request(request, true)?;
            let response = response.await?;
            assert_eq!(response.status(), http::StatusCode::OK);
            assert_eq!(read_h2_body(response.into_body()).await?, b"ok");
            drop(send_request);
            connection_task.abort();
            Ok::<(), anyhow::Error>(())
        });

        run_mitm_session_with_proxy_opener(
            &runtime,
            sni,
            agent_dsbx_io,
            single_proxy_opener(dsbx_proxy_io),
        )
        .await?;
        agent_task.await.context("test agent task panicked")??;
        upstream_task
            .await
            .context("test upstream task panicked")??;

        Ok(())
    }

    #[tokio::test]
    async fn mitm_session_completes_websocket_upgrade_when_upstream_returns_101() -> Result<()> {
        let sni = "api.openai.com";
        let mitm_ca = Arc::new(MitmCa::generate()?);
        let (upstream_server_config, upstream_ca_der) = test_upstream_server_config(sni)?;
        let mut runtime = test_runtime(Arc::clone(&mitm_ca), upstream_ca_der)?;
        runtime.secret_table = Arc::new(secret_table(&[sni])?);

        let (agent_client_io, agent_dsbx_io) = tokio::io::duplex(16 * 1024);
        let (dsbx_proxy_io, upstream_server_io) = tokio::io::duplex(16 * 1024);

        let upstream_task = tokio::spawn(async move {
            let acceptor = TlsAcceptor::from(upstream_server_config);
            let mut tls = acceptor
                .accept(upstream_server_io)
                .await
                .context("test upstream failed to accept TLS")?;

            let mut request = Vec::new();
            loop {
                let mut byte = [0_u8; 1];
                tls.read_exact(&mut byte)
                    .await
                    .context("test upstream failed to read request byte")?;
                request.push(byte[0]);
                if request.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            let request_text = String::from_utf8(request).context("request should be utf8")?;
            assert!(request_text.contains("Upgrade: websocket\r\n"));

            tls.write_all(
                b"HTTP/1.1 101 Switching Protocols\r\n\
                  Upgrade: websocket\r\n\
                  Connection: Upgrade\r\n\
                  \r\n\
                  server-frame",
            )
            .await
            .context("test upstream failed to write 101")?;

            let mut frame = [0_u8; b"client-frame".len()];
            tls.read_exact(&mut frame)
                .await
                .context("test upstream failed to read raw client frame")?;
            assert_eq!(&frame, b"client-frame");

            tls.shutdown()
                .await
                .context("test upstream failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        let agent_connector =
            test_tls_connector(mitm_ca.ca_cert_der(), vec![HTTP_1_1_ALPN.to_vec()])?;
        let agent_task = tokio::spawn(async move {
            let server_name =
                ServerName::try_from(sni.to_string()).context("invalid test agent SNI")?;
            let mut tls = agent_connector
                .connect(server_name, agent_client_io)
                .await
                .context("test agent failed to connect to dsbx MITM")?;

            tls.write_all(
                format!(
                    "GET /realtime HTTP/1.1\r\nHost: {sni}\r\n\
                     Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n"
                )
                .as_bytes(),
            )
            .await
            .context("test agent failed to write upgrade request")?;

            let mut response = Vec::new();
            let mut buffer = [0_u8; 256];
            loop {
                let bytes_read = tls
                    .read(&mut buffer)
                    .await
                    .context("test agent failed to read response")?;
                if bytes_read == 0 {
                    break;
                }
                response.extend_from_slice(&buffer[..bytes_read]);
                if response.ends_with(b"server-frame") {
                    break;
                }
            }
            let response_text =
                String::from_utf8(response).context("upgrade response should be utf8")?;
            assert!(response_text.starts_with("HTTP/1.1 101 Switching Protocols\r\n"));
            assert!(response_text.ends_with("server-frame"));

            tls.write_all(b"client-frame")
                .await
                .context("test agent failed to write raw frame")?;
            tls.shutdown()
                .await
                .context("test agent failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        run_mitm_session_with_proxy_opener(
            &runtime,
            sni,
            agent_dsbx_io,
            single_proxy_opener(dsbx_proxy_io),
        )
        .await?;
        agent_task.await.context("test agent task panicked")??;
        upstream_task
            .await
            .context("test upstream task panicked")??;

        Ok(())
    }

    #[tokio::test]
    async fn mitm_session_does_not_splice_client_frames_when_upgrade_rejected() -> Result<()> {
        let sni = "api.openai.com";
        let mitm_ca = Arc::new(MitmCa::generate()?);
        let (upstream_server_config, upstream_ca_der) = test_upstream_server_config(sni)?;
        let mut runtime = test_runtime(Arc::clone(&mitm_ca), upstream_ca_der)?;
        runtime.secret_table = Arc::new(secret_table(&[sni])?);

        let (agent_client_io, agent_dsbx_io) = tokio::io::duplex(16 * 1024);
        let (dsbx_proxy_io, upstream_server_io) = tokio::io::duplex(16 * 1024);

        let upstream_task = tokio::spawn(async move {
            let acceptor = TlsAcceptor::from(upstream_server_config);
            let mut tls = acceptor
                .accept(upstream_server_io)
                .await
                .context("test upstream failed to accept TLS")?;

            let mut request = Vec::new();
            loop {
                let mut byte = [0_u8; 1];
                tls.read_exact(&mut byte)
                    .await
                    .context("test upstream failed to read request byte")?;
                request.push(byte[0]);
                if request.ends_with(b"\r\n\r\n") {
                    break;
                }
            }

            tls.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nrejected",
            )
            .await
            .context("test upstream failed to write 200")?;

            // After the rejection, dsbx must shut down the upstream write
            // half, so anything the agent tries to send afterwards must not
            // arrive. Drain to EOF and assert nothing follows the upgrade
            // request bytes already consumed.
            let mut tail = Vec::new();
            tls.read_to_end(&mut tail)
                .await
                .context("test upstream failed to read tail")?;
            assert!(
                tail.is_empty(),
                "no client bytes should have been spliced after rejection, got {:?}",
                tail
            );

            tls.shutdown()
                .await
                .context("test upstream failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        let agent_connector =
            test_tls_connector(mitm_ca.ca_cert_der(), vec![HTTP_1_1_ALPN.to_vec()])?;
        let agent_task = tokio::spawn(async move {
            let server_name =
                ServerName::try_from(sni.to_string()).context("invalid test agent SNI")?;
            let mut tls = agent_connector
                .connect(server_name, agent_client_io)
                .await
                .context("test agent failed to connect to dsbx MITM")?;

            tls.write_all(
                format!(
                    "GET /realtime HTTP/1.1\r\nHost: {sni}\r\n\
                     Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n"
                )
                .as_bytes(),
            )
            .await
            .context("test agent failed to write upgrade request")?;

            let mut response = Vec::new();
            let mut buffer = [0_u8; 256];
            loop {
                let bytes_read = tls
                    .read(&mut buffer)
                    .await
                    .context("test agent failed to read rejection")?;
                if bytes_read == 0 {
                    break;
                }
                response.extend_from_slice(&buffer[..bytes_read]);
                if response.ends_with(b"rejected") {
                    break;
                }
            }
            let response_text = String::from_utf8(response).context("rejection should be utf8")?;
            assert!(response_text.starts_with("HTTP/1.1 200 OK\r\n"));

            // The agent attempts to send post-upgrade frames; dsbx must drop
            // them on the floor because upstream did not accept the upgrade.
            let _ = tls.write_all(b"client-frame").await;
            let _ = tls.shutdown().await;
            Ok::<(), anyhow::Error>(())
        });

        run_mitm_session_with_proxy_opener(
            &runtime,
            sni,
            agent_dsbx_io,
            single_proxy_opener(dsbx_proxy_io),
        )
        .await?;
        agent_task.await.context("test agent task panicked")??;
        upstream_task
            .await
            .context("test upstream task panicked")??;

        Ok(())
    }

    // SNI-miss path: dsbx does not terminate, just splices. The agent's TLS
    // client must see the upstream's real cert chain (not the dsbx CA),
    // which is the load-bearing property of the splice branch.
    #[tokio::test]
    async fn splice_session_preserves_upstream_chain() -> Result<()> {
        let sni = "other.com";
        let mitm_ca = Arc::new(MitmCa::generate()?);
        let (upstream_server_config, upstream_ca_der) = test_upstream_server_config(sni)?;

        // Empty allowlist union means the branch decision is splice for any SNI.
        let secret_table = SecretTable::default();
        assert_eq!(mitm_target_for(443, sni, &secret_table), None);

        let (agent_client_io, mut agent_dsbx_io) = tokio::io::duplex(4096);
        let (mut dsbx_proxy_io, upstream_server_io) = tokio::io::duplex(4096);

        let upstream_task = tokio::spawn(async move {
            let acceptor = TlsAcceptor::from(upstream_server_config);
            let mut tls = acceptor
                .accept(upstream_server_io)
                .await
                .context("test upstream failed to accept TLS")?;

            let mut request = [0_u8; 4];
            tls.read_exact(&mut request)
                .await
                .context("test upstream failed to read request bytes")?;
            assert_eq!(&request, b"ping");
            tls.write_all(b"pong")
                .await
                .context("test upstream failed to write response bytes")?;
            let mut tail = Vec::new();
            tls.read_to_end(&mut tail)
                .await
                .context("test upstream failed to read client close")?;
            tls.shutdown()
                .await
                .context("test upstream failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        // Trust ONLY the upstream's real CA. If dsbx silently terminated and
        // re-signed with its own CA, the agent connect would fail.
        let agent_connector = test_tls_connector(upstream_ca_der, Vec::new())?;
        let mitm_ca_subject = mitm_ca.ca_cert_der();
        let agent_task = tokio::spawn(async move {
            let server_name =
                ServerName::try_from(sni.to_string()).context("invalid test agent SNI")?;
            let mut tls = agent_connector
                .connect(server_name, agent_client_io)
                .await
                .context("test agent failed to connect through dsbx splice")?;

            let observed_chain = tls.get_ref().1.peer_certificates().unwrap_or(&[]);
            let observed_leaf = observed_chain.first().expect("expected leaf cert").to_vec();
            assert_ne!(
                observed_leaf,
                mitm_ca_subject.to_vec(),
                "splice path leaked the dsbx MITM CA into the agent's TLS view"
            );

            tls.write_all(b"ping")
                .await
                .context("test agent failed to write request bytes")?;
            let mut response = [0_u8; 4];
            tls.read_exact(&mut response)
                .await
                .context("test agent failed to read response bytes")?;
            assert_eq!(&response, b"pong");
            tls.shutdown()
                .await
                .context("test agent failed to shut down TLS")?;
            Ok::<(), anyhow::Error>(())
        });

        tokio::io::copy_bidirectional(&mut agent_dsbx_io, &mut dsbx_proxy_io)
            .await
            .ok();
        agent_task.await.context("test agent task panicked")??;
        upstream_task
            .await
            .context("test upstream task panicked")??;

        // Silence the dead variable warning when MitmCa stays unused on this path.
        let _ = mitm_ca;
        Ok(())
    }

    fn single_proxy_opener<S>(stream: S) -> OpenProxyTunnel<S>
    where
        S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    {
        let stream = Arc::new(tokio::sync::Mutex::new(Some(stream)));
        Arc::new(move || {
            let stream = Arc::clone(&stream);
            Box::pin(async move {
                stream
                    .lock()
                    .await
                    .take()
                    .ok_or_else(|| anyhow::anyhow!("test proxy opener reused"))
            })
        })
    }

    async fn read_h2_body(mut body: h2::RecvStream) -> Result<Vec<u8>> {
        let mut output = Vec::new();
        while let Some(chunk) = body.data().await {
            let chunk = chunk?;
            output.extend_from_slice(&chunk);
            body.flow_control().release_capacity(chunk.len())?;
        }
        ensure!(body.trailers().await?.is_none(), "unexpected trailers");
        Ok(output)
    }

    fn secret_table(patterns: &[&str]) -> Result<SecretTable> {
        let allowed_domains = patterns
            .iter()
            .map(|pattern| (*pattern).to_string())
            .collect::<Vec<_>>();
        Ok(SecretTable {
            by_placeholder: HashMap::new(),
            sni_match_set: DomainSet::from_patterns(&allowed_domains)?,
        })
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

    fn test_runtime(
        mitm_ca: Arc<MitmCa>,
        upstream_ca_der: CertificateDer<'static>,
    ) -> Result<ForwardRuntime> {
        let tls_connector = test_tls_connector(upstream_ca_der.clone(), Vec::new())?;
        let mitm_http1_tls_connector =
            test_tls_connector(upstream_ca_der.clone(), vec![HTTP_1_1_ALPN.to_vec()])?;
        let mitm_h2_tls_connector = test_tls_connector(
            upstream_ca_der,
            vec![H2_ALPN.to_vec(), HTTP_1_1_ALPN.to_vec()],
        )?;
        let dummy_opener: OpenUpstream = Arc::new(|_key| {
            Box::pin(async {
                Err(anyhow::anyhow!(
                    "unexpected pooled upstream open in test runtime"
                ))
            })
        });

        Ok(ForwardRuntime {
            token: Arc::<str>::from("token"),
            proxy_addr: "127.0.0.1:1".parse()?,
            proxy_tls_name: Arc::<str>::from("proxy.test"),
            deny_log: Arc::new(PathBuf::from("/tmp/dust-egress-denied-test.log")),
            secret_table: Arc::new(SecretTable::default()),
            tls_connector,
            mitm_http1_tls_connector,
            mitm_h2_tls_connector,
            h2_upstream_pool: H2UpstreamPool::new(dummy_opener),
            mitm_ca,
        })
    }

    fn test_tls_connector(
        root: CertificateDer<'static>,
        alpn_protocols: Vec<Vec<u8>>,
    ) -> Result<TlsConnector> {
        let _ = rustls::crypto::ring::default_provider().install_default();

        let mut roots = RootCertStore::empty();
        roots.add(root).context("failed to add test root cert")?;
        let mut config = ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        config.alpn_protocols = alpn_protocols;
        Ok(TlsConnector::from(Arc::new(config)))
    }

    fn test_upstream_server_config(
        sni: &str,
    ) -> Result<(Arc<rustls::ServerConfig>, CertificateDer<'static>)> {
        test_upstream_server_config_with_alpn(sni, vec![HTTP_1_1_ALPN.to_vec()])
    }

    fn test_upstream_server_config_with_alpn(
        sni: &str,
        alpn_protocols: Vec<Vec<u8>>,
    ) -> Result<(Arc<rustls::ServerConfig>, CertificateDer<'static>)> {
        let _ = rustls::crypto::ring::default_provider().install_default();

        let mut ca_params =
            CertificateParams::new(Vec::<String>::new()).context("invalid test CA params")?;
        let mut ca_dn = DistinguishedName::new();
        ca_dn.push(DnType::CommonName, "Dust test upstream CA");
        ca_params.distinguished_name = ca_dn;
        ca_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        ca_params.key_usages = vec![
            KeyUsagePurpose::KeyCertSign,
            KeyUsagePurpose::CrlSign,
            KeyUsagePurpose::DigitalSignature,
        ];
        let ca_key = KeyPair::generate().context("failed to generate test CA key")?;
        let ca_cert = ca_params
            .self_signed(&ca_key)
            .context("failed to self-sign test CA")?;

        let mut leaf_params =
            CertificateParams::new(Vec::<String>::new()).context("invalid test leaf params")?;
        let mut leaf_dn = DistinguishedName::new();
        leaf_dn.push(DnType::CommonName, sni);
        leaf_params.distinguished_name = leaf_dn;
        leaf_params.subject_alt_names = vec![SanType::DnsName(
            sni.to_string().try_into().context("invalid test SNI")?,
        )];
        let leaf_key = KeyPair::generate().context("failed to generate test leaf key")?;
        let leaf_cert = leaf_params
            .signed_by(&leaf_key, &ca_cert, &ca_key)
            .context("failed to sign test leaf")?;

        let leaf_der = CertificateDer::from(leaf_cert.der().to_vec());
        let key_der = PrivateKeyDer::from(PrivatePkcs8KeyDer::from(leaf_key.serialize_der()));
        let mut server_config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![leaf_der], key_der)
            .context("failed to build test upstream server config")?;
        server_config.alpn_protocols = alpn_protocols;

        Ok((
            Arc::new(server_config),
            CertificateDer::from(ca_cert.der().to_vec()),
        ))
    }
}
