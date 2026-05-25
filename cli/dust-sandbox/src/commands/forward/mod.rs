mod deny_log;
mod domain_extract;
mod handshake;
mod http2;
mod http_framing;
mod http_host;
mod http_rewriter;
mod mitm_session;
mod original_dst;
mod proxy_tunnel;
mod rewrite_policy;
mod session;
mod sni;
mod tls_mitm;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{ensure, Context, Result};
use rustls::pki_types::CertificateDer;
use rustls::ClientConfig;
use rustls::RootCertStore;
use tokio::net::TcpListener;
use tokio_rustls::TlsConnector;
use tracing::{info, warn};

use crate::egress_secrets::SecretTable;

use self::domain_extract::DomainParseResult;
use self::http2::H2UpstreamPool;
use self::mitm_session::{pooled_upstream_opener, PooledUpstreamOpenContext};
use self::proxy_tunnel::ProxyTunnelOpenContext;
use self::session::handle_connection;
use self::tls_mitm::{MitmCa, H2_ALPN, HTTP_1_1_ALPN};

const MITM_CA_CERT_PATH: &str = "/run/dust/egress-ca.pem";
const MITM_CA_KEY_PATH: &str = "/run/dust/egress-ca.key";

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
    /// Test-only original destination port override for direct local e2e connections.
    #[arg(long, hide = true)]
    test_original_dst_port: Option<u16>,
    /// Test-only DER root certificate added to outbound TLS validation.
    #[arg(long, hide = true)]
    extra_root_cert_der: Option<PathBuf>,
    /// Test-only override for the persistent MITM CA certificate path.
    #[arg(long, hide = true, default_value = MITM_CA_CERT_PATH)]
    mitm_ca_cert: PathBuf,
    /// Test-only override for the persistent MITM CA private key path.
    #[arg(long, hide = true, default_value = MITM_CA_KEY_PATH)]
    mitm_ca_key: PathBuf,
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
    mitm_http1_tls_connector: TlsConnector,
    #[cfg(test)]
    mitm_h2_tls_connector: TlsConnector,
    h2_upstream_pool: H2UpstreamPool,
    mitm_ca: Arc<MitmCa>,
    test_original_dst_port: Option<u16>,
}

pub async fn cmd_forward(args: ForwardArgs) -> Result<()> {
    let token = load_token(&args.token_file).await?;
    let extra_root_cert_der = args.extra_root_cert_der.as_deref();
    let tls_connector = build_tls_connector(extra_root_cert_der)?;
    let mitm_http1_tls_connector = build_http1_tls_connector(extra_root_cert_der)?;
    let mitm_h2_tls_connector = build_h2_tls_connector(extra_root_cert_der)?;

    // The CA must be loaded/generated BEFORE we bind the listener. Front uses
    // "port 9990 is LISTEN" as the readiness signal and, the moment that's
    // true, reads /run/dust/egress-ca.pem to build the sandbox trust bundle.
    // Bind-then-write would race: front could see a missing or stale CA file.
    // Keep this ordering intact on restarts too. The in-memory handle backs
    // the SNI-scoped TLS termination path; the on-disk cert is what front
    // installs into the sandbox trust bundle.
    let mitm_ca = Arc::new(
        MitmCa::load_or_generate(&args.mitm_ca_cert, &args.mitm_ca_key)
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

    let token = Arc::<str>::from(token);
    let deny_log = Arc::new(args.deny_log);
    let proxy_tls_name = Arc::<str>::from(args.proxy_tls_name);
    let proxy_tunnel_context = ProxyTunnelOpenContext {
        token: Arc::clone(&token),
        proxy_addr: args.proxy_addr,
        proxy_tls_name: Arc::clone(&proxy_tls_name),
        deny_log: Arc::clone(&deny_log),
        tls_connector: tls_connector.clone(),
    };
    let h2_open_context = PooledUpstreamOpenContext {
        proxy_tunnel: proxy_tunnel_context,
        mitm_h2_tls_connector: mitm_h2_tls_connector.clone(),
    };
    let h2_upstream_pool = H2UpstreamPool::new(pooled_upstream_opener(h2_open_context));

    let runtime = ForwardRuntime {
        token,
        proxy_addr: args.proxy_addr,
        proxy_tls_name,
        deny_log,
        secret_table: Arc::new(secret_table),
        tls_connector,
        mitm_http1_tls_connector,
        #[cfg(test)]
        mitm_h2_tls_connector,
        h2_upstream_pool,
        mitm_ca,
        test_original_dst_port: args.test_original_dst_port,
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

fn build_tls_connector(extra_root_cert_der: Option<&std::path::Path>) -> Result<TlsConnector> {
    build_tls_connector_with_alpn(Vec::new(), extra_root_cert_der)
}

fn build_http1_tls_connector(
    extra_root_cert_der: Option<&std::path::Path>,
) -> Result<TlsConnector> {
    build_tls_connector_with_alpn(vec![HTTP_1_1_ALPN.to_vec()], extra_root_cert_der)
}

fn build_h2_tls_connector(extra_root_cert_der: Option<&std::path::Path>) -> Result<TlsConnector> {
    build_tls_connector_with_alpn(
        vec![H2_ALPN.to_vec(), HTTP_1_1_ALPN.to_vec()],
        extra_root_cert_der,
    )
}

fn build_tls_connector_with_alpn(
    alpn_protocols: Vec<Vec<u8>>,
    extra_root_cert_der: Option<&std::path::Path>,
) -> Result<TlsConnector> {
    // rustls 0.23 requires an explicit process-level CryptoProvider.
    // install_default returns Err if one is already installed; we just want to
    // guarantee some provider is present before ClientConfig::builder().
    let _ = rustls::crypto::ring::default_provider().install_default();

    // Outbound trust set comes from the OS root store via rustls_native_certs.
    // On a wake/restart the trust-bundle installer has already added dsbx's
    // own CA at /etc/ssl/certs/dust-egress.pem, so the restarted dsbx will
    // load its own CA into this outbound trust set. The "dsbx must not trust
    // its own CA on outbound" invariant therefore depends on the threat
    // model: forging a cert signed by that CA requires the private key at
    // /run/dust/egress-ca.key (mode 0600 root-owned). We assume an attacker
    // does not get root in the sandbox, so this is accepted as-is rather
    // than filtered out here. If that assumption ever weakens, switch dsbx
    // outbound to webpki-roots (vendored Mozilla bundle) instead of native.
    let mut roots = RootCertStore::empty();
    let certs = rustls_native_certs::load_native_certs();

    for error in certs.errors {
        warn!(error = %error, "failed to load a native root certificate");
    }

    let (loaded, ignored) = roots.add_parsable_certificates(certs.certs);
    let mut loaded_roots = loaded;
    if ignored != 0 {
        warn!(
            ignored_cert_count = ignored,
            "ignored native root certificates"
        );
    }
    if let Some(extra_root_cert_der) = extra_root_cert_der {
        let der = std::fs::read(extra_root_cert_der).with_context(|| {
            format!(
                "failed to read extra root certificate {}",
                extra_root_cert_der.display()
            )
        })?;
        roots.add(CertificateDer::from(der)).with_context(|| {
            format!(
                "failed to add extra root certificate {}",
                extra_root_cert_der.display()
            )
        })?;
        loaded_roots += 1;
    }
    ensure!(
        loaded_roots != 0,
        "failed to load any native root certificates for TLS validation"
    );

    let mut config = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    config.alpn_protocols = alpn_protocols;

    Ok(TlsConnector::from(Arc::new(config)))
}
