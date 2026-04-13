use anyhow::{anyhow, Result};
use std::env;
use std::net::SocketAddr;

const DEFAULT_HEALTH_ADDR: &str = "0.0.0.0:8080";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub health_addr: SocketAddr,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let health_addr = match env::var("EGRESS_PROXY_HEALTH_ADDR") {
            Ok(value) if !value.trim().is_empty() => parse_socket_addr(&value)?,
            Ok(_) | Err(env::VarError::NotPresent) => parse_socket_addr(DEFAULT_HEALTH_ADDR)?,
            Err(env::VarError::NotUnicode(_)) => {
                return Err(anyhow!("EGRESS_PROXY_HEALTH_ADDR must be valid unicode"));
            }
        };

        Ok(Self { health_addr })
    }
}

fn parse_socket_addr(value: &str) -> Result<SocketAddr> {
    value
        .parse()
        .map_err(|error| anyhow!("invalid socket address {value:?}: {error}"))
}

#[cfg(test)]
mod tests {
    use super::parse_socket_addr;

    #[test]
    fn parses_socket_addresses() {
        assert_eq!(
            parse_socket_addr("127.0.0.1:8080").unwrap().to_string(),
            "127.0.0.1:8080"
        );
    }

    #[test]
    fn rejects_invalid_socket_addresses() {
        assert!(parse_socket_addr("not-an-addr").is_err());
        assert!(parse_socket_addr("127.0.0.1").is_err());
    }
}
