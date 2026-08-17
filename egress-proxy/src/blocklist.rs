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
        || is_shared_ipv4(ip)
        // Explicitly block the well-known cloud metadata service address. This is already covered
        // by the link-local check above, but keeping it visible documents the SSRF risk.
        || ip == Ipv4Addr::new(169, 254, 169, 254)
}

fn is_unsafe_ipv6(ip: Ipv6Addr) -> bool {
    // Check native IPv6 addresses first because `extract_embedded_ipv4` maps `::1` to `0.0.0.1`.
    ip.is_loopback()
        || ip.is_unspecified()
        || is_unique_local_ipv6(ip)
        || is_unicast_link_local(ip)
        || extract_embedded_ipv4(ip).is_some_and(is_unsafe_ipv4)
}

fn is_shared_ipv4(ip: Ipv4Addr) -> bool {
    let [first, second, ..] = ip.octets();
    // RFC 6598 shared address space (100.64.0.0/10) is not globally routable.
    first == 100 && (second & 0xc0) == 0x40
}

fn extract_embedded_ipv4(ip: Ipv6Addr) -> Option<Ipv4Addr> {
    // Reachability still depends on the host network having the corresponding translator or
    // tunnel. Classify the standardized encodings here so a routing change cannot weaken the
    // proxy's SSRF boundary.
    if let Some(ipv4) = ip.to_ipv4() {
        return Some(ipv4);
    }

    match ip.octets() {
        // 6to4 (2002::/16) embeds the IPv4 destination immediately after the prefix.
        [0x20, 0x02, a, b, c, d, ..] => Some(Ipv4Addr::new(a, b, c, d)),
        // NAT64's well-known prefix (64:ff9b::/96) embeds the IPv4 destination at the end.
        [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0, a, b, c, d] => {
            Some(Ipv4Addr::new(a, b, c, d))
        }
        // Teredo (2001:0000::/32) stores the client IPv4 destination bitwise-inverted at the end.
        [0x20, 0x01, 0, 0, _, _, _, _, _, _, _, _, a, b, c, d] => {
            Some(Ipv4Addr::new(!a, !b, !c, !d))
        }
        _ => None,
    }
}

fn is_unique_local_ipv6(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

fn is_unicast_link_local(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xffc0) == 0xfe80
}

#[cfg(test)]
mod tests {
    use super::{extract_embedded_ipv4, is_globally_blocked_domain, is_unsafe_ip};
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

    #[test]
    fn blocks_doh_domains() {
        assert!(is_globally_blocked_domain("dns.google"));
        assert!(is_globally_blocked_domain("1.1.1.1"));
        assert!(!is_globally_blocked_domain("example.com"));
    }

    #[test]
    fn classifies_unsafe_ips() {
        for ipv4 in [
            Ipv4Addr::new(127, 0, 0, 1),
            Ipv4Addr::new(10, 0, 0, 1),
            Ipv4Addr::new(100, 100, 100, 200),
            Ipv4Addr::new(169, 254, 169, 254),
        ] {
            assert!(is_unsafe_ip(IpAddr::V4(ipv4)));
            assert!(is_unsafe_ip(IpAddr::V6(ipv4.to_ipv6_mapped())));
            assert!(is_unsafe_ip(IpAddr::V6(ipv4.to_ipv6_compatible())));
        }

        assert!(is_unsafe_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));

        let public_ipv4 = Ipv4Addr::new(93, 184, 216, 34);
        assert!(!is_unsafe_ip(IpAddr::V4(public_ipv4)));
        assert!(!is_unsafe_ip(IpAddr::V6(public_ipv4.to_ipv6_mapped())));
        assert!(!is_unsafe_ip(IpAddr::V6(public_ipv4.to_ipv6_compatible())));
    }

    #[test]
    fn classifies_ipv6_transition_addresses_by_their_embedded_ipv4() {
        for (value, expected) in [
            ("::ffff:127.0.0.1", Ipv4Addr::new(127, 0, 0, 1)),
            ("::127.0.0.1", Ipv4Addr::new(127, 0, 0, 1)),
            ("64:ff9b::a9fe:a9fe", Ipv4Addr::new(169, 254, 169, 254)),
            ("2002:c0a8:101::", Ipv4Addr::new(192, 168, 1, 1)),
            (
                "2001:0:dead:beef:0:ffff:80ff:fffe",
                Ipv4Addr::new(127, 0, 0, 1),
            ),
        ] {
            let ip = value
                .parse::<Ipv6Addr>()
                .expect("transition address should be valid IPv6");
            assert_eq!(extract_embedded_ipv4(ip), Some(expected), "{value}");
            assert!(is_unsafe_ip(IpAddr::V6(ip)), "{value}");
        }

        for (value, expected) in [
            ("64:ff9b::5db8:d822", Ipv4Addr::new(93, 184, 216, 34)),
            ("2002:5db8:d822::", Ipv4Addr::new(93, 184, 216, 34)),
            (
                "2001:0:dead:beef:0:ffff:a247:27dd",
                Ipv4Addr::new(93, 184, 216, 34),
            ),
        ] {
            let ip = value
                .parse::<Ipv6Addr>()
                .expect("transition address should be valid IPv6");
            assert_eq!(extract_embedded_ipv4(ip), Some(expected), "{value}");
            assert!(!is_unsafe_ip(IpAddr::V6(ip)), "{value}");
        }
    }

    #[test]
    fn blocks_shared_ipv4_space() {
        for value in ["100.64.0.0", "100.100.100.200", "100.127.255.255"] {
            let ip = value
                .parse::<Ipv4Addr>()
                .expect("shared address should be valid IPv4");
            assert!(is_unsafe_ip(IpAddr::V4(ip)), "{value}");
        }

        for value in ["100.63.255.255", "100.128.0.0"] {
            let ip = value
                .parse::<Ipv4Addr>()
                .expect("public address should be valid IPv4");
            assert!(!is_unsafe_ip(IpAddr::V4(ip)), "{value}");
        }
    }
}
