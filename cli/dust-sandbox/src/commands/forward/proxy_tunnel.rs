use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use rustls::pki_types::ServerName;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_rustls::TlsConnector;

use super::deny_log::{append_deny_log, DenyLogEntry, DenyReason};
use super::handshake::{build_handshake_frame, ALLOW_RESPONSE, DENY_RESPONSE};
use super::ForwardRuntime;

const PROXY_RESPONSE_TIMEOUT: Duration = Duration::from_secs(2);

// Reusable opener for the per-h2-stream upstream proxy tunnel. Each h2 stream
// opens its own TCP + proxy CONNECT + TLS handshake, so the opener must be
// callable more than once (unlike the previous FnOnce closure used by the
// pre-h2 path).
pub(super) type OpenProxyTunnel<S> =
    Arc<dyn Fn() -> Pin<Box<dyn Future<Output = Result<S>> + Send>> + Send + Sync>;

#[derive(Clone)]
pub(super) struct ProxyTunnelOpenContext {
    pub(super) token: Arc<str>,
    pub(super) proxy_addr: std::net::SocketAddr,
    pub(super) proxy_tls_name: Arc<str>,
    pub(super) deny_log: Arc<PathBuf>,
    pub(super) tls_connector: TlsConnector,
}

pub(super) async fn open_allowed_proxy_tunnel(
    runtime: &ForwardRuntime,
    domain: &str,
    port: u16,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>> {
    let context = ProxyTunnelOpenContext {
        token: Arc::clone(&runtime.token),
        proxy_addr: runtime.proxy_addr,
        proxy_tls_name: Arc::clone(&runtime.proxy_tls_name),
        deny_log: Arc::clone(&runtime.deny_log),
        tls_connector: runtime.tls_connector.clone(),
    };
    open_allowed_proxy_tunnel_from_context(&context, domain, port).await
}

pub(super) async fn open_allowed_proxy_tunnel_from_context(
    context: &ProxyTunnelOpenContext,
    domain: &str,
    port: u16,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>> {
    let server_name = ServerName::try_from(context.proxy_tls_name.to_string())
        .context("invalid proxy TLS server name")?;
    let proxy_stream = TcpStream::connect(context.proxy_addr)
        .await
        .with_context(|| format!("failed to connect to proxy {}", context.proxy_addr))?;
    let mut proxy_stream = context
        .tls_connector
        .connect(server_name, proxy_stream)
        .await
        .context("failed to establish TLS connection to proxy")?;

    let frame = build_handshake_frame(&context.token, domain, port)
        .context("failed to build proxy handshake frame")?;
    proxy_stream
        .write_all(&frame)
        .await
        .context("failed to write proxy handshake frame")?;

    match read_proxy_response(&mut proxy_stream).await {
        ProxyDecision::Allow => Ok(proxy_stream),
        ProxyDecision::Deny => {
            append_deny_log(
                &context.deny_log,
                DenyLogEntry::proxy(domain, port, DenyReason::ProxyDenied),
            )
            .await
            .context("failed to append proxy deny log entry")?;
            Err(anyhow::anyhow!("proxy denied per-stream tunnel"))
        }
        ProxyDecision::ProtocolError => {
            append_deny_log(
                &context.deny_log,
                DenyLogEntry::proxy(domain, port, DenyReason::ProxyProtocolError),
            )
            .await
            .context("failed to append proxy protocol-error deny log entry")?;
            Err(anyhow::anyhow!(
                "proxy returned invalid per-stream response"
            ))
        }
    }
}

pub(super) enum ProxyDecision {
    Allow,
    Deny,
    ProtocolError,
}

pub(super) async fn read_proxy_response<IO>(io: &mut IO) -> ProxyDecision
where
    IO: AsyncReadExt + Unpin,
{
    let mut response = [0_u8; 1];
    match timeout(PROXY_RESPONSE_TIMEOUT, io.read_exact(&mut response)).await {
        Ok(Ok(_)) => match response[0] {
            ALLOW_RESPONSE => ProxyDecision::Allow,
            DENY_RESPONSE => ProxyDecision::Deny,
            _ => ProxyDecision::ProtocolError,
        },
        Ok(Err(_)) | Err(_) => ProxyDecision::ProtocolError,
    }
}
