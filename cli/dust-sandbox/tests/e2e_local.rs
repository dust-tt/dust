use std::collections::{HashMap, HashSet};
use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, ensure, Context, Result};
use base64::{engine::general_purpose, Engine as _};
use bytes::Bytes;
use rcgen::{
    BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType, IsCa, KeyPair,
    KeyUsagePurpose, SanType,
};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName};
use rustls::{ClientConfig, RootCertStore, ServerConfig};
use tempfile::TempDir;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};
use tokio_rustls::{TlsAcceptor, TlsConnector};

const API_DOMAIN: &str = "api.test";
const BLOCKED_DOMAIN: &str = "blocked.test";
const PROXY_DOMAIN: &str = "proxy.test";
const PLACEHOLDER: &str = "__DSEC_0123456789abcdef0123456789abcdef__";
const SECRET_VALUE: &str = "sk-local-e2e";
const ALLOW_RESPONSE: u8 = 0x00;
const DENY_RESPONSE: u8 = 0x01;
const H2_ALPN: &[u8] = b"h2";
const HTTP_1_1_ALPN: &[u8] = b"http/1.1";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn local_forwarder_e2e() -> Result<()> {
    let _ = rustls::crypto::ring::default_provider().install_default();

    h1_mitm_substitutes_secret_header()
        .await
        .context("h1 MITM substitution scenario failed")?;
    h2_mitm_substitutes_secret_header()
        .await
        .context("h2 MITM substitution scenario failed")?;
    h2_to_h1_fallback_uses_http1_upstream()
        .await
        .context("h2-to-h1 fallback scenario failed")?;
    denied_domain_writes_deny_log()
        .await
        .context("denied domain scenario failed")?;
    h1_chunked_request_trailers_are_denied()
        .await
        .context("h1 trailer denial scenario failed")?;

    // WebSocket upgrade remains covered by the focused MITM session unit test.
    // This local e2e keeps the CI path short while exercising proxy handshake,
    // MITM, ALPN, substitution, fallback, and deny-log behavior via subprocess.
    Ok(())
}

async fn h1_mitm_substitutes_secret_header() -> Result<()> {
    let temp = TempDir::new().context("failed to create tempdir")?;
    let ca = TestCa::new()?;
    let (upstream_addr, mut upstream_rx) =
        start_tls_h1_upstream(&ca, API_DOMAIN, vec![HTTP_1_1_ALPN.to_vec()]).await?;
    let proxy = TestProxy::start(
        &ca,
        HashMap::from([((API_DOMAIN.to_string(), 443), upstream_addr)]),
        HashSet::new(),
    )
    .await?;
    let mut forwarder = Forwarder::spawn(&temp, &ca, proxy.addr, 443, secrets_json()).await?;
    let mitm_connector = mitm_connector(&forwarder.mitm_ca_cert, vec![HTTP_1_1_ALPN.to_vec()])?;

    let mut agent = connect_agent_tls(forwarder.listen_addr, API_DOMAIN, mitm_connector).await?;
    agent
        .write_all(
            format!(
                "GET /h1 HTTP/1.1\r\nHost: {API_DOMAIN}\r\nAuthorization: Bearer {PLACEHOLDER}\r\nConnection: close\r\n\r\n"
            )
            .as_bytes(),
        )
        .await?;
    let response = read_until_bytes(&mut agent, b"\r\n\r\nok").await?;
    assert!(String::from_utf8(response)?.contains("\r\n\r\nok"));

    let request = recv_request(&mut upstream_rx).await?;
    assert!(request.contains("GET /h1 HTTP/1.1\r\n"));
    assert!(request.contains("Authorization: Bearer sk-local-e2e\r\n"));
    assert!(!request.contains(PLACEHOLDER));
    assert_eq!(deny_log_text(&forwarder.deny_log).await?, "");

    forwarder.shutdown().await;
    proxy.shutdown();
    Ok(())
}

