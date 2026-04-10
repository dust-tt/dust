use crate::blocklist::{is_globally_blocked_domain, is_unsafe_ip};
use crate::config::Config;
use crate::dns::DnsResolver;
use crate::handshake::{read_handshake, Handshake, HandshakeError, ALLOW_RESPONSE, DENY_RESPONSE};
use crate::jwt::{JwtValidationError, JwtValidator, ValidatedSandboxToken};
use crate::policy::TemporaryAllowlist;
use std::fmt;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::io::{copy_bidirectional, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::server::TlsStream;
use tracing::{info, warn};

#[derive(Clone)]
pub struct ConnectionState {
    jwt_validator: JwtValidator,
    temporary_allowlist: TemporaryAllowlist,
    dns_resolver: DnsResolver,
    unsafe_skip_ssrf_check: bool,
}

#[derive(Debug, Clone, Copy)]
pub enum DenyReason {
    MalformedHandshake,
    UnsupportedProtocolVersion,
    EmptyDomain,
    InvalidJwt,
    ExpiredJwt,
    InvalidClaims,
    GlobalBlocklist,
    NotInTemporaryAllowlist,
    DnsResolutionFailed,
    UnsafeResolvedIp,
    UpstreamConnectFailed,
    IoError,
}

impl ConnectionState {
    pub fn new(config: &Config) -> Self {
        Self {
            jwt_validator: JwtValidator::new(&config.jwt_secret),
            temporary_allowlist: config.temporary_allowlist.clone(),
            dns_resolver: DnsResolver::new(),
            unsafe_skip_ssrf_check: config.unsafe_skip_ssrf_check,
        }
    }
}

impl DenyReason {
    pub fn as_str(self) -> &'static str {
        // TODO(sandbox-egress): Keep deny reason strings stable so dashboards and alerts can
        // aggregate by reason.
        match self {
            Self::MalformedHandshake => "malformed_handshake",
            Self::UnsupportedProtocolVersion => "unsupported_protocol_version",
            Self::EmptyDomain => "empty_domain",
            Self::InvalidJwt => "invalid_jwt",
            Self::ExpiredJwt => "expired_jwt",
            Self::InvalidClaims => "invalid_claims",
            Self::GlobalBlocklist => "global_blocklist",
            Self::NotInTemporaryAllowlist => "not_in_temporary_allowlist",
            Self::DnsResolutionFailed => "dns_resolution_failed",
            Self::UnsafeResolvedIp => "unsafe_resolved_ip",
            Self::UpstreamConnectFailed => "upstream_connect_failed",
            Self::IoError => "io_error",
        }
    }
}

impl fmt::Display for DenyReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

pub async fn handle_connection(mut stream: TlsStream<TcpStream>, state: Arc<ConnectionState>) {
    let _ = handle_connection_inner(&mut stream, state).await;
}

