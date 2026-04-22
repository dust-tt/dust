use anyhow::{anyhow, Result};
use axum::extract::State;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::Router;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use rustls::pki_types::{pem::PemObject, CertificateDer, ServerName};
use rustls::RootCertStore;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::fs::write;
use std::io::Read;
use std::net::{Ipv6Addr, SocketAddr, TcpListener as StdTcpListener};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::Once;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinSet;
use tokio_rustls::TlsConnector;

const SECRET: &str = "test-secret";
const ALLOW_RESPONSE: u8 = 0x00;
const DENY_RESPONSE: u8 = 0x01;
const TEST_BUCKET: &str = "test-egress-policies";
const TEST_WORKSPACE_ID: &str = "workspace-123";
const TEST_SANDBOX_ID: &str = "test-egress-proxy";
static INSTALL_RUSTLS_PROVIDER: Once = Once::new();

struct ProxyProcess {
    child: Child,
    _temp_dir: TempDir,
    _mock_gcs: MockGcsServer,
    ca_cert_path: PathBuf,
    proxy_addr: SocketAddr,
    health_addr: SocketAddr,
}

struct MockGcsServer {
    addr: SocketAddr,
    handle: tokio::task::JoinHandle<()>,
}

#[derive(Clone)]
struct MockGcsState {
    objects: Arc<HashMap<String, MockGcsResponse>>,
}

#[derive(Clone)]
enum MockGcsResponse {
    Policy(String),
    Status(StatusCode),
}

#[derive(Default)]
struct MockPolicies {
    sandbox: Option<MockGcsResponse>,
    workspace: Option<MockGcsResponse>,
}

#[derive(Debug, Serialize)]
struct TestClaims {
    #[serde(rename = "sbId")]
    sb_id: String,
    #[serde(rename = "wId", skip_serializing_if = "Option::is_none")]
    w_id: Option<String>,
    iss: String,
    aud: String,
    exp: usize,
}

impl Drop for ProxyProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for MockGcsServer {
    fn drop(&mut self) {
        self.handle.abort();
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
async fn invalid_tls_assets_fail_startup() -> Result<()> {
    let temp_dir = TempDir::new()?;
    let tls_key_path = temp_dir.path().join("tls.key");
    write(&tls_key_path, "not a private key")?;
    let proxy_addr = free_addr()?;
    let health_addr = free_addr()?;

    let mut child = Command::new(env!("CARGO_BIN_EXE_egress-proxy"))
        .env("EGRESS_PROXY_LISTEN_ADDR", proxy_addr.to_string())
        .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
        .env("EGRESS_PROXY_TLS_CERT", temp_dir.path().join("missing.crt"))
        .env("EGRESS_PROXY_TLS_KEY", &tls_key_path)
        .env("EGRESS_PROXY_JWT_SECRET", SECRET)
        .env("EGRESS_PROXY_POLICY_BUCKET", TEST_BUCKET)
        .env("EGRESS_PROXY_POLICY_BASE_URL", "http://127.0.0.1:1")
        .env("GOOGLE_CLOUD_ACCESS_TOKEN", "test-access-token")
        .env("EGRESS_PROXY_ENV", "production")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    wait_for_startup_failure(&mut child).await
}

#[tokio::test]
async fn missing_policy_bucket_fails_startup() -> Result<()> {
    let temp_dir = TempDir::new()?;
    let certs = generate_test_certs(temp_dir.path())?;
    let proxy_addr = free_addr()?;
    let health_addr = free_addr()?;

    let mut child = Command::new(env!("CARGO_BIN_EXE_egress-proxy"))
        .env("EGRESS_PROXY_LISTEN_ADDR", proxy_addr.to_string())
        .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
        .env("EGRESS_PROXY_TLS_CERT", &certs.server_cert_path)
        .env("EGRESS_PROXY_TLS_KEY", &certs.server_key_path)
        .env("EGRESS_PROXY_JWT_SECRET", SECRET)
        .env("EGRESS_PROXY_POLICY_BASE_URL", "http://127.0.0.1:1")
        .env("GOOGLE_CLOUD_ACCESS_TOKEN", "test-access-token")
        .env("EGRESS_PROXY_ENV", "production")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    wait_for_startup_failure(&mut child).await
}

#[tokio::test]
async fn allowed_domain_forwards_bytes() -> Result<()> {
    let (upstream_port, mut upstream_handles) =
        start_localhost_servers(UpstreamBehavior::EchoFixed { read_len: 4 }).await?;
    let proxy = start_proxy("localhost", true, "test").await?;
    let token = make_token(SECRET, 60);
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "localhost", upstream_port)?)
        .await?;

