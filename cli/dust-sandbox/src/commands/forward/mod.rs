mod deny_log;
mod handshake;
mod http_host;
mod http_rewriter;
mod original_dst;
mod sni;
mod tls_mitm;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{ensure, Context, Result};
use rustls::pki_types::ServerName;
use rustls::ClientConfig;
use rustls::RootCertStore;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{sleep, timeout, timeout_at, Instant};
use tokio_rustls::{TlsAcceptor, TlsConnector};
use tracing::{debug, info, warn};

use self::deny_log::{append_deny_log, DenyReason};
use self::handshake::{build_handshake_frame, ALLOW_RESPONSE, DENY_RESPONSE};
use self::http_host::parse_http_host;
use self::http_rewriter::rewrite_in_place;
use self::original_dst::resolve_original_dst;
use self::sni::parse_client_hello_sni;
use self::tls_mitm::MitmCa;

const DOMAIN_PEEK_TIMEOUT: Duration = Duration::from_secs(2);
const DOMAIN_PEEK_RETRY_DELAY: Duration = Duration::from_millis(25);
const PROXY_RESPONSE_TIMEOUT: Duration = Duration::from_secs(2);
const DOMAIN_PEEK_BUFFER_SIZE: usize = 16 * 1024;

const MITM_HEADER_PEEK_BUFFER_SIZE: usize = 32 * 1024;
const MITM_HEADER_READ_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(clap::Args, Debug, Clone)]
pub struct ForwardArgs {
    /// Path to the JWT token file
    #[arg(long)]
    token_file: PathBuf,
    /// Proxy TCP address in host:port form
    #[arg(long)]
    proxy_addr: std::net::SocketAddr,
    /// TLS server name used for certificate verification
    #[arg(long)]
    proxy_tls_name: String,
    /// Local listen address in host:port form
    #[arg(long)]
    listen: std::net::SocketAddr,
    /// Path to the deny log file
    #[arg(long, default_value = "/tmp/dust-egress-denied.log")]
    deny_log: PathBuf,
    /// PHASE0(remove with the experiment): hostname for which dsbx terminates
    /// inner TLS and rewrites the experiment placeholder. Empty disables MITM
    /// entirely. Replaced in Phase 1 by per-secret allowedDomains policy.
    #[arg(long, default_value = "")]
    mitm_experiment_host: String,
    /// Where to write the ephemeral MITM CA cert (PEM). Stays in Phase 1+ as
    /// the location the sandbox image reads to install the CA into the trust
    /// store. TODO(phase 1): move the default to /run/dust/egress-ca.pem
    /// (RAM-backed tmpfs) and persist the key alongside at
    /// /run/dust/egress-ca.key (root 0600), per design_docs/SECRET_SWAP_DESIGN.md
    /// "CA lifetime and dsbx restarts".
    #[arg(long, default_value = "/etc/dust/egress-ca.pem")]
    mitm_ca_path: PathBuf,
}