async fn h2_mitm_substitutes_secret_header() -> Result<()> {
    let temp = TempDir::new().context("failed to create tempdir")?;
    let ca = TestCa::new()?;
    let (upstream_addr, mut upstream_rx) = start_tls_h2_upstream(&ca, API_DOMAIN).await?;
    let proxy = TestProxy::start(
        &ca,
        HashMap::from([((API_DOMAIN.to_string(), 443), upstream_addr)]),
        HashSet::new(),
    )
    .await?;
    let mut forwarder = Forwarder::spawn(&temp, &ca, proxy.addr, 443, secrets_json()).await?;
    let mitm_connector = mitm_connector(&forwarder.mitm_ca_cert, vec![H2_ALPN.to_vec()])?;
    let agent = connect_agent_tls(forwarder.listen_addr, API_DOMAIN, mitm_connector).await?;
    let (mut send_request, connection) = h2::client::handshake(agent).await?;
    let connection_task = tokio::spawn(connection);

    let request = http::Request::builder()
        .method("GET")
        .uri(format!("https://{API_DOMAIN}/h2"))
        .header("authorization", format!("Bearer {PLACEHOLDER}"))
        .body(())?;
    let (response, _body) = send_request.send_request(request, true)?;
    let response = response.await?;
    assert_eq!(response.status(), http::StatusCode::OK);
    assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

    let authorization = upstream_rx
        .recv()
        .await
        .ok_or_else(|| anyhow!("h2 upstream did not report authorization"))?;
    assert_eq!(authorization, format!("Bearer {SECRET_VALUE}"));
    assert_eq!(deny_log_text(&forwarder.deny_log).await?, "");

    drop(send_request);
    connection_task.abort();
    forwarder.shutdown().await;
    proxy.shutdown();
    Ok(())
}

async fn h2_to_h1_fallback_uses_http1_upstream() -> Result<()> {
    let temp = TempDir::new().context("failed to create tempdir")?;
    let ca = TestCa::new()?;
    let (upstream_addr, mut upstream_rx) =
        start_tls_h1_upstream(&ca, API_DOMAIN, vec![HTTP_1_1_ALPN.to_vec()]).await?;
    let proxy = TestProxy::start(
        &ca,
        HashMap::from([((API_DOMAIN.to_string(), 443), upstream_addr)]),
        HashSet::new(),
    )
    .await?;
    let mut forwarder = Forwarder::spawn(&temp, &ca, proxy.addr, 443, secrets_json()).await?;
    let mitm_connector = mitm_connector(&forwarder.mitm_ca_cert, vec![H2_ALPN.to_vec()])?;
    let agent = connect_agent_tls(forwarder.listen_addr, API_DOMAIN, mitm_connector).await?;
    let (mut send_request, connection) = h2::client::handshake(agent).await?;
    let connection_task = tokio::spawn(connection);

    let request = http::Request::builder()
        .method("GET")
        .uri(format!("https://{API_DOMAIN}/fallback"))
        .body(())?;
    let (response, _body) = send_request.send_request(request, true)?;
    let response = response.await?;
    assert_eq!(response.status(), http::StatusCode::OK);
    assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

    let request = recv_request(&mut upstream_rx).await?;
    assert!(request.contains("GET /fallback HTTP/1.1\r\n"));

    drop(send_request);
    connection_task.abort();
    forwarder.shutdown().await;
    proxy.shutdown();
    Ok(())
}

async fn denied_domain_writes_deny_log() -> Result<()> {
    let temp = TempDir::new().context("failed to create tempdir")?;
    let ca = TestCa::new()?;
    let proxy = TestProxy::start(
        &ca,
        HashMap::new(),
        HashSet::from([BLOCKED_DOMAIN.to_string()]),
    )
    .await?;
    let mut forwarder = Forwarder::spawn(&temp, &ca, proxy.addr, 443, "[]").await?;
    let connector = connector_from_root(ca.cert_der.clone(), vec![HTTP_1_1_ALPN.to_vec()])?;
    let _ = connect_agent_tls(forwarder.listen_addr, BLOCKED_DOMAIN, connector).await;

    let deny_log = read_file_eventually(&forwarder.deny_log).await?;
    assert!(deny_log.contains("\"reason\":\"proxy_denied\""));
    assert!(deny_log.contains("\"domain\":\"blocked.test\""));

    forwarder.shutdown().await;
    proxy.shutdown();
    Ok(())
}

