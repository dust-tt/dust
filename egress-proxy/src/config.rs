use crate::policy::TemporaryAllowlist;
use anyhow::{anyhow, Result};
use clap::Parser;
use std::net::SocketAddr;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub health_addr: SocketAddr,
    pub tls_cert_path: PathBuf,
    pub tls_key_path: PathBuf,
    pub jwt_secret: String,
    pub temporary_allowlist: TemporaryAllowlist,
    pub environment: String,
    pub unsafe_skip_ssrf_check: bool,
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

    #[arg(long, env = "EGRESS_PROXY_JWT_SECRET")]
    jwt_secret: String,

    #[arg(long, env = "EGRESS_PROXY_ALLOWED_DOMAINS")]
    allowed_domains: String,

    #[arg(long, env = "EGRESS_PROXY_ENV", default_value = "production")]
    environment: String,

    #[arg(long, env = "EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK")]
    unsafe_skip_ssrf_check: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Self::try_from(RawConfig::parse())
    }
}

impl TryFrom<RawConfig> for Config {
    type Error = anyhow::Error;

    fn try_from(raw: RawConfig) -> Result<Self> {
        if raw.jwt_secret.trim().is_empty() {
            return Err(anyhow!("EGRESS_PROXY_JWT_SECRET must not be empty"));
        }

        // TODO(sandbox-egress): Remove EGRESS_PROXY_ALLOWED_DOMAINS when a later PR replaces the
        // temporary process-wide allowlist with GCS-backed per-sandbox policies.
        let temporary_allowlist = TemporaryAllowlist::parse(&raw.allowed_domains)?;

        // TODO(sandbox-egress): Remove this test-only bypass once integration tests can exercise
        // forwarding through a non-private deterministic upstream.
        let unsafe_skip_ssrf_check = parse_bool_env(raw.unsafe_skip_ssrf_check.as_deref())?;
        if unsafe_skip_ssrf_check && raw.environment != "test" {
            return Err(anyhow!(
                "EGRESS_PROXY_UNSAFE_SKIP_SSRF_CHECK requires EGRESS_PROXY_ENV=test"
            ));
        }

        Ok(Self {
            listen_addr: raw.listen_addr,
            health_addr: raw.health_addr,
            tls_cert_path: raw.tls_cert,
            tls_key_path: raw.tls_key,
            jwt_secret: raw.jwt_secret,
            temporary_allowlist,
            environment: raw.environment,
            unsafe_skip_ssrf_check,
        })
    }
}

fn parse_bool_env(value: Option<&str>) -> Result<bool> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(false),
        Some("1") | Some("true") | Some("TRUE") | Some("yes") | Some("YES") => Ok(true),
        Some("0") | Some("false") | Some("FALSE") | Some("no") | Some("NO") => Ok(false),
        Some(value) => Err(anyhow!("invalid boolean env value: {value}")),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_bool_env;

    #[test]
    fn parses_bool_env() {
        assert!(!parse_bool_env(None).unwrap());
        assert!(!parse_bool_env(Some("")).unwrap());
        assert!(parse_bool_env(Some("1")).unwrap());
        assert!(!parse_bool_env(Some("0")).unwrap());
        assert!(parse_bool_env(Some("true")).unwrap());
        assert!(!parse_bool_env(Some("false")).unwrap());
        assert!(parse_bool_env(Some("YES")).unwrap());
        assert!(!parse_bool_env(Some("NO")).unwrap());
        assert!(parse_bool_env(Some("maybe")).is_err());
    }
}