#[derive(Clone)]
struct ForwardRuntime {
    token: Arc<str>,
    proxy_addr: std::net::SocketAddr,
    proxy_tls_name: Arc<str>,
    deny_log: Arc<PathBuf>,
    tls_connector: TlsConnector,
    mitm_ca: Option<Arc<MitmCa>>,
    mitm_experiment_host: Arc<str>,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum DomainParseResult {
    Found(String),
    NotFound,
    Incomplete,
}

#[derive(Debug)]
struct DomainExtraction {
    domain: String,
    failed: bool,
}

pub async fn cmd_forward(args: ForwardArgs) -> Result<()> {
    let token = load_token(&args.token_file).await?;
    let tls_connector = build_tls_connector()?;

    // The CA must be generated and written to disk BEFORE we bind the
    // listener. Front uses "port 9990 is LISTEN" as the readiness signal and,
    // the moment that's true, reads /etc/dust/egress-ca.pem to build the
    // sandbox trust bundle. Bind-then-write would race: front could see a
    // missing or stale CA file. Same goes for restarts (stale CA from a
    // previous boot). Keep this ordering intact.
    let mitm_ca = if args.mitm_experiment_host.is_empty() {
        None
    } else {
        let ca = Arc::new(MitmCa::generate().context("failed to generate ephemeral MITM CA")?);
        ca.write_ca_pem(&args.mitm_ca_path).await.with_context(|| {
            format!("failed to write MITM CA to {}", args.mitm_ca_path.display())
        })?;
        info!(
            ca_path = %args.mitm_ca_path.display(),
            mitm_experiment_host = %args.mitm_experiment_host,
            "dsbx MITM mode enabled for experiment host"
        );
        Some(ca)
    };

    let listener = TcpListener::bind(args.listen)
        .await
        .with_context(|| format!("failed to bind forward listener on {}", args.listen))?;

    info!(
        listen_addr = %args.listen,
        proxy_addr = %args.proxy_addr,
        proxy_tls_name = %args.proxy_tls_name,
        deny_log = %args.deny_log.display(),
        "starting dsbx forwarder"
    );

    let runtime = ForwardRuntime {
        token: Arc::<str>::from(token),
        proxy_addr: args.proxy_addr,
        proxy_tls_name: Arc::<str>::from(args.proxy_tls_name),
        deny_log: Arc::new(args.deny_log),
        tls_connector,
        mitm_ca,
        mitm_experiment_host: Arc::<str>::from(args.mitm_experiment_host),
    };

    loop {
        match listener.accept().await {
            Ok((stream, peer_addr)) => {
                let runtime = runtime.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_connection(runtime, stream, peer_addr).await {
                        warn!(peer_addr = %peer_addr, error = %error, "forwarded connection failed");
                    }
                });
            }
            Err(error) => {
                warn!(error = %error, "failed to accept forwarded connection");
            }
        }
    }
}

async fn load_token(token_file: &PathBuf) -> Result<String> {
    let token = tokio::fs::read_to_string(token_file)
        .await
        .with_context(|| format!("failed to read token file {}", token_file.display()))?;
    let trimmed = token.trim().to_string();
    ensure!(
        !trimmed.is_empty(),
        "token file {} did not contain a JWT",
        token_file.display()
    );
    Ok(trimmed)
}

fn build_tls_connector() -> Result<TlsConnector> {
    // rustls 0.23 requires an explicit process-level CryptoProvider.
    // install_default returns Err if one is already installed — we just want to
    // guarantee some provider is present before ClientConfig::builder().
    let _ = rustls::crypto::ring::default_provider().install_default();

    let mut roots = RootCertStore::empty();
    let certs = rustls_native_certs::load_native_certs();

    for error in certs.errors {
        warn!(error = %error, "failed to load a native root certificate");
    }

    let (loaded, ignored) = roots.add_parsable_certificates(certs.certs);
    if ignored != 0 {
        warn!(
            ignored_cert_count = ignored,
            "ignored native root certificates"
        );
    }
    ensure!(
        loaded != 0,
        "failed to load any native root certificates for proxy TLS validation"
    );

    let config = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();

    Ok(TlsConnector::from(Arc::new(config)))
}

