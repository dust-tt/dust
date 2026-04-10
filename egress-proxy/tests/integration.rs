use anyhow::{anyhow, Result};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use rustls::pki_types::{CertificateDer, ServerName};
use rustls::RootCertStore;
use serde::Serialize;
use std::fs::write;
use std::fs::File;
use std::io::BufReader;
use std::net::{SocketAddr, TcpListener as StdTcpListener};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::TlsConnector;
use uuid::Uuid;

const SECRET: &str = "test-secret";
const ALLOW_RESPONSE: u8 = 0x00;
const DENY_RESPONSE: u8 = 0x01;

struct ProxyProcess {
    child: Child,
    _temp_dir: TempDir,
    ca_cert_path: PathBuf,
    proxy_addr: SocketAddr,
    health_addr: SocketAddr,
}

#[derive(Debug, Serialize)]
struct TestClaims {
    #[serde(rename = "sbId")]
    sb_id: String,
    iss: &'static str,
    aud: &'static str,
    exp: usize,
}

impl Drop for ProxyProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[tokio::test]
async fn healthz_returns_ok() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;

    let response = http_get(proxy.health_addr, "/healthz").await?;

    assert!(response.starts_with("HTTP/1.1 200 OK"));
    assert!(response.ends_with("ok"));
    Ok(())
}

#[tokio::test]
async fn allowed_domain_forwards_bytes() -> Result<()> {
    let (upstream_addr, upstream_handle) = start_echo_server().await?;
    let proxy = start_proxy("127.0.0.1", true, "test").await?;
    let token = make_token(SECRET, 60);
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "127.0.0.1", upstream_addr.port())?)
        .await?;

    let mut response = [0; 1];
    stream.read_exact(&mut response).await?;
    assert_eq!(response[0], ALLOW_RESPONSE);

    stream.write_all(b"ping").await?;
    let mut echoed = [0; 4];
    stream.read_exact(&mut echoed).await?;
    assert_eq!(&echoed, b"ping");

    drop(stream);
    upstream_handle.await??;
    Ok(())
}

