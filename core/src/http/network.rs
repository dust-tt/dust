use anyhow::{anyhow, Result};
use dns_lookup::lookup_host;
use lazy_static::lazy_static;
use regex::Regex;
use std::net::{IpAddr, Ipv4Addr};
use url::{Host, Url};

lazy_static! {
    // Simple patterns that match single ranges.
    static ref SIMPLE_RANGES: Regex = Regex::new(r"^(0|127|10|192\.168|169\.254)\..*").unwrap();

    // 172.16-31.x.x range.
    static ref RANGE_172: Regex = Regex::new(r"^172\.(1[6-9]|2[0-9]|3[0-1])\..*").unwrap();

    // 100.64-127.x.x range.
    static ref RANGE_100: Regex = Regex::new(r"^100\.(6[4-9]|7[0-9]|8[0-9]|9[0-9]|1[01][0-9]|12[0-7])\..*").unwrap();
}

pub struct NetworkUtils;

impl NetworkUtils {
    // Get all IPv4 addresses for a URL, either direct or through DNS resolution.
    pub fn get_ipv4_addresses(url: &str) -> Result<Vec<Ipv4Addr>> {
        let parsed_url = Url::parse(url)?;

        match parsed_url.host() {
            Some(h) => match h {
                Host::Domain(d) => {
                    let ipv4: Vec<Ipv4Addr> = lookup_host(d)?
                        .into_iter()
                        .filter_map(|ip| match ip {
                            IpAddr::V4(ip) => Some(ip),
                            _ => None,
                        })
                        .collect::<Vec<_>>();

                    match ipv4.len() {
                        0 => Err(anyhow!("Could not find an ipv4 address for host: {}", d)),
                        _ => Ok(ipv4),
                    }
                }
                Host::Ipv4(ip) => Ok(vec![ip]),
                Host::Ipv6(_) => Err(anyhow!("Ipv6 addresses are not supported.")),
            },
            None => Err(anyhow!("Provided URL has an empty host")),
        }
    }

    // Check if an IPv4 address is public (not in private ranges).
    pub fn check_ipv4_is_public(ip: Ipv4Addr) -> Result<()> {
        let ip_str = ip.to_string();
        if SIMPLE_RANGES.is_match(&ip_str)
            || RANGE_172.is_match(&ip_str)
            || RANGE_100.is_match(&ip_str)
        {
            Err(anyhow!("Forbidden IP range: {}", ip_str))
        } else {
            Ok(())
        }
    }

    // Check if a URL points to a private IP address.
    pub fn check_url_for_private_ip(url: &str) -> Result<()> {
        let ips = Self::get_ipv4_addresses(url)?;
        for ip in ips {
            Self::check_ipv4_is_public(ip)?;
        }
        Ok(())
    }
}
