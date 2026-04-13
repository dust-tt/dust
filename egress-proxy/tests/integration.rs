use anyhow::{anyhow, Result};
use std::fs::write;
use std::net::{SocketAddr, TcpListener as StdTcpListener};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const SECRET: &str = "test-secret";

struct ProxyProcess {
    child: Child,
    health_addr: SocketAddr,
}

impl Drop for ProxyProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[tokio::test]
async fn healthz_returns_ok() -> Result<()> {
    let proxy = start_proxy().await?;

    let response = http_get(proxy.health_addr, "/healthz").await?;

    assert!(response.starts_with("HTTP/1.1 200 OK"));
    assert!(response.ends_with("ok"));
    Ok(())
}

#[tokio::test]
async fn invalid_tls_assets_fail_startup() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let tls_key_path = temp_dir.path().join("tls.key");
    write(&tls_key_path, "not a private key")?;
    let health_addr = free_addr()?;

    let mut child = Command::new(env!("CARGO_BIN_EXE_egress-proxy"))
        .env("EGRESS_PROXY_LISTEN_ADDR", "127.0.0.1:4443")
        .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
        .env("EGRESS_PROXY_TLS_CERT", temp_dir.path().join("missing.crt"))
        .env("EGRESS_PROXY_TLS_KEY", &tls_key_path)
        .env("EGRESS_PROXY_JWT_SECRET", SECRET)
        .env("EGRESS_PROXY_ALLOWED_DOMAINS", "example.com")
        .env("EGRESS_PROXY_ENV", "production")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    wait_for_startup_failure(&mut child).await
}

#[tokio::test]
async fn invalid_allowed_domain_fails_startup() -> Result<()> {
    let temp_dir = tempfile::TempDir::new()?;
    let certs = generate_test_certs(temp_dir.path())?;
    let health_addr = free_addr()?;

    let mut child = Command::new(env!("CARGO_BIN_EXE_egress-proxy"))
        .env("EGRESS_PROXY_LISTEN_ADDR", "127.0.0.1:4443")
        .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
        .env("EGRESS_PROXY_TLS_CERT", &certs.server_cert_path)
        .env("EGRESS_PROXY_TLS_KEY", &certs.server_key_path)
        .env("EGRESS_PROXY_JWT_SECRET", SECRET)
        .env("EGRESS_PROXY_ALLOWED_DOMAINS", "example..com")
        .env("EGRESS_PROXY_ENV", "production")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    wait_for_startup_failure(&mut child).await
}

async fn start_proxy() -> Result<ProxyProcess> {
    let temp_dir = tempfile::TempDir::new()?;
    let certs = generate_test_certs(temp_dir.path())?;
    let health_addr = free_addr()?;

    let mut proxy = ProxyProcess {
        child: Command::new(env!("CARGO_BIN_EXE_egress-proxy"))
            .env("EGRESS_PROXY_LISTEN_ADDR", "127.0.0.1:4443")
            .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
            .env("EGRESS_PROXY_TLS_CERT", &certs.server_cert_path)
            .env("EGRESS_PROXY_TLS_KEY", &certs.server_key_path)
            .env("EGRESS_PROXY_JWT_SECRET", SECRET)
            .env("EGRESS_PROXY_ALLOWED_DOMAINS", "example.com")
            .env("EGRESS_PROXY_ENV", "production")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?,
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

async fn wait_for_startup_failure(child: &mut Child) -> Result<()> {
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

async fn http_get(addr: SocketAddr, path: &str) -> Result<String> {
    let mut stream = TcpStream::connect(addr).await?;
    let request = format!("GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response).await?;
    Ok(String::from_utf8(response)?)
}

fn free_addr() -> Result<SocketAddr> {
    let listener = StdTcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?)
}

struct TestCerts {
    server_cert_path: PathBuf,
    server_key_path: PathBuf,
}

fn generate_test_certs(temp_dir: &Path) -> Result<TestCerts> {
    // TODO(sandbox-egress): Nice-to-have cleanup: generate these certificates with rcgen instead
    // of shelling out to openssl, so tests do not need a system openssl binary.
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
        server_cert_path,
        server_key_path,
    })
}