#[tokio::test]
async fn denied_domain_returns_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token(SECRET, 60);

    let response = send_handshake(&proxy, &token, "denied.example.com", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn invalid_jwt_returns_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token("wrong-secret", 60);

    let response = send_handshake(&proxy, &token, "example.com", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn expired_jwt_returns_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token(SECRET, -60);

    let response = send_handshake(&proxy, &token, "example.com", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn allowed_loopback_without_ssrf_bypass_returns_deny() -> Result<()> {
    let proxy = start_proxy("127.0.0.1", false, "production").await?;
    let token = make_token(SECRET, 60);

    let response = send_handshake(&proxy, &token, "127.0.0.1", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn globally_blocklisted_domain_returns_deny() -> Result<()> {
    let proxy = start_proxy("dns.google", false, "production").await?;
    let token = make_token(SECRET, 60);

    let response = send_handshake(&proxy, &token, "dns.google", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn empty_domain_returns_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token(SECRET, 60);

    let response = send_handshake(&proxy, &token, "", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn truncated_handshake_closes_without_response() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let mut stream = connect_forwarder(&proxy).await?;

    stream.write_all(&[0x01, 0x00]).await?;
    stream.shutdown().await?;

    let mut response = [0; 1];
    let read_result =
        tokio::time::timeout(Duration::from_secs(2), stream.read(&mut response)).await;
    match read_result {
        Ok(Ok(0)) => {}
        Ok(Err(_)) => {}
        Ok(Ok(read_bytes)) => return Err(anyhow!("expected close, read {read_bytes} byte(s)")),
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

#[tokio::test]
async fn unsupported_protocol_version_returns_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token(SECRET, 60);
    let mut frame = build_frame(&token, "example.com", 443)?;
    frame[0] = 0x02;

    let response = send_raw_frame(&proxy, &frame).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn unsafe_ssrf_bypass_fails_startup_outside_test_env() -> Result<()> {
    let temp_dir = TempDir::new()?;
    let certs = generate_test_certs(temp_dir.path())?;
    let proxy_addr = free_addr()?;
    let health_addr = free_addr()?;

    let mut child = Command::new(env!("CARGO_BIN_EXE_egress-proxy"))
        .env("EGRESS_PROXY_LISTEN_ADDR", proxy_addr.to_string())
        .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
        .env("EGRESS_PROXY_TLS_CERT", certs.server_cert_path)
        .env("EGRESS_PROXY_TLS_KEY", certs.server_key_path)
        .env("EGRESS_PROXY_JWT_SECRET", SECRET)
        .env("EGRESS_PROXY_ALLOWED_DOMAINS", "127.0.0.1")
        .env("EGRESS_PROXY_ENV", "production")
        .env("EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    for _ in 0..50 {
        if let Some(status) = child.try_wait()? {
            assert!(!status.success());
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    let _ = child.kill();
    let _ = child.wait();
    Err(anyhow!("proxy did not fail startup"))
}

async fn start_proxy(
    allowed_domains: &str,
    unsafe_skip_ssrf_check: bool,
    environment: &str,
) -> Result<ProxyProcess> {
    let temp_dir = TempDir::new()?;
    let certs = generate_test_certs(temp_dir.path())?;
    let proxy_addr = free_addr()?;
    let health_addr = free_addr()?;

    let mut command = Command::new(env!("CARGO_BIN_EXE_egress-proxy"));
    command
        .env("EGRESS_PROXY_LISTEN_ADDR", proxy_addr.to_string())
        .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
        .env("EGRESS_PROXY_TLS_CERT", &certs.server_cert_path)
        .env("EGRESS_PROXY_TLS_KEY", &certs.server_key_path)
        .env("EGRESS_PROXY_JWT_SECRET", SECRET)
        .env("EGRESS_PROXY_ALLOWED_DOMAINS", allowed_domains)
        .env("EGRESS_PROXY_ENV", environment)
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if unsafe_skip_ssrf_check {
        command.env("EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK", "1");
    }

    let mut proxy = ProxyProcess {
        child: command.spawn()?,
        _temp_dir: temp_dir,
        ca_cert_path: certs.ca_cert_path,
        proxy_addr,
        health_addr,
    };

    wait_for_health(&mut proxy.child, proxy.health_addr).await?;

    Ok(proxy)
}

async fn wait_for_health(child: &mut Child, health_addr: SocketAddr) -> Result<()> {
    for _ in 0..100 {
        if let Some(status) = child.try_wait()? {
            return Err(anyhow!("proxy exited before becoming healthy: {status}"));
        }

        if let Ok(response) = http_get(health_addr, "/healthz").await {
            if response.starts_with("HTTP/1.1 200 OK") {
                return Ok(());
            }
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    Err(anyhow!("proxy did not become healthy"))
}

async fn http_get(addr: SocketAddr, path: &str) -> Result<String> {
    let mut stream = TcpStream::connect(addr).await?;
    let request = format!("GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response).await?;
    Ok(String::from_utf8(response)?)
}

async fn send_handshake(
    proxy: &ProxyProcess,
    token: &str,
    domain: &str,
    original_dest_port: u16,
) -> Result<Option<u8>> {
    let frame = build_frame(token, domain, original_dest_port)?;
    send_raw_frame(proxy, &frame).await
}

async fn send_raw_frame(proxy: &ProxyProcess, frame: &[u8]) -> Result<Option<u8>> {
    let mut stream = connect_forwarder(proxy).await?;
    stream.write_all(frame).await?;

    let mut response = [0; 1];
    let read_bytes = stream.read(&mut response).await?;
    if read_bytes == 0 {
        return Ok(None);
    }

    Ok(Some(response[0]))
}

async fn connect_forwarder(
    proxy: &ProxyProcess,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>> {
    let mut root_store = RootCertStore::empty();
    for cert in load_certs(&proxy.ca_cert_path)? {
        root_store.add(cert)?;
    }

    let tls_config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(tls_config));
    let stream = TcpStream::connect(proxy.proxy_addr).await?;
    let server_name = ServerName::try_from("localhost".to_string())?;

    Ok(connector.connect(server_name, stream).await?)
}

fn load_certs(path: &Path) -> Result<Vec<CertificateDer<'static>>> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let certs = rustls_pemfile::certs(&mut reader).collect::<Result<Vec<_>, _>>()?;
    Ok(certs)
}

fn build_frame(token: &str, domain: &str, original_dest_port: u16) -> Result<Vec<u8>> {
    let token_bytes = token.as_bytes();
    let domain_bytes = domain.as_bytes();
    let token_len = u16::try_from(token_bytes.len())?;
    let domain_len = u16::try_from(domain_bytes.len())?;
    let mut frame = Vec::with_capacity(1 + 2 + token_bytes.len() + 2 + domain_bytes.len() + 2);

    frame.push(0x01);
    frame.extend_from_slice(&token_len.to_be_bytes());
    frame.extend_from_slice(token_bytes);
    frame.extend_from_slice(&domain_len.to_be_bytes());
    frame.extend_from_slice(domain_bytes);
    frame.extend_from_slice(&original_dest_port.to_be_bytes());

    Ok(frame)
}

fn make_token(secret: &str, exp_offset_seconds: i64) -> String {
    let now_seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let exp = if exp_offset_seconds.is_negative() {
        now_seconds - exp_offset_seconds.unsigned_abs()
    } else {
        now_seconds + exp_offset_seconds.unsigned_abs()
    };
    let claims = TestClaims {
        sb_id: format!("test-egress-proxy-{}", Uuid::new_v4()),
        iss: "dust-front",
        aud: "dust-egress-proxy",
        exp: usize::try_from(exp).unwrap(),
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .unwrap()
}

struct TestCerts {
    ca_cert_path: PathBuf,
    server_cert_path: PathBuf,
    server_key_path: PathBuf,
}

fn generate_test_certs(temp_dir: &Path) -> Result<TestCerts> {
    let ca_cert_path = temp_dir.join("ca.crt");
    let ca_key_path = temp_dir.join("ca.key");
    let server_cert_path = temp_dir.join("tls.crt");
    let server_key_path = temp_dir.join("tls.key");
    let server_csr_path = temp_dir.join("server.csr");
    let server_ext_path = temp_dir.join("server.ext");
    write(
        &server_ext_path,
        "basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n",
    )?;

    let ca_status = Command::new("openssl")
        .arg("req")
        .arg("-x509")
        .arg("-newkey")
        .arg("rsa:2048")
        .arg("-keyout")
        .arg(&ca_key_path)
        .arg("-out")
        .arg(&ca_cert_path)
        .arg("-sha256")
        .arg("-days")
        .arg("1")
        .arg("-nodes")
        .arg("-subj")
        .arg("/CN=egress-proxy-test-ca")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;

    if !ca_status.success() {
        return Err(anyhow!(
            "failed to generate test CA certificate with openssl"
        ));
    }

    let csr_status = Command::new("openssl")
        .arg("req")
        .arg("-newkey")
        .arg("rsa:2048")
        .arg("-keyout")
        .arg(&server_key_path)
        .arg("-out")
        .arg(&server_csr_path)
        .arg("-nodes")
        .arg("-subj")
        .arg("/CN=localhost")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;

    if !csr_status.success() {
        return Err(anyhow!("failed to generate test server CSR with openssl"));
    }

    let cert_status = Command::new("openssl")
        .arg("x509")
        .arg("-req")
        .arg("-in")
        .arg(&server_csr_path)
        .arg("-CA")
        .arg(&ca_cert_path)
        .arg("-CAkey")
        .arg(&ca_key_path)
        .arg("-CAcreateserial")
        .arg("-out")
        .arg(&server_cert_path)
        .arg("-days")
        .arg("1")
        .arg("-sha256")
        .arg("-extfile")
        .arg(&server_ext_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;

    if !cert_status.success() {
        return Err(anyhow!(
            "failed to sign test server certificate with openssl"
        ));
    }

    Ok(TestCerts {
        ca_cert_path,
        server_cert_path,
        server_key_path,
    })
}

async fn start_echo_server() -> Result<(SocketAddr, tokio::task::JoinHandle<Result<()>>)> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let handle = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await?;
        let mut buffer = [0; 4];
        stream.read_exact(&mut buffer).await?;
        stream.write_all(&buffer).await?;
        Ok(())
    });

    Ok((addr, handle))
}

fn free_addr() -> Result<SocketAddr> {
    let listener = StdTcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?)
}
