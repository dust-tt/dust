mod deny_log;
mod handshake;
mod http_host;
mod original_dst;
mod sni;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{ensure, Context, Result};
use clap::Args;
use rustls::pki_types::ServerName;
use rustls::ClientConfig;
use rustls::RootCertStore;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{sleep, timeout, timeout_at, Instant};
use tokio_rustls::TlsConnector;
use tracing::{debug, info, warn};

use self::deny_log::{append_deny_log, DenyReason};
use self::handshake::{build_handshake_frame, ALLOW_RESPONSE, DENY_RESPONSE};
use self::http_host::parse_http_host;
use self::original_dst::resolve_original_dst;
use self::sni::parse_client_hello_sni;

const DOMAIN_PEEK_TIMEOUT: Duration = Duration::from_secs(2);
const DOMAIN_PEEK_RETRY_DELAY: Duration = Duration::from_millis(25);
const PROXY_RESPONSE_TIMEOUT: Duration = Duration::from_secs(2);
const DOMAIN_PEEK_BUFFER_SIZE: usize = 16 * 1024;

#[derive(Args, Debug, Clone)]
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
}

#[derive(Clone)]
struct ForwardRuntime {
    token: Arc<str>,
    proxy_addr: std::net::SocketAddr,
    proxy_tls_name: Arc<str>,
    deny_log: Arc<PathBuf>,
    tls_connector: TlsConnector,
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

    let frame = build_handshake_frame(&runtime.token, &domain_extraction.domain, original_port);
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
                "proxy allowed forwarded connection"
            );
            tokio::io::copy_bidirectional(&mut client_stream, &mut proxy_stream)
                .await
                .context("bidirectional copy failed")?;
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
