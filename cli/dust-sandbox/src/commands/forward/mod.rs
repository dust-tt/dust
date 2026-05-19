mod deny_log;
mod handshake;
mod http_host;
mod original_dst;
mod sni;
mod tls_mitm;

use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{ensure, Context, Result};
use rustls::pki_types::ServerName;
use rustls::ClientConfig;
use rustls::RootCertStore;
use tokio::io::AsyncRead;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWrite;
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{sleep, timeout, timeout_at, Instant};
use tokio_rustls::{TlsAcceptor, TlsConnector};
use tracing::{debug, info, warn};

use crate::egress_secrets::SecretTable;

use self::deny_log::{append_deny_log, DenyReason};
use self::handshake::{build_handshake_frame, ALLOW_RESPONSE, DENY_RESPONSE};
use self::http_host::parse_http_host;
use self::original_dst::resolve_original_dst;
use self::sni::parse_client_hello_sni;
use self::tls_mitm::{MitmCa, HTTP_1_1_ALPN};

const DOMAIN_PEEK_TIMEOUT: Duration = Duration::from_secs(2);
const DOMAIN_PEEK_RETRY_DELAY: Duration = Duration::from_millis(25);
const PROXY_RESPONSE_TIMEOUT: Duration = Duration::from_secs(2);
const DOMAIN_PEEK_BUFFER_SIZE: usize = 16 * 1024;

const MITM_CA_CERT_PATH: &str = "/run/dust/egress-ca.pem";
const MITM_CA_KEY_PATH: &str = "/run/dust/egress-ca.key";
// Must match `front/lib/api/sandbox/egress_secrets.ts:EGRESS_SECRETS_PATH`.
const EGRESS_SECRETS_PATH: &str = "/run/dust/egress-secrets.json";

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
    /// Path to the one-shot egress secrets file loaded at startup
    #[arg(long, default_value = EGRESS_SECRETS_PATH)]
    secrets_file: PathBuf,
}

#[derive(Clone)]
struct ForwardRuntime {
    token: Arc<str>,
    proxy_addr: std::net::SocketAddr,
    proxy_tls_name: Arc<str>,
    deny_log: Arc<PathBuf>,
    // Plumbed in Slice 4; consumed by SNI-scoped MITM in Slice 5 and the
    // request rewriter in Slice 6.
    secret_table: Arc<SecretTable>,
    tls_connector: TlsConnector,
    mitm_tls_connector: TlsConnector,
    mitm_ca: Arc<MitmCa>,
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
    let mitm_tls_connector = build_http1_tls_connector()?;

    // The CA must be loaded/generated BEFORE we bind the listener. Front uses
    // "port 9990 is LISTEN" as the readiness signal and, the moment that's
    // true, reads /run/dust/egress-ca.pem to build the sandbox trust bundle.
    // Bind-then-write would race: front could see a missing or stale CA file.
    // Keep this ordering intact on restarts too. The in-memory handle backs
    // the SNI-scoped TLS termination path; the on-disk cert is what front
    // installs into the sandbox trust bundle.
    let mitm_ca = Arc::new(
        MitmCa::load_or_generate(
            std::path::Path::new(MITM_CA_CERT_PATH),
            std::path::Path::new(MITM_CA_KEY_PATH),
        )
        .context("failed to load or generate persistent MITM CA")?,
    );

    // The secrets file is intentionally loaded once at dsbx startup. Front
    // propagates changes in Phase 1 by rewriting the file and restarting dsbx
    // on sandbox wake; live reload/inotify is deferred to a later phase.
    let secret_table =
        SecretTable::load(&args.secrets_file).context("failed to load egress secrets table")?;

    let listener = TcpListener::bind(args.listen)
        .await
        .with_context(|| format!("failed to bind forward listener on {}", args.listen))?;

    info!(
        listen_addr = %args.listen,
        proxy_addr = %args.proxy_addr,
        proxy_tls_name = %args.proxy_tls_name,
        deny_log = %args.deny_log.display(),
        secrets_file = %args.secrets_file.display(),
        secret_count = secret_table.len(),
        domain_pattern_count = secret_table.sni_match_set.pattern_count(),
        "starting dsbx forwarder"
    );

