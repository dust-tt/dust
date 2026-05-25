use anyhow::{Context, Result};
use rustls::pki_types::ServerName;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tracing::{info, warn};

use super::deny_log::{append_deny_log, DenyLogEntry, DenyReason};
use super::domain_extract::{display_domain, extract_domain};
use super::handshake::build_handshake_frame;
use super::mitm_session::{mitm_target_for, run_mitm_session, run_plain_http_session};
use super::original_dst::resolve_original_dst;
use super::proxy_tunnel::{read_proxy_response, ProxyDecision};
use super::ForwardRuntime;

pub(super) async fn handle_connection(
    runtime: ForwardRuntime,
    mut client_stream: TcpStream,
    peer_addr: std::net::SocketAddr,
) -> Result<()> {
    let original_dst =
        resolve_original_dst(&client_stream).context("failed to resolve original destination")?;
    let original_port = original_dst.port();
    let domain_extraction = extract_domain(&client_stream, original_port).await;
    let mitm_target = mitm_target_for(
        original_port,
        &domain_extraction.domain,
        &runtime.secret_table,
    );

    if let Some(sni) = mitm_target {
        run_mitm_session(&runtime, sni, original_dst, client_stream)
            .await
            .context("MITM session failed")?;
        return Ok(());
    }

    let server_name = ServerName::try_from(runtime.proxy_tls_name.to_string())
        .context("invalid proxy TLS server name")?;
    let proxy_stream = TcpStream::connect(runtime.proxy_addr)
        .await
        .with_context(|| format!("failed to connect to proxy {}", runtime.proxy_addr))?;
    let mut proxy_stream = runtime
        .tls_connector
        .connect(server_name, proxy_stream)
        .await
        .context("failed to establish TLS connection to proxy")?;

    let frame = build_handshake_frame(&runtime.token, &domain_extraction.domain, original_port)
        .context("failed to build proxy handshake frame")?;
    proxy_stream
        .write_all(&frame)
        .await
        .context("failed to write proxy handshake frame")?;

    let proxy_response = read_proxy_response(&mut proxy_stream).await;
    match proxy_response {
        ProxyDecision::Allow => {
            info!(
                peer_addr = %peer_addr,
                original_port,
                domain = display_domain(&domain_extraction.domain),
                mitm = false,
                "proxy allowed forwarded connection"
            );

            if original_port == 80 {
                run_plain_http_session(
                    &runtime,
                    &domain_extraction.domain,
                    client_stream,
                    proxy_stream,
                )
                .await
                .context("plain HTTP guard session failed")?;
            } else {
                tokio::io::copy_bidirectional(&mut client_stream, &mut proxy_stream)
                    .await
                    .context("bidirectional copy failed")?;
            }
        }
        ProxyDecision::Deny => {
            let reason = if domain_extraction.failed {
                DenyReason::DomainExtractionFailed
            } else {
                DenyReason::ProxyDenied
            };
            append_deny_log(
                &runtime.deny_log,
                DenyLogEntry::proxy(&domain_extraction.domain, original_port, reason),
            )
            .await
            .context("failed to append deny log entry")?;
            info!(
                peer_addr = %peer_addr,
                original_port,
                domain = display_domain(&domain_extraction.domain),
                reason = reason.as_str(),
                "proxy denied forwarded connection"
            );
        }
        ProxyDecision::ProtocolError => {
            append_deny_log(
                &runtime.deny_log,
                DenyLogEntry::proxy(
                    &domain_extraction.domain,
                    original_port,
                    DenyReason::ProxyProtocolError,
                ),
            )
            .await
            .context("failed to append protocol-error deny log entry")?;
            warn!(
                peer_addr = %peer_addr,
                original_port,
                domain = display_domain(&domain_extraction.domain),
                "proxy returned an invalid response"
            );
        }
    }

    Ok(())
}
