use anyhow::Result;
use clap::Parser;
use std::net::SocketAddr;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub health_addr: SocketAddr,
    pub tls_cert_path: PathBuf,
    pub tls_key_path: PathBuf,
}

#[derive(Debug, Parser)]
#[command(name = "egress-proxy", about = "Dust sandbox egress proxy")]
struct RawConfig {
    #[arg(long, env = "EGRESS_PROXY_LISTEN_ADDR", default_value = "0.0.0.0:4443")]
    listen_addr: SocketAddr,

    #[arg(long, env = "EGRESS_PROXY_HEALTH_ADDR", default_value = "0.0.0.0:8080")]
    health_addr: SocketAddr,

    #[arg(long, env = "EGRESS_PROXY_TLS_CERT")]
    tls_cert: PathBuf,

    #[arg(long, env = "EGRESS_PROXY_TLS_KEY")]
    tls_key: PathBuf,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let raw = RawConfig::parse();

        Ok(Self {
            listen_addr: raw.listen_addr,
            health_addr: raw.health_addr,
            tls_cert_path: raw.tls_cert,
            tls_key_path: raw.tls_key,
        })
    }
}