async fn handle_connection(
    runtime: ForwardRuntime,
    mut client_stream: TcpStream,
    peer_addr: std::net::SocketAddr,
) -> Result<()> {
    let original_dst =
        resolve_original_dst(&client_stream).context("failed to resolve original destination")?;
    let original_port = original_dst.port();
    let domain_extraction = extract_domain(&client_stream, original_port).await;

    let mitm_target = mitm_target_for(&runtime, original_port, &domain_extraction.domain);

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
                mitm = mitm_target.is_some(),
                "proxy allowed forwarded connection"
            );

            if let Some((sni, ca)) = mitm_target {
                run_mitm_session(&runtime, &sni, ca, client_stream, proxy_stream)
                    .await
                    .context("MITM session failed")?;
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
                &domain_extraction.domain,
                original_port,
                reason,
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
                &domain_extraction.domain,
                original_port,
                DenyReason::ProxyProtocolError,
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

// PHASE0: scopes the MITM stage to a single experiment hostname. Phase 1
// replaces the host check with a per-secret allowedDomains lookup.
fn mitm_target_for(
    runtime: &ForwardRuntime,
    original_port: u16,
    domain: &str,
) -> Option<(String, Arc<MitmCa>)> {
    if original_port != 443 {
        return None;
    }
    let ca = runtime.mitm_ca.as_ref()?;
    if !domain.eq_ignore_ascii_case(&runtime.mitm_experiment_host) {
        return None;
    }
    Some((domain.to_string(), Arc::clone(ca)))
}

async fn run_mitm_session<S>(
    runtime: &ForwardRuntime,
    sni: &str,
    ca: Arc<MitmCa>,
    client_stream: TcpStream,
    proxy_stream: S,
) -> Result<()>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    // Outbound: dsbx is a TLS client to the real upstream, tunneled through
    // the proxy's already-allowed TCP relay. The proxy doesn't see the inner
    // TLS, just splices encrypted bytes, same as a normal request, except we
    // (dsbx) are now the originator instead of the agent.
    //
    // TODO(phase 1): force ALPN to advertise only "http/1.1" on this client
    // config, otherwise we may negotiate h2 which the h1 rewriter cannot
    // handle. HTTP/2 support is a Phase 2 step (frame-level + HPACK-aware).
    // For Phase 0 the only experiment upstream is dust.tt which speaks h1.1.
    let upstream_server_name =
        ServerName::try_from(sni.to_string()).context("invalid upstream SNI for MITM TLS")?;
    let upstream_tls = runtime
        .tls_connector
        .connect(upstream_server_name, proxy_stream)
        .await
        .context("failed to establish MITM TLS to upstream via proxy tunnel")?;

    // Inbound: dsbx terminates the agent's TLS using a leaf cert minted by the
    // ephemeral CA the sandbox image already trusts.
    let server_config = ca
        .server_config_for(sni)
        .await
        .context("failed to build MITM server config for SNI")?;
    let acceptor = TlsAcceptor::from(server_config);
    let agent_tls = acceptor
        .accept(client_stream)
        .await
        .context("failed to accept agent TLS for MITM")?;

    let (mut agent_read, mut agent_write) = tokio::io::split(agent_tls);
    let (mut upstream_read, mut upstream_write) = tokio::io::split(upstream_tls);

    let request_task = tokio::spawn(async move {
        rewrite_request_then_copy(&mut agent_read, &mut upstream_write).await
    });
    let response_task =
        tokio::spawn(async move { tokio::io::copy(&mut upstream_read, &mut agent_write).await });

    let (req_result, resp_result) = tokio::join!(request_task, response_task);
    req_result
        .context("MITM request task panicked")?
        .context("MITM request copy failed")?;
    resp_result
        .context("MITM response task panicked")?
        .context("MITM response copy failed")?;

    Ok(())
}