async fn h1_chunked_request_trailers_are_denied() -> Result<()> {
    let temp = TempDir::new().context("failed to create tempdir")?;
    let ca = TestCa::new()?;
    let (upstream_addr, mut upstream_rx) =
        start_tls_h1_capture_until_zero_chunk(&ca, API_DOMAIN).await?;
    let proxy = TestProxy::start(
        &ca,
        HashMap::from([((API_DOMAIN.to_string(), 443), upstream_addr)]),
        HashSet::new(),
    )
    .await?;
    let mut forwarder = Forwarder::spawn(&temp, &ca, proxy.addr, 443, secrets_json()).await?;
    let mitm_connector = mitm_connector(&forwarder.mitm_ca_cert, vec![HTTP_1_1_ALPN.to_vec()])?;
    let mut agent = connect_agent_tls(forwarder.listen_addr, API_DOMAIN, mitm_connector).await?;

    agent
        .write_all(
            format!(
                "POST /trailers HTTP/1.1\r\nHost: {API_DOMAIN}\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\nX-Trailer: denied\r\n\r\n"
            )
            .as_bytes(),
        )
        .await?;
    let mut response = Vec::new();
    let _ = agent.read_to_end(&mut response).await;

    let upstream_request = recv_request(&mut upstream_rx).await?;
    assert!(upstream_request.contains("\r\n0\r\n"));
    assert!(!upstream_request.contains("X-Trailer: denied"));
    let deny_log = read_file_eventually(&forwarder.deny_log).await?;
    assert!(deny_log.contains("\"reason\":\"request_trailers_unsupported\""));

    forwarder.shutdown().await;
    proxy.shutdown();
    Ok(())
}

struct Forwarder {
    child: Child,
    listen_addr: SocketAddr,
    deny_log: PathBuf,
    mitm_ca_cert: PathBuf,
}

impl Forwarder {
    async fn spawn(
        temp: &TempDir,
        ca: &TestCa,
        proxy_addr: SocketAddr,
        original_port: u16,
        secrets: &str,
    ) -> Result<Self> {
        let token_file = temp.path().join("token.jwt");
        let secrets_file = temp.path().join("egress-secrets.json");
        let deny_log = temp.path().join("deny.log");
        let extra_root = temp.path().join("proxy-root.der");
        let mitm_ca_cert = temp.path().join("mitm-ca.pem");
        let mitm_ca_key = temp.path().join("mitm-ca.key");
        tokio::fs::write(&token_file, "token").await?;
        tokio::fs::write(&secrets_file, secrets).await?;
        tokio::fs::write(&extra_root, ca.cert_der.as_ref()).await?;

        let listen_addr = unused_addr().await?;
        let mut child = Command::new(env!("CARGO_BIN_EXE_dsbx"))
            .arg("forward")
            .arg("--token-file")
            .arg(&token_file)
            .arg("--proxy-addr")
            .arg(proxy_addr.to_string())
            .arg("--proxy-tls-name")
            .arg(PROXY_DOMAIN)
            .arg("--listen")
            .arg(listen_addr.to_string())
            .arg("--deny-log")
            .arg(&deny_log)
            .arg("--secrets-file")
            .arg(&secrets_file)
            .arg("--extra-root-cert-der")
            .arg(&extra_root)
            .arg("--mitm-ca-cert")
            .arg(&mitm_ca_cert)
            .arg("--mitm-ca-key")
            .arg(&mitm_ca_key)
            .arg("--test-original-dst-port")
            .arg(original_port.to_string())
            .env("RUST_LOG", "info")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("failed to spawn dsbx forward")?;

        let stderr = child.stderr.take().context("missing child stderr")?;
        let (ready_tx, ready_rx) = oneshot::channel();
        tokio::spawn(async move {
            let mut ready_tx = Some(ready_tx);
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.contains("\"level\":\"ERROR\"") || line.contains("\"level\":\"WARN\"") {
                    eprintln!("{line}");
                }
                if line.contains("starting dsbx forwarder") {
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(());
                    }
                }
            }
        });

        tokio::time::timeout(Duration::from_secs(5), ready_rx)
            .await
            .context("timed out waiting for dsbx forward readiness")?
            .context("dsbx forward stderr closed before readiness")?;

        Ok(Self {
            child,
            listen_addr,
            deny_log,
            mitm_ca_cert,
        })
    }

    async fn shutdown(&mut self) {
        let _ = self.child.start_kill();
        let _ = self.child.wait().await;
    }
}

