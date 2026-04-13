use anyhow::{anyhow, Result};
use std::net::{SocketAddr, TcpListener as StdTcpListener};
use std::process::{Child, Command, Stdio};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

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

async fn start_proxy() -> Result<ProxyProcess> {
    let health_addr = free_addr()?;

    let mut proxy = ProxyProcess {
        child: Command::new(env!("CARGO_BIN_EXE_egress-proxy"))
            .env("EGRESS_PROXY_HEALTH_ADDR", health_addr.to_string())
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
