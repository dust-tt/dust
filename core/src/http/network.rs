use anyhow::{anyhow, Result};
use dns_lookup::lookup_host;
use lazy_static::lazy_static;
use regex::Regex;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
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
    // Get all IP addresses for a URL, either direct or through DNS resolution.
    pub fn get_ip_addresses(url: &str) -> Result<Vec<IpAddr>> {
        let parsed_url = Url::parse(url)?;

        match parsed_url.host() {
            Some(h) => match h {
                Host::Domain(d) => {
                    let ips = lookup_host(d)?;
                    match ips.len() {
                        0 => Err(anyhow!("Could not resolve any address for host: {}", d)),
                        _ => Ok(ips),
                    }
                }
                Host::Ipv4(ip) => Ok(vec![IpAddr::V4(ip)]),
                Host::Ipv6(ip) => Ok(vec![IpAddr::V6(ip)]),
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

    /// @cc [owner:frankaloia,label:security] ipv6-private-ranges
    /// `check_ipv6_is_public` MUST reject all private/non-routable IPv6 ranges:
    /// loopback (`::1`), ULA (`fc00::/7`, which includes `fd00::/8`), link-local
    /// (`fe80::/10`), unspecified (`::`), and IPv4-mapped addresses (`::ffff:x.x.x.x`)
    /// where the embedded IPv4 is itself private. Publicly routable IPv6 addresses
    /// MUST be allowed.
    pub fn check_ipv6_is_public(ip: Ipv6Addr) -> Result<()> {
        // Loopback: ::1
        if ip.is_loopback() {
            return Err(anyhow!("Forbidden IP range: {}", ip));
        }
        // Unspecified: ::
        if ip.is_unspecified() {
            return Err(anyhow!("Forbidden IP range: {}", ip));
        }
        let segments = ip.segments();
        // Link-local: fe80::/10
        if (segments[0] & 0xffc0) == 0xfe80 {
            return Err(anyhow!("Forbidden IP range: {}", ip));
        }
        // ULA (Unique Local Addresses): fc00::/7 (covers fc00::/8 and fd00::/8)
        if (segments[0] & 0xfe00) == 0xfc00 {
            return Err(anyhow!("Forbidden IP range: {}", ip));
        }
        // IPv4-mapped: ::ffff:0:0/96 — delegate to IPv4 check for the embedded address.
        if let Some(ipv4) = ip.to_ipv4_mapped() {
            return Self::check_ipv4_is_public(ipv4);
        }
        Ok(())
    }

    // Check if a URL points to a private IP address.
    pub fn check_url_for_private_ip(url: &str) -> Result<()> {
        let ips = Self::get_ip_addresses(url)?;
        for ip in ips {
            match ip {
                IpAddr::V4(ipv4) => Self::check_ipv4_is_public(ipv4)?,
                IpAddr::V6(ipv6) => Self::check_ipv6_is_public(ipv6)?,
            }
        }
        Ok(())
    }
}