impl Drop for Forwarder {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

struct TestProxy {
    addr: SocketAddr,
    task: tokio::task::JoinHandle<()>,
}

impl TestProxy {
    async fn start(
        ca: &TestCa,
        routes: HashMap<(String, u16), SocketAddr>,
        denied_domains: HashSet<String>,
    ) -> Result<Self> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
        let addr = listener.local_addr()?;
        let acceptor = TlsAcceptor::from(Arc::new(
            ca.server_config(PROXY_DOMAIN, vec![HTTP_1_1_ALPN.to_vec()])?,
        ));
        let routes = Arc::new(routes);
        let denied_domains = Arc::new(denied_domains);
        let task = tokio::spawn(async move {
            loop {
                let Ok((stream, _peer)) = listener.accept().await else {
                    return;
                };
                let acceptor = acceptor.clone();
                let routes = Arc::clone(&routes);
                let denied_domains = Arc::clone(&denied_domains);
                tokio::spawn(async move {
                    let _ = handle_proxy_connection(stream, acceptor, routes, denied_domains).await;
                });
            }
        });

        Ok(Self { addr, task })
    }

    fn shutdown(self) {
        self.task.abort();
    }
}

async fn handle_proxy_connection(
    stream: TcpStream,
    acceptor: TlsAcceptor,
    routes: Arc<HashMap<(String, u16), SocketAddr>>,
    denied_domains: Arc<HashSet<String>>,
) -> Result<()> {
    let mut proxy = acceptor.accept(stream).await?;
    let handshake = read_proxy_handshake(&mut proxy).await?;
    if denied_domains.contains(&handshake.domain) {
        proxy.write_all(&[DENY_RESPONSE]).await?;
        proxy.shutdown().await?;
        return Ok(());
    }
    let Some(target) = routes
        .get(&(handshake.domain.clone(), handshake.port))
        .copied()
    else {
        proxy.write_all(&[DENY_RESPONSE]).await?;
        proxy.shutdown().await?;
        return Ok(());
    };

    proxy.write_all(&[ALLOW_RESPONSE]).await?;
    proxy.flush().await?;
    let mut upstream = TcpStream::connect(target).await?;
    let _ = tokio::io::copy_bidirectional(&mut proxy, &mut upstream).await;
    Ok(())
}

struct ProxyHandshake {
    domain: String,
    port: u16,
}

async fn read_proxy_handshake<R>(reader: &mut R) -> Result<ProxyHandshake>
where
    R: AsyncReadExt + Unpin,
{
    let mut version = [0_u8; 1];
    reader.read_exact(&mut version).await?;
    ensure!(version[0] == 1, "unexpected proxy protocol version");
    let token_len = read_u16(reader).await? as usize;
    let mut token = vec![0_u8; token_len];
    reader.read_exact(&mut token).await?;
    let domain_len = read_u16(reader).await? as usize;
    let mut domain = vec![0_u8; domain_len];
    reader.read_exact(&mut domain).await?;
    let port = read_u16(reader).await?;
    Ok(ProxyHandshake {
        domain: String::from_utf8(domain)?,
        port,
    })
}

async fn read_u16<R>(reader: &mut R) -> Result<u16>
where
    R: AsyncReadExt + Unpin,
{
    let mut bytes = [0_u8; 2];
    reader.read_exact(&mut bytes).await?;
    Ok(u16::from_be_bytes(bytes))
}