async fn rewrite_request_then_copy<R, W>(reader: &mut R, writer: &mut W) -> std::io::Result<()>
where
    R: tokio::io::AsyncRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    // Phase 0 is "headers only", which means strictly the header *lines*: not
    // the request line (method / URL / version) and not the body. We:
    //   1. Accumulate bytes until \r\n\r\n (or hit a 32KB cap / read timeout).
    //   2. Skip past the first \r\n (the request line stays untouched, so
    //      placeholders in the URL pass through unsubstituted by design).
    //   3. Rewrite the header lines in place.
    //   4. Forward request line + rewritten headers + any trailing body bytes
    //      verbatim, then `copy` the rest of the stream raw.
    // Placeholder and replacement are equal length, so no Content-Length
    // recomputation is needed.
    //
    // TODO(phase 1): replace this prefix-only rewriter with a full HTTP/1.1
    // message loop (per-request parsing, per-request Host validation, pipelining
    // handled, fail-closed on malformed/oversized/truncated headers). The
    // current shape only rewrites the FIRST request on a connection and then
    // raw-copies the rest, which is unsafe on keep-alive connections (subsequent
    // requests' headers are forwarded unsubstituted). Also: drop the connection
    // if a placeholder appears in the request line (loud failure: agent learns
    // the URL path isn't supported and uses headers). URL substitution itself
    // is Phase 2; bodies are Phase 3 with an opt-in includeBody flag.
    // See design_docs/SECRET_SWAP_DESIGN.md, Phase 1 spec and "Substitution
    // logic" under "Proposal".
    let mut header_buf = Vec::with_capacity(MITM_HEADER_PEEK_BUFFER_SIZE);
    let deadline = Instant::now() + MITM_HEADER_READ_TIMEOUT;

    loop {
        let mut chunk = [0u8; 4096];
        let n = match timeout_at(deadline, reader.read(&mut chunk)).await {
            Ok(Ok(n)) => n,
            Ok(Err(error)) => return Err(error),
            Err(_) => break,
        };
        if n == 0 {
            break;
        }
        header_buf.extend_from_slice(&chunk[..n]);

        if find_end_of_headers(&header_buf).is_some() {
            break;
        }
        if header_buf.len() >= MITM_HEADER_PEEK_BUFFER_SIZE {
            break;
        }
    }

    if !header_buf.is_empty() {
        let total_len = header_buf.len();
        let header_end = find_end_of_headers(&header_buf).unwrap_or(total_len);
        // Skip the request line: everything up to and including the first \r\n
        // is left alone. If we cannot find a full request line (truncated read)
        // we conservatively forward the whole buffer untouched.
        let request_line_end =
            find_request_line_end(&header_buf[..header_end]).unwrap_or(total_len);
        let (untouched, rest) = header_buf.split_at_mut(request_line_end);
        let body_split = header_end.saturating_sub(untouched.len()).min(rest.len());
        let (headers_part, body_tail) = rest.split_at_mut(body_split);
        let count = rewrite_in_place(headers_part);
        if count > 0 {
            info!(
                replacements = count,
                "dsbx MITM rewrote phase-0 placeholder in agent request"
            );
        }
        writer.write_all(untouched).await?;
        writer.write_all(headers_part).await?;
        if !body_tail.is_empty() {
            writer.write_all(body_tail).await?;
        }
        writer.flush().await?;
    }

    tokio::io::copy(reader, writer).await?;
    Ok(())
}

