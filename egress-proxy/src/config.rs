use anyhow::{anyhow, Result};
use clap::Parser;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

const DEFAULT_POLICY_BASE_URL: &str = "https://storage.googleapis.com/storage/v1";

#[derive(Debug, Clone)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub health_addr: SocketAddr,
    pub tls_cert_path: PathBuf,
    pub tls_key_path: PathBuf,
    pub jwt_secret: String,
    pub policy_bucket: String,
    pub policy_base_url: String,
    pub policy_cache_ttl: Duration,
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

    #[arg(long, env = "EGRESS_PROXY_POLICY_BUCKET")]
    policy_bucket: String,

    #[arg(long, env = "EGRESS_PROXY_POLICY_CACHE_TTL_SECS", default_value = "60")]
    policy_cache_ttl_secs: u64,

    #[arg(
        long,
        env = "EGRESS_PROXY_POLICY_BASE_URL",
        default_value = DEFAULT_POLICY_BASE_URL
    )]
    policy_base_url: String,

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

        if raw.policy_bucket.trim().is_empty() {
            return Err(anyhow!("EGRESS_PROXY_POLICY_BUCKET must not be empty"));
        }

        if raw.policy_cache_ttl_secs == 0 {
            return Err(anyhow!(
                "EGRESS_PROXY_POLICY_CACHE_TTL_SECS must be greater than 0"
            ));
        }

        let policy_base_url = raw.policy_base_url.trim().trim_end_matches('/').to_string();
        if policy_base_url.is_empty() {
            return Err(anyhow!("EGRESS_PROXY_POLICY_BASE_URL must not be empty"));
        }

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
            policy_bucket: raw.policy_bucket,
            policy_base_url,
            policy_cache_ttl: Duration::from_secs(raw.policy_cache_ttl_secs),
            unsafe_skip_ssrf_check,
        })
    }
}

fn parse_bool_env(value: Option<&str>) -> Result<bool> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(false),
        Some("1") => Ok(true),
        Some("0") => Ok(false),
        Some(value) => Err(anyhow!(
            "invalid boolean env value: {value}; expected 0 or 1"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_bool_env, Config, RawConfig, DEFAULT_POLICY_BASE_URL};
    use anyhow::Result;
    use std::net::SocketAddr;
    use std::path::PathBuf;

    #[test]
    fn parses_bool_env() {
        assert!(!parse_bool_env(None).expect("missing bool env should default to false"));
        assert!(!parse_bool_env(Some("")).expect("empty bool env should default to false"));
        assert!(parse_bool_env(Some("1")).expect("1 should parse as true"));
        assert!(!parse_bool_env(Some("0")).expect("0 should parse as false"));
        assert!(parse_bool_env(Some("true")).is_err());
        assert!(parse_bool_env(Some("false")).is_err());
        assert!(parse_bool_env(Some("YES")).is_err());
        assert!(parse_bool_env(Some("NO")).is_err());
        assert!(parse_bool_env(Some("maybe")).is_err());
    }

    #[test]
    fn rejects_zero_policy_cache_ttl() {
        assert!(Config::try_from(raw_config(|raw| {
            raw.policy_cache_ttl_secs = 0;
        }))
        .is_err());
    }

    #[test]
    fn trims_policy_base_url_trailing_slash() -> Result<()> {
        let config = Config::try_from(raw_config(|raw| {
            raw.policy_base_url = format!("{DEFAULT_POLICY_BASE_URL}/");
        }))?;

        assert_eq!(config.policy_base_url, DEFAULT_POLICY_BASE_URL);
        Ok(())
    }

    fn raw_config(update: impl FnOnce(&mut RawConfig)) -> RawConfig {
        let mut raw = RawConfig {
            listen_addr: "0.0.0.0:4443".parse::<SocketAddr>().unwrap(),
            health_addr: "0.0.0.0:8080".parse::<SocketAddr>().unwrap(),
            tls_cert: PathBuf::from("tls.crt"),
            tls_key: PathBuf::from("tls.key"),
            jwt_secret: "secret".to_string(),
            policy_bucket: "test-bucket".to_string(),
            policy_cache_ttl_secs: 60,
            policy_base_url: DEFAULT_POLICY_BASE_URL.to_string(),
            environment: "production".to_string(),
            unsafe_skip_ssrf_check: None,
        };
        update(&mut raw);
        raw
    }
}