    let mut response = [0; 1];
    stream.read_exact(&mut response).await?;
    assert_eq!(response[0], ALLOW_RESPONSE);

    stream.write_all(b"ping").await?;
    let mut echoed = [0; 4];
    stream.read_exact(&mut echoed).await?;
    assert_eq!(&echoed, b"ping");

    drop(stream);
    wait_for_upstream_completion(&mut upstream_handles, Duration::from_secs(2)).await?;
    Ok(())
}

#[tokio::test]
async fn workspace_policy_allows_bytes_without_sandbox_policy() -> Result<()> {
    let (upstream_port, mut upstream_handles) =
        start_localhost_servers(UpstreamBehavior::EchoFixed { read_len: 4 }).await?;
    let proxy = start_proxy_with_policies(
        MockPolicies {
            workspace: Some(policy_response(&["localhost"])),
            ..MockPolicies::default()
        },
        true,
        "test",
    )
    .await?;
    let token = make_token(SECRET, 60);
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "localhost", upstream_port)?)
        .await?;

    let mut response = [0; 1];
    stream.read_exact(&mut response).await?;
    assert_eq!(response[0], ALLOW_RESPONSE);

    stream.write_all(b"ping").await?;
    let mut echoed = [0; 4];
    stream.read_exact(&mut echoed).await?;
    assert_eq!(&echoed, b"ping");

    drop(stream);
    wait_for_upstream_completion(&mut upstream_handles, Duration::from_secs(2)).await?;
    Ok(())
}

#[tokio::test]
async fn workspace_lookup_failure_falls_back_to_sandbox_policy() -> Result<()> {
    let (upstream_port, mut upstream_handles) =
        start_localhost_servers(UpstreamBehavior::EchoFixed { read_len: 4 }).await?;
    let proxy = start_proxy_with_policies(
        MockPolicies {
            sandbox: Some(policy_response(&["localhost"])),
            workspace: Some(MockGcsResponse::Status(StatusCode::INTERNAL_SERVER_ERROR)),
        },
        true,
        "test",
    )
    .await?;
    let token = make_token(SECRET, 60);
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "localhost", upstream_port)?)
        .await?;

    let mut response = [0; 1];
    stream.read_exact(&mut response).await?;
    assert_eq!(response[0], ALLOW_RESPONSE);

    stream.write_all(b"ping").await?;
    let mut echoed = [0; 4];
    stream.read_exact(&mut echoed).await?;
    assert_eq!(&echoed, b"ping");

    drop(stream);
    wait_for_upstream_completion(&mut upstream_handles, Duration::from_secs(2)).await?;
    Ok(())
}

#[tokio::test]
async fn sandbox_lookup_failure_falls_back_to_workspace_policy() -> Result<()> {
    let (upstream_port, mut upstream_handles) =
        start_localhost_servers(UpstreamBehavior::EchoFixed { read_len: 4 }).await?;
    let proxy = start_proxy_with_policies(
        MockPolicies {
            sandbox: Some(MockGcsResponse::Status(StatusCode::INTERNAL_SERVER_ERROR)),
            workspace: Some(policy_response(&["localhost"])),
        },
        true,
        "test",
    )
    .await?;
    let token = make_token(SECRET, 60);
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "localhost", upstream_port)?)
        .await?;

    let mut response = [0; 1];
    stream.read_exact(&mut response).await?;
    assert_eq!(response[0], ALLOW_RESPONSE);

    stream.write_all(b"ping").await?;
    let mut echoed = [0; 4];
    stream.read_exact(&mut echoed).await?;
    assert_eq!(&echoed, b"ping");

    drop(stream);
    wait_for_upstream_completion(&mut upstream_handles, Duration::from_secs(2)).await?;
    Ok(())
}