fn find_end_of_headers(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

fn find_request_line_end(buf: &[u8]) -> Option<usize> {
    buf.windows(2).position(|w| w == b"\r\n").map(|i| i + 2)
}

fn display_domain(domain: &str) -> &str {
    if domain.is_empty() {
        "<unknown>"
    } else {
        domain
    }
}

async fn extract_domain(stream: &TcpStream, original_port: u16) -> DomainExtraction {
    match original_port {
        80 => extract_domain_with_parser(stream, parse_http_host).await,
        443 => extract_domain_with_parser(stream, parse_client_hello_sni).await,
        _ => DomainExtraction {
            domain: String::new(),
            failed: false,
        },
    }
}

async fn extract_domain_with_parser<F>(stream: &TcpStream, parser: F) -> DomainExtraction
where
    F: Fn(&[u8]) -> DomainParseResult,
{
    let mut buffer = vec![0_u8; DOMAIN_PEEK_BUFFER_SIZE];
    let deadline = Instant::now() + DOMAIN_PEEK_TIMEOUT;

    loop {
        let bytes_read = match timeout_at(deadline, stream.peek(&mut buffer)).await {
            Ok(Ok(bytes_read)) => bytes_read,
            Ok(Err(error)) => {
                debug!(error = %error, "failed to peek client bytes for domain extraction");
                return DomainExtraction {
                    domain: String::new(),
                    failed: true,
                };
            }
            Err(_) => {
                return DomainExtraction {
                    domain: String::new(),
                    failed: true,
                };
            }
        };

        if bytes_read == 0 {
            return DomainExtraction {
                domain: String::new(),
                failed: true,
            };
        }

        match parser(&buffer[..bytes_read]) {
            DomainParseResult::Found(domain) => {
                return DomainExtraction {
                    domain,
                    failed: false,
                };
            }
            DomainParseResult::NotFound => {
                return DomainExtraction {
                    domain: String::new(),
                    failed: false,
                };
            }
            DomainParseResult::Incomplete => {
                if bytes_read == buffer.len() || Instant::now() >= deadline {
                    return DomainExtraction {
                        domain: String::new(),
                        failed: true,
                    };
                }
                sleep(DOMAIN_PEEK_RETRY_DELAY).await;
            }
        }
    }
}

enum ProxyDecision {
    Allow,
    Deny,
    ProtocolError,
}

async fn read_proxy_response<IO>(io: &mut IO) -> ProxyDecision
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

#[cfg(test)]
mod tests {
    use super::http_rewriter::{rewrite_in_place, PHASE0_PLACEHOLDER, PHASE0_REPLACEMENT};
    use super::{find_end_of_headers, find_request_line_end};

    #[test]
    fn finds_end_of_headers_offset_just_past_crlf_crlf() {
        let buf = b"GET / HTTP/1.1\r\nHost: x\r\n\r\nBODY";
        let split = find_end_of_headers(buf).expect("should find header end");
        assert_eq!(&buf[..split], b"GET / HTTP/1.1\r\nHost: x\r\n\r\n");
        assert_eq!(&buf[split..], b"BODY");
    }

    #[test]
    fn body_bytes_are_not_rewritten_when_we_only_touch_the_header_prefix() {
        // The first read coalesces headers + start of body; we must split at
        // \r\n\r\n and only rewrite the header prefix. The body's placeholder
        // must NOT be substituted (Phase 0 is strictly headers-only).
        let mut buf =
            b"POST /x HTTP/1.1\r\nHost: x\r\nX-A: __DUST_EXPERIMENT_PLACEHOLDER__\r\n\r\nbody=__DUST_EXPERIMENT_PLACEHOLDER__".to_vec();
        let split = find_end_of_headers(&buf).expect("should find header end");
        let (head, body) = buf.split_at_mut(split);
        let count = rewrite_in_place(head);
        assert_eq!(count, 1);
        assert!(head
            .windows(PHASE0_REPLACEMENT.len())
            .any(|w| w == PHASE0_REPLACEMENT));
        assert!(body
            .windows(PHASE0_PLACEHOLDER.len())
            .any(|w| w == PHASE0_PLACEHOLDER));
    }

    #[test]
    fn url_in_request_line_is_not_rewritten() {
        // Phase 0 design: "no URL rewriting". A placeholder in the request
        // line (method / path / version) must pass through unchanged. Only
        // header lines (everything between the first \r\n and the \r\n\r\n)
        // are eligible for substitution.
        let buf = b"GET /?x=__DUST_EXPERIMENT_PLACEHOLDER__ HTTP/1.1\r\nHost: x\r\nX-A: __DUST_EXPERIMENT_PLACEHOLDER__\r\n\r\n";
        let header_end = find_end_of_headers(buf).expect("should find header end");
        let request_line_end =
            find_request_line_end(&buf[..header_end]).expect("should find request line end");
        let mut owned = buf.to_vec();
        let (untouched, rest) = owned.split_at_mut(request_line_end);
        let body_split = header_end - untouched.len();
        let (headers_part, _body) = rest.split_at_mut(body_split);
        let count = rewrite_in_place(headers_part);
        assert_eq!(count, 1);
        // URL substring is preserved verbatim.
        assert!(untouched
            .windows(PHASE0_PLACEHOLDER.len())
            .any(|w| w == PHASE0_PLACEHOLDER));
        // Header value got swapped.
        assert!(headers_part
            .windows(PHASE0_REPLACEMENT.len())
            .any(|w| w == PHASE0_REPLACEMENT));
    }
}