async fn handle_connection_inner(
    stream: &mut TlsStream<TcpStream>,
    state: Arc<ConnectionState>,
) -> Result<(), DenyReason> {
    let handshake = match read_handshake(stream).await {
        Ok(handshake) => handshake,
        Err(HandshakeError::UnsupportedProtocolVersion) => {
            deny(stream, DenyReason::UnsupportedProtocolVersion, None, None).await;
            return Err(DenyReason::UnsupportedProtocolVersion);
        }
        Err(HandshakeError::MalformedHandshake) => {
            warn!(
                deny_reason = %DenyReason::MalformedHandshake,
                "connection denied"
            );
            return Err(DenyReason::MalformedHandshake);
        }
    };

    let token = match state.jwt_validator.validate(&handshake.token) {
        Ok(token) => token,
        Err(error) => {
            let reason = jwt_error_to_deny_reason(error);
            deny(stream, reason, None, Some(&handshake)).await;
            return Err(reason);
        }
    };

    if handshake.domain.is_empty() {
        // TODO(sandbox-egress): Track empty_domain separately from malformed_handshake because
        // this is the expected deny path for non-HTTP/non-TLS connections where dsbx cannot
        // extract a Host header or TLS SNI.
        deny(
            stream,
            DenyReason::EmptyDomain,
            Some(&token),
            Some(&handshake),
        )
        .await;
        return Err(DenyReason::EmptyDomain);
    }

    if is_globally_blocked_domain(&handshake.domain) {
        deny(
            stream,
            DenyReason::GlobalBlocklist,
            Some(&token),
            Some(&handshake),
        )
        .await;
        return Err(DenyReason::GlobalBlocklist);
    }

    if !state
        .temporary_allowlist
        .allows(&handshake.domain, &token.sb_id)
    {
        deny(
            stream,
            DenyReason::NotInTemporaryAllowlist,
            Some(&token),
            Some(&handshake),
        )
        .await;
        return Err(DenyReason::NotInTemporaryAllowlist);
    }

    let upstream_addresses = match state
        .dns_resolver
        .resolve(&handshake.domain, handshake.original_dest_port)
        .await
    {
        Ok(addresses) => addresses,
        Err(error) => {
            warn!(
                error = %error,
                sb_id = %token.sb_id,
                domain = %handshake.domain,
                original_dest_port = handshake.original_dest_port,
                "dns resolution failed"
            );
            deny(
                stream,
                DenyReason::DnsResolutionFailed,
                Some(&token),
                Some(&handshake),
            )
            .await;
            return Err(DenyReason::DnsResolutionFailed);
        }
    };

    if !state.unsafe_skip_ssrf_check
        && upstream_addresses
            .iter()
            .any(|address| is_unsafe_ip(address.ip()))
    {
        deny(
            stream,
            DenyReason::UnsafeResolvedIp,
            Some(&token),
            Some(&handshake),
        )
        .await;
        return Err(DenyReason::UnsafeResolvedIp);
    }

    let upstream_addr = match upstream_addresses.first().copied() {
        Some(address) => address,
        None => {
            deny(
                stream,
                DenyReason::DnsResolutionFailed,
                Some(&token),
                Some(&handshake),
            )
            .await;
            return Err(DenyReason::DnsResolutionFailed);
        }
    };

    let mut upstream = match TcpStream::connect(upstream_addr).await {
        Ok(upstream) => upstream,
        Err(error) => {
            warn!(
                error = %error,
                sb_id = %token.sb_id,
                domain = %handshake.domain,
                original_dest_port = handshake.original_dest_port,
                upstream_addr = %upstream_addr,
                "upstream connect failed"
            );
            deny(
                stream,
                DenyReason::UpstreamConnectFailed,
                Some(&token),
                Some(&handshake),
            )
            .await;
            return Err(DenyReason::UpstreamConnectFailed);
        }
    };

    if stream.write_all(&[ALLOW_RESPONSE]).await.is_err() {
        return Err(DenyReason::IoError);
    }

    info!(
        sb_id = %token.sb_id,
        domain = %handshake.domain,
        original_dest_port = handshake.original_dest_port,
        upstream_addr = %upstream_addr,
        "connection allowed"
    );

    // TODO(sandbox-egress): Enforce connection lifetime and idle timeout policy for
    // long-lived sandbox connections.
    match copy_bidirectional(stream, &mut upstream).await {
        Ok((from_client_bytes, from_upstream_bytes)) => {
            info!(
                sb_id = %token.sb_id,
                domain = %handshake.domain,
                original_dest_port = handshake.original_dest_port,
                upstream_addr = %upstream_addr,
                from_client_bytes,
                from_upstream_bytes,
                "connection closed"
            );
            Ok(())
        }
        Err(error) => {
            warn!(
                error = %error,
                sb_id = %token.sb_id,
                domain = %handshake.domain,
                original_dest_port = handshake.original_dest_port,
                upstream_addr = %upstream_addr,
                "connection copy failed"
            );
            Err(DenyReason::IoError)
        }
    }
}

async fn deny(
    stream: &mut TlsStream<TcpStream>,
    reason: DenyReason,
    token: Option<&ValidatedSandboxToken>,
    handshake: Option<&Handshake>,
) {
    // TODO(sandbox-egress): Emit allow/deny/JWT/GCS/upstream metrics once service telemetry
    // is wired.
    log_deny(reason, token, handshake, None);
    if let Err(error) = stream.write_all(&[DENY_RESPONSE]).await {
        warn!(error = %error, deny_reason = %reason, "failed to write deny response");
    }
}

fn log_deny(
    reason: DenyReason,
    token: Option<&ValidatedSandboxToken>,
    handshake: Option<&Handshake>,
    upstream_addr: Option<SocketAddr>,
) {
    warn!(
        deny_reason = %reason,
        sb_id = token.map(|token| token.sb_id.as_str()),
        domain = handshake.map(|handshake| handshake.domain.as_str()),
        original_dest_port = handshake.map(|handshake| handshake.original_dest_port),
        upstream_addr = upstream_addr.map(|address| address.to_string()),
        "connection denied"
    );
}

fn jwt_error_to_deny_reason(error: JwtValidationError) -> DenyReason {
    match error {
        JwtValidationError::Expired => DenyReason::ExpiredJwt,
        JwtValidationError::InvalidClaims => DenyReason::InvalidClaims,
        JwtValidationError::InvalidJwt => DenyReason::InvalidJwt,
    }
}