async fn start_tls_h1_upstream(
    ca: &TestCa,
    sni: &str,
    alpn_protocols: Vec<Vec<u8>>,
) -> Result<(SocketAddr, mpsc::UnboundedReceiver<String>)> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let addr = listener.local_addr()?;
    let acceptor = TlsAcceptor::from(Arc::new(ca.server_config(sni, alpn_protocols)?));
    let (tx, rx) = mpsc::unbounded_channel();
    tokio::spawn(async move {
        let Ok((stream, _peer)) = listener.accept().await else {
            return;
        };
        let Ok(mut tls) = acceptor.accept(stream).await else {
            return;
        };
        let Ok(request) = read_until_bytes(&mut tls, b"\r\n\r\n").await else {
            return;
        };
        let _ = tx.send(String::from_utf8_lossy(&request).to_string());
        let _ = tls
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
            .await;
        let _ = tls.shutdown().await;
    });
    Ok((addr, rx))
}

async fn start_tls_h1_capture_until_zero_chunk(
    ca: &TestCa,
    sni: &str,
) -> Result<(SocketAddr, mpsc::UnboundedReceiver<String>)> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let addr = listener.local_addr()?;
    let acceptor = TlsAcceptor::from(Arc::new(
        ca.server_config(sni, vec![HTTP_1_1_ALPN.to_vec()])?,
    ));
    let (tx, rx) = mpsc::unbounded_channel();
    tokio::spawn(async move {
        let Ok((stream, _peer)) = listener.accept().await else {
            return;
        };
        let Ok(mut tls) = acceptor.accept(stream).await else {
            return;
        };
        let Ok(request) = read_until_bytes(&mut tls, b"\r\n0\r\n").await else {
            return;
        };
        let _ = tx.send(String::from_utf8_lossy(&request).to_string());
        let _ = tls.shutdown().await;
    });
    Ok((addr, rx))
}

async fn start_tls_h2_upstream(
    ca: &TestCa,
    sni: &str,
) -> Result<(SocketAddr, mpsc::UnboundedReceiver<String>)> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let addr = listener.local_addr()?;
    let acceptor = TlsAcceptor::from(Arc::new(ca.server_config(sni, vec![H2_ALPN.to_vec()])?));
    let (tx, rx) = mpsc::unbounded_channel();
    tokio::spawn(async move {
        let Ok((stream, _peer)) = listener.accept().await else {
            return;
        };
        let Ok(tls) = acceptor.accept(stream).await else {
            return;
        };
        let Ok(mut connection) = h2::server::handshake(tls).await else {
            return;
        };
        let Some(Ok((request, mut respond))) = connection.accept().await else {
            return;
        };
        let authorization = request
            .headers()
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_string();
        let _ = tx.send(authorization);
        let Ok(response) = http::Response::builder()
            .status(http::StatusCode::OK)
            .body(())
        else {
            return;
        };
        let Ok(mut send) = respond.send_response(response, false) else {
            return;
        };
        let _ = send.send_data(Bytes::from_static(b"ok"), true);
        connection.graceful_shutdown();
        let _ = tokio::time::timeout(Duration::from_millis(100), connection.accept()).await;
    });
    Ok((addr, rx))
}

async fn read_until_bytes<R>(reader: &mut R, needle: &[u8]) -> Result<Vec<u8>>
where
    R: AsyncReadExt + Unpin,
{
    let mut out = Vec::new();
    let mut byte = [0_u8; 1];
    loop {
        reader.read_exact(&mut byte).await?;
        out.push(byte[0]);
        if out.ends_with(needle) {
            return Ok(out);
        }
    }
}

