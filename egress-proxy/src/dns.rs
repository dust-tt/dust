use anyhow::{anyhow, Result};
use std::net::{IpAddr, SocketAddr};
use tokio::net::lookup_host;

#[derive(Debug, Clone)]
pub struct DnsResolver {}

impl DnsResolver {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn resolve(&self, domain: &str, port: u16) -> Result<Vec<SocketAddr>> {
        if let Ok(ip) = domain.parse::<IpAddr>() {
            return Ok(vec![SocketAddr::new(ip, port)]);
        }

        let addresses = lookup_host((domain, port)).await?.collect::<Vec<_>>();

        if addresses.is_empty() {
            return Err(anyhow!("no addresses resolved for domain"));
        }

        Ok(addresses)
    }
}

impl Default for DnsResolver {
    fn default() -> Self {
        Self::new()
    }
}