    let runtime = ForwardRuntime {
        token: Arc::<str>::from(token),
        proxy_addr: args.proxy_addr,
        proxy_tls_name: Arc::<str>::from(args.proxy_tls_name),
        deny_log: Arc::new(args.deny_log),
        secret_table: Arc::new(secret_table),
        tls_connector,
        mitm_tls_connector,
        mitm_ca,
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
    build_tls_connector_with_alpn(Vec::new())
}

fn build_http1_tls_connector() -> Result<TlsConnector> {
    build_tls_connector_with_alpn(vec![HTTP_1_1_ALPN.to_vec()])
}

fn build_tls_connector_with_alpn(alpn_protocols: Vec<Vec<u8>>) -> Result<TlsConnector> {
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
        "failed to load any native root certificates for TLS validation"
    );

    let mut config = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    config.alpn_protocols = alpn_protocols;

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
    let mitm_target = mitm_target_for(
        original_port,
        &domain_extraction.domain,
        &runtime.secret_table,
    );

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

            if let Some(sni) = mitm_target {
                run_mitm_session(&runtime, sni, client_stream, proxy_stream)
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

fn mitm_target_for<'a>(
    original_port: u16,
    domain: &'a str,
    secret_table: &SecretTable,
) -> Option<&'a str> {
    if original_port != 443 || !secret_table.sni_match_set.matches(domain) {
        return None;
    }

    Some(domain)
}

async fn run_mitm_session<C, S>(
    runtime: &ForwardRuntime,
    sni: &str,
    client_stream: C,
    proxy_stream: S,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin,
    S: AsyncRead + AsyncWrite + Unpin,
{
    let upstream_server_name =
        ServerName::try_from(sni.to_string()).context("invalid upstream SNI for MITM TLS")?;
    let mut upstream_tls = runtime
        .mitm_tls_connector
        .connect(upstream_server_name, proxy_stream)
        .await
        .context("failed to establish MITM TLS to upstream via proxy tunnel")?;

    let server_config = runtime
        .mitm_ca
        .server_config_for(sni)
        .await
        .context("failed to build MITM server config for SNI")?;
    let acceptor = TlsAcceptor::from(server_config);
    let mut agent_tls = acceptor
        .accept(client_stream)
        .await
        .context("failed to accept agent TLS for MITM")?;

    match tokio::io::copy_bidirectional(&mut agent_tls, &mut upstream_tls).await {
        Ok(_) => {}
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::BrokenPipe | ErrorKind::ConnectionReset | ErrorKind::UnexpectedEof
            ) =>
        {
            debug!(
                sni,
                error = %error,
                "MITM bidirectional copy ended after peer closed the connection"
            );
        }
        Err(error) => return Err(error).context("MITM bidirectional copy failed"),
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

    use crate::egress_secrets::DomainSet;

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

        let agent_connector = test_tls_connector(
            mitm_ca.ca_cert_der(),
            vec![b"h2".to_vec(), HTTP_1_1_ALPN.to_vec()],
        )?;
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

        run_mitm_session(&runtime, sni, agent_dsbx_io, dsbx_proxy_io).await?;
        agent_task.await.context("test agent task panicked")??;
        upstream_task
            .await
            .context("test upstream task panicked")??;

        Ok(())
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

    fn test_runtime(
        mitm_ca: Arc<MitmCa>,
        upstream_ca_der: CertificateDer<'static>,
    ) -> Result<ForwardRuntime> {
        let tls_connector = test_tls_connector(upstream_ca_der.clone(), Vec::new())?;
        let mitm_tls_connector = test_tls_connector(upstream_ca_der, vec![HTTP_1_1_ALPN.to_vec()])?;

        Ok(ForwardRuntime {
            token: Arc::<str>::from("token"),
            proxy_addr: "127.0.0.1:1".parse()?,
            proxy_tls_name: Arc::<str>::from("proxy.test"),
            deny_log: Arc::new(PathBuf::from("/tmp/dust-egress-denied-test.log")),
            secret_table: Arc::new(SecretTable::default()),
            tls_connector,
            mitm_tls_connector,
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
        server_config.alpn_protocols = vec![HTTP_1_1_ALPN.to_vec()];

        Ok((
            Arc::new(server_config),
            CertificateDer::from(ca_cert.der().to_vec()),
        ))
    }
}