#[tokio::test]
async fn sandbox_policy_still_applies_when_token_has_no_workspace_id() -> Result<()> {
    let (upstream_port, mut upstream_handles) =
        start_localhost_servers(UpstreamBehavior::EchoFixed { read_len: 4 }).await?;
    let proxy = start_proxy("localhost", true, "test").await?;
    let token = make_token_with_claims(
        SECRET,
        FullClaims {
            sb_id: TEST_SANDBOX_ID,
            w_id: None,
            iss: "dust-front",
            aud: "dust-egress-proxy",
            exp_offset_seconds: 60,
        },
    );
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "localhost", upstream_port)?)
        .await?;

    let mut response = [0; 1];
    stream.read_exact(&mut response).await?;
    assert_eq!(response[0], ALLOW_RESPONSE);

    stream.write_all(b"ping").await?;
    let mut echoed = [0; 4];
    stream.read_exact(&mut echoed).await?;
    assert_eq!(&echoed, b"ping");

    drop(stream);
    wait_for_upstream_completion(&mut upstream_handles, Duration::from_secs(2)).await?;
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
async fn invalid_issuer_returns_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token_with_claims(
        SECRET,
        FullClaims {
            sb_id: TEST_SANDBOX_ID,
            w_id: Some(TEST_WORKSPACE_ID),
            iss: "wrong-front",
            aud: "dust-egress-proxy",
            exp_offset_seconds: 60,
        },
    );

    let response = send_handshake(&proxy, &token, "example.com", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn invalid_audience_returns_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token_with_claims(
        SECRET,
        FullClaims {
            sb_id: TEST_SANDBOX_ID,
            w_id: Some(TEST_WORKSPACE_ID),
            iss: "dust-front",
            aud: "wrong-audience",
            exp_offset_seconds: 60,
        },
    );

    let response = send_handshake(&proxy, &token, "example.com", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn empty_sandbox_id_claim_returns_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token_with_claims(
        SECRET,
        FullClaims {
            sb_id: "   ",
            w_id: Some(TEST_WORKSPACE_ID),
            iss: "dust-front",
            aud: "dust-egress-proxy",
            exp_offset_seconds: 60,
        },
    );

    let response = send_handshake(&proxy, &token, "example.com", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn allowed_loopback_without_ssrf_bypass_returns_deny() -> Result<()> {
    let proxy = start_proxy("localhost", false, "production").await?;
    let token = make_token(SECRET, 60);

    let response = send_handshake(&proxy, &token, "localhost", 443).await?;

    assert_eq!(response, Some(DENY_RESPONSE));
    Ok(())
}

#[tokio::test]
async fn unsafe_ip_literals_return_deny() -> Result<()> {
    let token = make_token(SECRET, 60);

    for domain in [
        "127.0.0.1",
        "::1",
        "::ffff:127.0.0.1",
        "::ffff:169.254.169.254",
    ] {
        let proxy = start_proxy(domain, false, "production").await?;
        let response = send_handshake(&proxy, &token, domain, 443).await?;

        assert_eq!(
            response,
            Some(DENY_RESPONSE),
            "unexpected response for {domain}"
        );
    }

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
async fn dns_resolution_failure_returns_deny() -> Result<()> {
    let unresolved_domain = "sandbox-egress-contract-test.invalid";
    let proxy = start_proxy(unresolved_domain, false, "production").await?;
    let token = make_token(SECRET, 60);

    let response = send_handshake(&proxy, &token, unresolved_domain, 443).await?;

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
async fn upstream_connect_failure_returns_deny() -> Result<()> {
    let upstream_addr = free_addr()?;
    let proxy = start_proxy("localhost", true, "test").await?;
    let token = make_token(SECRET, 60);

    let response = send_handshake(&proxy, &token, "localhost", upstream_addr.port()).await?;

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
async fn complete_malformed_handshakes_return_deny() -> Result<()> {
    let proxy = start_proxy("example.com", false, "production").await?;
    let token = make_token(SECRET, 60);

    for frame in [
        build_frame("", "example.com", 443)?,
        build_frame(&token, "example..com", 443)?,
        build_frame(&token, "host:443", 443)?,
        build_frame(&token, "example.com", 0)?,
        build_oversized_domain_frame(&token),
    ] {
        let response = send_raw_frame(&proxy, &frame).await?;
        assert_eq!(response, Some(DENY_RESPONSE));
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
        .env("EGRESS_PROXY_POLICY_BUCKET", TEST_BUCKET)
        .env("EGRESS_PROXY_POLICY_BASE_URL", "http://127.0.0.1:1")
        .env("GOOGLE_CLOUD_ACCESS_TOKEN", "test-access-token")
        .env("EGRESS_PROXY_ENV", "production")
        .env("EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    wait_for_startup_failure(&mut child).await
}

#[tokio::test]
async fn health_bind_failure_fails_startup() -> Result<()> {
    let temp_dir = TempDir::new()?;
    let certs = generate_test_certs(temp_dir.path())?;
    let proxy_addr = free_addr()?;
    let occupied_health_listener = StdTcpListener::bind("127.0.0.1:0")?;
    let health_addr = occupied_health_listener.local_addr()?;

    let mut child = Command::new(env!("CARGO_BIN_EXE_egress-proxy"))
        .env("EGRESS_PROXY_LISTEN_ADDR", proxy_addr.to_string())
        .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
        .env("EGRESS_PROXY_TLS_CERT", certs.server_cert_path)
        .env("EGRESS_PROXY_TLS_KEY", certs.server_key_path)
        .env("EGRESS_PROXY_JWT_SECRET", SECRET)
        .env("EGRESS_PROXY_POLICY_BUCKET", TEST_BUCKET)
        .env("EGRESS_PROXY_POLICY_BASE_URL", "http://127.0.0.1:1")
        .env("GOOGLE_CLOUD_ACCESS_TOKEN", "test-access-token")
        .env("EGRESS_PROXY_ENV", "production")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    wait_for_startup_failure(&mut child).await
}

#[tokio::test]
async fn relay_supports_upstream_banner_and_large_response() -> Result<()> {
    let request = vec![b'x'; 32 * 1024];
    let response = vec![b'y'; 48 * 1024];
    let banner = b"upstream-ready".to_vec();
    let (upstream_port, mut upstream_handles) =
        start_localhost_servers(UpstreamBehavior::BannerThenReply {
            banner: banner.clone(),
            expected_request: request.clone(),
            response: response.clone(),
        })
        .await?;
    let proxy = start_proxy("localhost", true, "test").await?;
    let token = make_token(SECRET, 60);
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "localhost", upstream_port)?)
        .await?;

    let mut allow_response = [0; 1];
    stream.read_exact(&mut allow_response).await?;
    assert_eq!(allow_response[0], ALLOW_RESPONSE);

    let mut received_banner = vec![0; banner.len()];
    stream.read_exact(&mut received_banner).await?;
    assert_eq!(received_banner, banner);

    stream.write_all(&request).await?;
    let mut received_response = vec![0; response.len()];
    stream.read_exact(&mut received_response).await?;
    assert_eq!(received_response, response);

    drop(stream);
    wait_for_upstream_completion(&mut upstream_handles, Duration::from_secs(2)).await?;
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn sigterm_keeps_active_tunnel_alive_until_client_closes() -> Result<()> {
    let (upstream_port, mut upstream_handles) =
        start_localhost_servers(UpstreamBehavior::EchoSequence {
            chunks: vec![b"pingpong".to_vec(), b"pingpong".to_vec()],
        })
        .await?;
    let mut proxy = start_proxy("localhost", true, "test").await?;
    let token = make_token(SECRET, 60);
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "localhost", upstream_port)?)
        .await?;

    let mut response = [0; 1];
    stream.read_exact(&mut response).await?;
    assert_eq!(response[0], ALLOW_RESPONSE);

    stream.write_all(b"pingpong").await?;
    let mut echoed = [0; 8];
    stream.read_exact(&mut echoed).await?;
    assert_eq!(&echoed, b"pingpong");

    send_sigterm(proxy.child.id()).await?;

    stream.write_all(b"pingpong").await?;
    stream.read_exact(&mut echoed).await?;
    assert_eq!(&echoed, b"pingpong");

    drop(stream);
    wait_for_exit(&mut proxy.child, Duration::from_secs(2), true).await?;
    wait_for_upstream_completion(&mut upstream_handles, Duration::from_secs(2)).await?;
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn sigterm_aborts_stuck_tunnel_after_drain_timeout() -> Result<()> {
    let (upstream_port, mut upstream_handles) =
        start_localhost_servers(UpstreamBehavior::HoldUntilPeerCloses).await?;
    let mut proxy = start_proxy("localhost", true, "test").await?;
    let token = make_token(SECRET, 60);
    let mut stream = connect_forwarder(&proxy).await?;

    stream
        .write_all(&build_frame(&token, "localhost", upstream_port)?)
        .await?;

    let mut response = [0; 1];
    stream.read_exact(&mut response).await?;
    assert_eq!(response[0], ALLOW_RESPONSE);

    send_sigterm(proxy.child.id()).await?;
    wait_for_exit(&mut proxy.child, Duration::from_secs(8), true).await?;

    let mut buffer = [0; 1];
    match tokio::time::timeout(Duration::from_secs(2), stream.read(&mut buffer)).await {
        Ok(Ok(0)) => {}
        Ok(Err(_)) => {}
        Ok(Ok(read_bytes)) => {
            return Err(anyhow!(
                "expected tunnel close after shutdown drain timeout, read {read_bytes} byte(s)"
            ));
        }
        Err(error) => return Err(error.into()),
    }

    wait_for_upstream_completion(&mut upstream_handles, Duration::from_secs(2)).await?;
    Ok(())
}

async fn start_proxy(
    allowed_domains: &str,
    unsafe_skip_ssrf_check: bool,
    environment: &str,
) -> Result<ProxyProcess> {
    let policy = policy_response(
        &allowed_domains
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>(),
    );

    start_proxy_with_policies(
        MockPolicies {
            sandbox: Some(policy),
            ..MockPolicies::default()
        },
        unsafe_skip_ssrf_check,
        environment,
    )
    .await
}

async fn start_proxy_with_policies(
    policies: MockPolicies,
    unsafe_skip_ssrf_check: bool,
    environment: &str,
) -> Result<ProxyProcess> {
    let temp_dir = TempDir::new()?;
    let certs = generate_test_certs(temp_dir.path())?;
    let proxy_addr = free_addr()?;
    let health_addr = free_addr()?;
    let mock_gcs = start_mock_gcs_server(policies).await?;

    let mut command = Command::new(env!("CARGO_BIN_EXE_egress-proxy"));
    command
        .env("EGRESS_PROXY_LISTEN_ADDR", proxy_addr.to_string())
        .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
        .env("EGRESS_PROXY_TLS_CERT", &certs.server_cert_path)
        .env("EGRESS_PROXY_TLS_KEY", &certs.server_key_path)
        .env("EGRESS_PROXY_JWT_SECRET", SECRET)
        .env("EGRESS_PROXY_POLICY_BUCKET", TEST_BUCKET)
        .env(
            "EGRESS_PROXY_POLICY_BASE_URL",
            format!("http://{}", mock_gcs.addr),
        )
        .env("GOOGLE_CLOUD_ACCESS_TOKEN", "test-access-token")
        .env("EGRESS_PROXY_ENV", environment)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    if unsafe_skip_ssrf_check {
        command.env("EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK", "1");
    }

    let mut proxy = ProxyProcess {
        child: command.spawn()?,
        _temp_dir: temp_dir,
        _mock_gcs: mock_gcs,
        ca_cert_path: certs.ca_cert_path,
        proxy_addr,
        health_addr,
    };

    wait_for_health(&mut proxy.child, proxy.health_addr).await?;

    Ok(proxy)
}

async fn start_mock_gcs_server(policies: MockPolicies) -> Result<MockGcsServer> {
    let mut objects = HashMap::new();
    if let Some(workspace) = policies.workspace {
        objects.insert(format!("workspaces/{TEST_WORKSPACE_ID}.json"), workspace);
    }
    if let Some(sandbox) = policies.sandbox {
        objects.insert(format!("sandboxes/{TEST_SANDBOX_ID}.json"), sandbox);
    }

    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let state = MockGcsState {
        objects: Arc::new(objects),
    };
    let app = Router::new()
        .fallback(any(mock_gcs_handler))
        .with_state(state);
    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    Ok(MockGcsServer { addr, handle })
}

async fn mock_gcs_handler(State(state): State<MockGcsState>, uri: Uri) -> Response {
    let Some(encoded_object) = uri.path().split("/o/").nth(1) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(object_name) = urlencoding::decode(encoded_object) else {
        return StatusCode::BAD_REQUEST.into_response();
    };

    match state.objects.get(object_name.as_ref()) {
        Some(MockGcsResponse::Policy(body)) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/json")],
            body.clone(),
        )
            .into_response(),
        Some(MockGcsResponse::Status(status)) => status.into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

fn policy_response(domains: &[&str]) -> MockGcsResponse {
    MockGcsResponse::Policy(
        json!({
            "defaultAction": "deny",
            "rules": domains
                .iter()
                .map(|domain| json!({ "action": "allow", "domain": domain }))
                .collect::<Vec<_>>(),
        })
        .to_string(),
    )
}

async fn wait_for_health(child: &mut Child, health_addr: SocketAddr) -> Result<()> {
    for _ in 0..100 {
        if let Some(status) = child.try_wait()? {
            let stderr = read_child_stderr(child)?;
            return Err(anyhow!(
                "proxy exited before becoming healthy: {status}; stderr: {stderr}"
            ));
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

fn read_child_stderr(child: &mut Child) -> Result<String> {
    let Some(stderr) = child.stderr.as_mut() else {
        return Ok("<stderr not captured>".to_string());
    };

    let mut output = String::new();
    stderr.read_to_string(&mut output)?;
    Ok(output.trim().to_string())
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
    INSTALL_RUSTLS_PROVIDER.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });

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
    Ok(CertificateDer::pem_file_iter(path)?.collect::<Result<Vec<_>, _>>()?)
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

fn build_oversized_domain_frame(token: &str) -> Vec<u8> {
    let token_bytes = token.as_bytes();
    let token_len = u16::try_from(token_bytes.len()).expect("test token length should fit in u16");
    let mut frame = Vec::with_capacity(1 + 2 + token_bytes.len() + 2);

    frame.push(0x01);
    frame.extend_from_slice(&token_len.to_be_bytes());
    frame.extend_from_slice(token_bytes);
    frame.extend_from_slice(&254_u16.to_be_bytes());

    frame
}

fn make_token(secret: &str, exp_offset_seconds: i64) -> String {
    make_token_with_claims(
        secret,
        FullClaims {
            sb_id: TEST_SANDBOX_ID,
            w_id: Some(TEST_WORKSPACE_ID),
            iss: "dust-front",
            aud: "dust-egress-proxy",
            exp_offset_seconds,
        },
    )
}

fn make_token_with_claims(secret: &str, claims: FullClaims<'_>) -> String {
    let now_seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("current time should be after the Unix epoch")
        .as_secs();
    let exp = if claims.exp_offset_seconds.is_negative() {
        now_seconds - claims.exp_offset_seconds.unsigned_abs()
    } else {
        now_seconds + claims.exp_offset_seconds.unsigned_abs()
    };
    let claims = TestClaims {
        sb_id: claims.sb_id.to_string(),
        w_id: claims.w_id.map(str::to_string),
        iss: claims.iss.to_string(),
        aud: claims.aud.to_string(),
        exp: usize::try_from(exp).expect("expiration timestamp should fit in usize"),
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("test helper should encode JWT successfully")
}

struct TestCerts {
    ca_cert_path: PathBuf,
    server_cert_path: PathBuf,
    server_key_path: PathBuf,
}

struct FullClaims<'a> {
    sb_id: &'a str,
    w_id: Option<&'a str>,
    iss: &'a str,
    aud: &'a str,
    exp_offset_seconds: i64,
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
        ca_cert_path,
        server_cert_path,
        server_key_path,
    })
}

#[derive(Clone)]
enum UpstreamBehavior {
    EchoFixed {
        read_len: usize,
    },
    EchoSequence {
        chunks: Vec<Vec<u8>>,
    },
    BannerThenReply {
        banner: Vec<u8>,
        expected_request: Vec<u8>,
        response: Vec<u8>,
    },
    HoldUntilPeerCloses,
}

async fn start_localhost_servers(behavior: UpstreamBehavior) -> Result<(u16, JoinSet<Result<()>>)> {
    let ipv4_listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = ipv4_listener.local_addr()?.port();
    let mut handles = JoinSet::new();
    spawn_upstream_server(&mut handles, ipv4_listener, behavior.clone());

    let ipv6_addr = SocketAddr::new(Ipv6Addr::LOCALHOST.into(), port);
    if let Ok(ipv6_listener) = TcpListener::bind(ipv6_addr).await {
        spawn_upstream_server(&mut handles, ipv6_listener, behavior);
    }

    Ok((port, handles))
}

fn spawn_upstream_server(
    handles: &mut JoinSet<Result<()>>,
    listener: TcpListener,
    behavior: UpstreamBehavior,
) {
    handles.spawn(async move {
        let (mut stream, _) = listener.accept().await?;
        match behavior {
            UpstreamBehavior::EchoFixed { read_len } => {
                let mut buffer = vec![0; read_len];
                stream.read_exact(&mut buffer).await?;
                stream.write_all(&buffer).await?;
            }
            UpstreamBehavior::EchoSequence { chunks } => {
                for expected_chunk in chunks {
                    let mut received_chunk = vec![0; expected_chunk.len()];
                    stream.read_exact(&mut received_chunk).await?;
                    assert_eq!(received_chunk, expected_chunk);
                    stream.write_all(&received_chunk).await?;
                }
            }
            UpstreamBehavior::BannerThenReply {
                banner,
                expected_request,
                response,
            } => {
                stream.write_all(&banner).await?;
                let mut received_request = vec![0; expected_request.len()];
                stream.read_exact(&mut received_request).await?;
                assert_eq!(received_request, expected_request);
                stream.write_all(&response).await?;
            }
            UpstreamBehavior::HoldUntilPeerCloses => {
                let mut buffer = [0; 1024];
                while stream.read(&mut buffer).await? != 0 {}
            }
        }
        Ok(())
    });
}

async fn wait_for_upstream_completion(
    handles: &mut JoinSet<Result<()>>,
    timeout_duration: Duration,
) -> Result<()> {
    let join_result = tokio::time::timeout(timeout_duration, handles.join_next()).await?;
    handles.abort_all();

    match join_result {
        Some(result) => result?,
        None => Err(anyhow!("no echo server handled the connection")),
    }
}

fn free_addr() -> Result<SocketAddr> {
    let listener = StdTcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?)
}

#[cfg(unix)]
async fn send_sigterm(pid: u32) -> Result<()> {
    let status = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status()?;

    if !status.success() {
        return Err(anyhow!("failed to send SIGTERM to process {pid}"));
    }

    Ok(())
}

async fn wait_for_exit(
    child: &mut Child,
    timeout_duration: Duration,
    expect_success: bool,
) -> Result<()> {
    let deadline = tokio::time::Instant::now() + timeout_duration;

    loop {
        if let Some(status) = child.try_wait()? {
            if expect_success {
                assert!(
                    status.success(),
                    "expected successful exit, got status {status}"
                );
            } else {
                assert!(!status.success(), "expected non-success exit, got {status}");
            }
            return Ok(());
        }

        if tokio::time::Instant::now() >= deadline {
            break;
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    Err(anyhow!("process did not exit within {timeout_duration:?}"))
}
