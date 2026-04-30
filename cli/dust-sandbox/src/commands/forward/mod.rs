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
    /// Phase 0 PoC: hostname for which dsbx terminates inner TLS and rewrites
    /// the experiment placeholder. Empty disables MITM entirely.
    #[arg(long, default_value = "")]
    mitm_experiment_host: String,
    /// Phase 0 PoC: where to write the ephemeral MITM CA cert (PEM).
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
    let listener = TcpListener::bind(args.listen)
        .await
        .with_context(|| format!("failed to bind forward listener on {}", args.listen))?;

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
    // TLS, just splices encrypted bytes — same as a normal request, except we
    // (dsbx) are now the originator instead of the agent.
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
    // Phase 0 simplification: read up to ~32KB or until end-of-headers, run a
    // single byte-level rewrite over that buffer, flush. Then copy the
    // remainder (typically the body) raw. Equal placeholder/replacement
    // length means no framing recomputation, but it also means a placeholder
    // straddling the read boundary would not be substituted in the residual
    // body. Acceptable for the PoC since the smoke flow puts the placeholder
    // in headers only.
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

        if has_end_of_headers(&header_buf) {
            break;
        }
        if header_buf.len() >= MITM_HEADER_PEEK_BUFFER_SIZE {
            break;
        }
    }

    if !header_buf.is_empty() {
        let count = rewrite_in_place(&mut header_buf);
        if count > 0 {
            info!(
                replacements = count,
                "dsbx MITM rewrote phase-0 placeholder in agent request"
            );
        }
        writer.write_all(&header_buf).await?;
        writer.flush().await?;
    }

    tokio::io::copy(reader, writer).await?;
    Ok(())
}

fn has_end_of_headers(buf: &[u8]) -> bool {
    buf.windows(4).any(|w| w == b"\r\n\r\n")
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