async fn connect_agent_tls(
    listen_addr: SocketAddr,
    sni: &str,
    connector: TlsConnector,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>> {
    let stream = TcpStream::connect(listen_addr).await?;
    let server_name = ServerName::try_from(sni.to_string())?;
    connector
        .connect(server_name, stream)
        .await
        .context("failed to connect agent TLS")
}

async fn read_h2_body(mut body: h2::RecvStream) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    while let Some(chunk) = body.data().await {
        let chunk = chunk?;
        out.extend_from_slice(&chunk);
        body.flow_control().release_capacity(chunk.len())?;
    }
    ensure!(body.trailers().await?.is_none(), "unexpected h2 trailers");
    Ok(out)
}

async fn recv_request(rx: &mut mpsc::UnboundedReceiver<String>) -> Result<String> {
    tokio::time::timeout(Duration::from_secs(3), rx.recv())
        .await
        .context("timed out waiting for upstream request")?
        .ok_or_else(|| anyhow!("upstream request channel closed"))
}

async fn unused_addr() -> Result<SocketAddr> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let addr = listener.local_addr()?;
    drop(listener);
    Ok(addr)
}

async fn deny_log_text(path: &Path) -> Result<String> {
    match tokio::fs::read_to_string(path).await {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.into()),
    }
}

async fn read_file_eventually(path: &Path) -> Result<String> {
    for _ in 0..100 {
        let text = deny_log_text(path).await?;
        if !text.is_empty() {
            return Ok(text);
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    deny_log_text(path).await
}

fn secrets_json() -> &'static str {
    r#"[
      {
        "name": "OPENAI_API_KEY",
        "placeholder": "__DSEC_0123456789abcdef0123456789abcdef__",
        "value": "sk-local-e2e",
        "allowedDomains": ["api.test"]
      }
    ]"#
}

fn connector_from_root(
    root: CertificateDer<'static>,
    alpn_protocols: Vec<Vec<u8>>,
) -> Result<TlsConnector> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut roots = RootCertStore::empty();
    roots.add(root)?;
    let mut config = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    config.alpn_protocols = alpn_protocols;
    Ok(TlsConnector::from(Arc::new(config)))
}

fn mitm_connector(path: &Path, alpn_protocols: Vec<Vec<u8>>) -> Result<TlsConnector> {
    let pem = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let der = first_pem_cert_der(&pem)?;
    connector_from_root(CertificateDer::from(der), alpn_protocols)
}

fn first_pem_cert_der(pem: &str) -> Result<Vec<u8>> {
    let body = pem
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<String>();
    general_purpose::STANDARD
        .decode(body)
        .context("failed to decode PEM certificate")
}

struct TestCa {
    cert: Certificate,
    key: KeyPair,
    cert_der: CertificateDer<'static>,
}

impl TestCa {
    fn new() -> Result<Self> {
        let mut params =
            CertificateParams::new(Vec::<String>::new()).context("invalid test CA params")?;
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, "dsbx local e2e CA");
        params.distinguished_name = dn;
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![
            KeyUsagePurpose::KeyCertSign,
            KeyUsagePurpose::CrlSign,
            KeyUsagePurpose::DigitalSignature,
        ];
        let key = KeyPair::generate().context("failed to generate test CA key")?;
        let cert = params.self_signed(&key)?;
        let cert_der = CertificateDer::from(cert.der().to_vec());
        Ok(Self {
            cert,
            key,
            cert_der,
        })
    }

    fn server_config(&self, dns_name: &str, alpn_protocols: Vec<Vec<u8>>) -> Result<ServerConfig> {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let mut params =
            CertificateParams::new(Vec::<String>::new()).context("invalid leaf params")?;
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, dns_name);
        params.distinguished_name = dn;
        params.subject_alt_names = vec![SanType::DnsName(dns_name.to_string().try_into()?)];
        let leaf_key = KeyPair::generate().context("failed to generate leaf key")?;
        let leaf_cert = params.signed_by(&leaf_key, &self.cert, &self.key)?;
        let leaf_der = CertificateDer::from(leaf_cert.der().to_vec());
        let key_der = PrivateKeyDer::from(PrivatePkcs8KeyDer::from(leaf_key.serialize_der()));
        let mut config = ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![leaf_der], key_der)?;
        config.alpn_protocols = alpn_protocols;
        Ok(config)
    }
}
