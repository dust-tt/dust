use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

const GLOBAL_BLOCKED_DOMAINS: &[&str] = &[
    // TODO(sandbox-egress): Move this list to the final managed policy/config path if we
    // need runtime updates without redeploying the proxy.
    "dns.google",
    "dns.google.com",
    "cloudflare-dns.com",
    "one.one.one.one",
    "1.1.1.1",
    "1.0.0.1",
    "dns.quad9.net",
    "doh.opendns.com",
    "dns.nextdns.io",
];

pub fn is_globally_blocked_domain(domain: &str) -> bool {
    // TODO(sandbox-egress): Nice-to-have policy decision before GCS policies ship: decide
    // whether global blocklist entries need suffix matching for provider-controlled subdomains.
    GLOBAL_BLOCKED_DOMAINS.contains(&domain)
}

pub fn is_unsafe_ip(ip: IpAddr) -> bool {
    // TODO(sandbox-egress): Add stable deny reason metrics for each blocked IP category.
    match ip {
        IpAddr::V4(ip) => is_unsafe_ipv4(ip),
        IpAddr::V6(ip) => is_unsafe_ipv6(ip),
    }
}

fn is_unsafe_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        // Explicitly block the well-known cloud metadata service address. This is already covered
        // by the link-local check above, but keeping it visible documents the SSRF risk.
        || ip == Ipv4Addr::new(169, 254, 169, 254)
}

fn is_unsafe_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped_ipv4) = ip.to_ipv4_mapped() {
        return is_unsafe_ipv4(mapped_ipv4);
    }

    ip.is_loopback() || ip.is_unspecified() || is_unique_local_ipv6(ip) || is_unicast_link_local(ip)
}

fn is_unique_local_ipv6(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

fn is_unicast_link_local(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xffc0) == 0xfe80
}

#[cfg(test)]
mod tests {
    use super::{is_globally_blocked_domain, is_unsafe_ip};
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    #[test]
    fn blocks_doh_domains() {
        assert!(is_globally_blocked_domain("dns.google"));
        assert!(is_globally_blocked_domain("1.1.1.1"));
        assert!(!is_globally_blocked_domain("example.com"));
    }

    #[test]
    fn classifies_unsafe_ips() {
        assert!(is_unsafe_ip(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))));
        assert!(is_unsafe_ip(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1))));
        assert!(is_unsafe_ip(IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254))));
        assert!(is_unsafe_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(is_unsafe_ip(IpAddr::V6(
            Ipv4Addr::new(127, 0, 0, 1).to_ipv6_mapped()
        )));
        assert!(is_unsafe_ip(IpAddr::V6(
            Ipv4Addr::new(10, 0, 0, 1).to_ipv6_mapped()
        )));
        assert!(is_unsafe_ip(IpAddr::V6(
            Ipv4Addr::new(169, 254, 169, 254).to_ipv6_mapped()
        )));
        assert!(!is_unsafe_ip(IpAddr::V4(Ipv4Addr::new(93, 184, 216, 34))));
    }
}
